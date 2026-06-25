-- GalaTrace — checkin_ticket_qr v3
-- Améliorations :
--   • Retourne table_name + seat_number pour guider l'invité vers sa place
--   • Retourne scanner_name (profil de l'agent qui a fait le premier scan)
--   • Retourne scanner_name dans le cas already_used pour identifier l'intrus

CREATE OR REPLACE FUNCTION checkin_ticket_qr(p_qr_payload TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role          TEXT;
  v_payload       TEXT;
  v_token         TEXT;
  v_sale          sales%ROWTYPE;
  v_total_paid    INTEGER;
  v_checked_in_at TIMESTAMP WITH TIME ZONE;
  v_table_name    TEXT;
  v_seat_number   INTEGER;
  v_scanner_name  TEXT;   -- nom de l'agent qui a DÉJÀ scanné (cas already_used)
BEGIN
  -- ── Vérification du rôle ──────────────────────────────────────────────────
  v_role := get_my_role();
  IF v_role NOT IN ('admin', 'comite', 'tresoriere', 'tresoriere_generale', 'direction') THEN
    RETURN jsonb_build_object('status', 'forbidden', 'error', 'Rôle non autorisé pour le contrôle QR');
  END IF;

  -- ── Extraction du token ───────────────────────────────────────────────────
  v_payload := btrim(COALESCE(p_qr_payload, ''));
  IF v_payload = '' THEN
    RETURN jsonb_build_object('status', 'invalid', 'error', 'QR invalide');
  END IF;

  IF upper(v_payload) LIKE 'GALATRACE:%' THEN
    v_token := btrim(substring(v_payload FROM char_length('GALATRACE:') + 1));
  ELSIF position('token=' IN lower(v_payload)) > 0 THEN
    v_token := substring(v_payload FROM '(?i)(?:[?&]token=)([^&#]+)');
    v_token := btrim(COALESCE(v_token, ''));
  ELSE
    v_token := v_payload;
  END IF;

  IF v_token = '' THEN
    RETURN jsonb_build_object('status', 'invalid', 'error', 'QR invalide');
  END IF;

  -- ── Recherche de la vente ─────────────────────────────────────────────────
  SELECT * INTO v_sale
  FROM sales
  WHERE qr_token = v_token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid', 'error', 'QR introuvable');
  END IF;

  -- ── Récupération de la place assignée ─────────────────────────────────────
  SELECT
    t.name,
    s.seat_number
  INTO v_table_name, v_seat_number
  FROM seats s
  JOIN tables t ON t.id = s.table_id
  WHERE s.sale_id = v_sale.id
  LIMIT 1;

  -- ── Vérification du paiement ──────────────────────────────────────────────
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM payments
  WHERE sale_id = v_sale.id;

  IF v_total_paid < v_sale.final_price THEN
    RETURN jsonb_build_object(
      'status',         'not_paid',
      'buyer_name',     v_sale.buyer_name,
      'ticket_type_id', v_sale.ticket_type_id,
      'ticket_number',  v_sale.ticket_number,
      'error',          'Ticket non soldé'
    );
  END IF;

  -- ── Cas : ticket déjà utilisé ─────────────────────────────────────────────
  IF v_sale.qr_used_at IS NOT NULL THEN
    -- Récupérer le nom de l'agent qui a fait le premier scan
    SELECT COALESCE(p.full_name, p.email, 'Agent inconnu')
    INTO v_scanner_name
    FROM profiles p
    WHERE p.id = v_sale.qr_used_by;

    RETURN jsonb_build_object(
      'status',         'already_used',
      'buyer_name',     v_sale.buyer_name,
      'ticket_type_id', v_sale.ticket_type_id,
      'ticket_number',  v_sale.ticket_number,
      'used_at',        v_sale.qr_used_at,
      'scanner_name',   COALESCE(v_scanner_name, 'Agent inconnu'),
      'table_name',     v_table_name,
      'seat_number',    v_seat_number,
      'error',          'Ticket déjà utilisé'
    );
  END IF;

  -- ── Validation : marquer l'entrée ─────────────────────────────────────────
  UPDATE sales
  SET
    qr_used_at  = NOW(),
    qr_used_by  = auth.uid()
  WHERE id = v_sale.id
  RETURNING qr_used_at INTO v_checked_in_at;

  RETURN jsonb_build_object(
    'status',         'valid',
    'buyer_name',     v_sale.buyer_name,
    'ticket_type_id', v_sale.ticket_type_id,
    'ticket_number',  v_sale.ticket_number,
    'checked_in_at',  v_checked_in_at,
    'table_name',     v_table_name,
    'seat_number',    v_seat_number
  );

EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object('status', 'error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION checkin_ticket_qr(TEXT) TO authenticated;
