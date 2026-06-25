-- GalaTrace — Correction du prix final d'une vente existante
-- Accessible : vendeur propriétaire de la vente + admin
-- Conditions : la vente ne doit pas déjà avoir un QR utilisé (entrée validée)

CREATE OR REPLACE FUNCTION correct_sale_price(
  p_sale_id        UUID,
  p_discount_amount INTEGER,
  p_discount_source TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role       TEXT;
  v_sale       sales%ROWTYPE;
  v_new_final  INTEGER;
BEGIN
  v_role := get_my_role();

  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Vente introuvable');
  END IF;

  -- Seul le vendeur propriétaire ou un admin peut modifier
  IF v_role <> 'admin' AND v_sale.seller_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  -- Bloquer si l'invité est déjà entré (QR utilisé)
  IF v_sale.qr_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Impossible de modifier le prix : cet invité est déjà entré');
  END IF;

  -- Validation de la réduction
  IF p_discount_amount < 0 THEN
    RETURN jsonb_build_object('error', 'La réduction ne peut pas être négative');
  END IF;

  v_new_final := v_sale.base_price - p_discount_amount;

  IF v_new_final < 0 THEN
    RETURN jsonb_build_object('error', 'La réduction dépasse le prix de base');
  END IF;

  UPDATE sales
  SET
    discount_amount = p_discount_amount,
    discount_source = NULLIF(btrim(COALESCE(p_discount_source, '')), ''),
    final_price     = v_new_final
  WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'success',     true,
    'old_final',   v_sale.final_price,
    'new_final',   v_new_final,
    'discount',    p_discount_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION correct_sale_price(UUID, INTEGER, TEXT) TO authenticated;
