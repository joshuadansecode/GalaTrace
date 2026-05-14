-- GalaTrace — Public QR retrieval for existing ticket holders

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS qr_token TEXT;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS qr_issued_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS qr_used_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS qr_used_by UUID REFERENCES profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS sales_qr_token_unique_idx
  ON sales (qr_token)
  WHERE qr_token IS NOT NULL;

-- Backfill QR tokens for tickets already fully paid
UPDATE sales s
SET
  qr_token = gen_random_uuid()::text,
  qr_issued_at = COALESCE(s.qr_issued_at, NOW())
WHERE (s.qr_token IS NULL OR btrim(s.qr_token) = '')
  AND btrim(COALESCE(s.ticket_number, '')) <> ''
  AND COALESCE((
    SELECT SUM(p.amount)
    FROM payments p
    WHERE p.sale_id = s.id
  ), 0) >= s.final_price;

CREATE OR REPLACE FUNCTION public_get_ticket_qr(
  p_ticket_type_id TEXT,
  p_ticket_number TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_type_id TEXT;
  v_ticket_number TEXT;
  v_sale sales%ROWTYPE;
  v_total_paid INTEGER;
BEGIN
  v_ticket_type_id := btrim(COALESCE(p_ticket_type_id, ''));
  v_ticket_number := btrim(COALESCE(p_ticket_number, ''));

  IF v_ticket_type_id = '' OR v_ticket_number = '' THEN
    RETURN jsonb_build_object('error', 'Ticket introuvable');
  END IF;

  SELECT *
  INTO v_sale
  FROM sales
  WHERE ticket_type_id = v_ticket_type_id
    AND lower(btrim(COALESCE(ticket_number, ''))) = lower(v_ticket_number)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Ticket introuvable');
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM payments
  WHERE sale_id = v_sale.id;

  IF v_total_paid < v_sale.final_price THEN
    RETURN jsonb_build_object('error', 'Ticket introuvable');
  END IF;

  IF v_sale.qr_token IS NULL OR btrim(v_sale.qr_token) = '' THEN
    UPDATE sales
    SET
      qr_token = gen_random_uuid()::text,
      qr_issued_at = COALESCE(qr_issued_at, NOW())
    WHERE id = v_sale.id
    RETURNING * INTO v_sale;
  ELSIF v_sale.qr_issued_at IS NULL THEN
    UPDATE sales
    SET qr_issued_at = NOW()
    WHERE id = v_sale.id
    RETURNING * INTO v_sale;
  END IF;

  RETURN jsonb_build_object(
    'sale_id', v_sale.id,
    'buyer_name', v_sale.buyer_name,
    'ticket_type_id', v_sale.ticket_type_id,
    'ticket_number', v_sale.ticket_number,
    'qr_token', v_sale.qr_token,
    'qr_issued_at', v_sale.qr_issued_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public_get_ticket_qr(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public_get_ticket_qr(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION checkin_ticket_qr(p_qr_payload TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_payload TEXT;
  v_token TEXT;
  v_sale sales%ROWTYPE;
  v_total_paid INTEGER;
  v_checked_in_at TIMESTAMP WITH TIME ZONE;
BEGIN
  v_role := get_my_role();
  IF v_role NOT IN ('admin', 'comite', 'tresoriere', 'tresoriere_generale', 'direction') THEN
    RETURN jsonb_build_object('status', 'forbidden', 'error', 'Rôle non autorisé pour le contrôle QR');
  END IF;

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

  SELECT *
  INTO v_sale
  FROM sales
  WHERE qr_token = v_token
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid', 'error', 'QR introuvable');
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM payments
  WHERE sale_id = v_sale.id;

  IF v_total_paid < v_sale.final_price THEN
    RETURN jsonb_build_object(
      'status', 'not_paid',
      'buyer_name', v_sale.buyer_name,
      'ticket_type_id', v_sale.ticket_type_id,
      'ticket_number', v_sale.ticket_number,
      'error', 'Ticket non soldé'
    );
  END IF;

  IF v_sale.qr_used_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_used',
      'buyer_name', v_sale.buyer_name,
      'ticket_type_id', v_sale.ticket_type_id,
      'ticket_number', v_sale.ticket_number,
      'used_at', v_sale.qr_used_at,
      'error', 'Ticket déjà utilisé'
    );
  END IF;

  UPDATE sales
  SET
    qr_used_at = NOW(),
    qr_used_by = auth.uid()
  WHERE id = v_sale.id
  RETURNING qr_used_at INTO v_checked_in_at;

  RETURN jsonb_build_object(
    'status', 'valid',
    'buyer_name', v_sale.buyer_name,
    'ticket_type_id', v_sale.ticket_type_id,
    'ticket_number', v_sale.ticket_number,
    'checked_in_at', v_checked_in_at
  );
EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object('status', 'error', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION checkin_ticket_qr(TEXT) TO authenticated;
