-- GalaTrace — Remise de solde avec note obligatoire
-- Ajoute waived_at, waived_by, waived_reason sur la table sales
-- Quand waived_at IS NOT NULL → ticket considéré comme soldé même si total_paid < final_price

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS waived_at     TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS waived_by     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS waived_reason TEXT;   -- Note obligatoire expliquant pourquoi

-- Index pour filtrer facilement les ventes avec remise dans les rapports
CREATE INDEX IF NOT EXISTS sales_waived_idx ON sales (waived_at)
  WHERE waived_at IS NOT NULL;

-- Fonction sécurisée : classer une vente comme soldée avec note
CREATE OR REPLACE FUNCTION waive_sale_balance(
  p_sale_id UUID,
  p_reason  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       TEXT;
  v_sale       sales%ROWTYPE;
  v_total_paid INTEGER;
BEGIN
  v_role := get_my_role();

  -- Seuls vendeur propriétaire, comité, trésorière et admin
  IF v_role NOT IN ('admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  -- Note obligatoire
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RETURN jsonb_build_object('error', 'Une note explicative est obligatoire');
  END IF;

  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Vente introuvable');
  END IF;

  -- Vendeur ne peut classer que ses propres ventes
  IF v_role = 'vendeur' AND v_sale.seller_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  -- Déjà classé ?
  IF v_sale.waived_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Cette vente est déjà classée comme soldée');
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM payments
  WHERE sale_id = v_sale.id;

  -- Inutile de classer si déjà soldé normalement
  IF v_total_paid >= v_sale.final_price THEN
    RETURN jsonb_build_object('error', 'Ce ticket est déjà soldé normalement');
  END IF;

  UPDATE sales
  SET
    waived_at     = NOW(),
    waived_by     = auth.uid(),
    waived_reason = btrim(p_reason)
  WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'success',     true,
    'buyer_name',  v_sale.buyer_name,
    'total_paid',  v_total_paid,
    'final_price', v_sale.final_price,
    'gap',         v_sale.final_price - v_total_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION waive_sale_balance(UUID, TEXT) TO authenticated;

-- Fonction : annuler une remise (admin seulement)
CREATE OR REPLACE FUNCTION cancel_waive_balance(p_sale_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_my_role() <> 'admin' THEN
    RETURN jsonb_build_object('error', 'Accès refusé — admin uniquement');
  END IF;

  UPDATE sales
  SET waived_at = NULL, waived_by = NULL, waived_reason = NULL
  WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_waive_balance(UUID) TO authenticated;
