-- GalaTrace - QR retrieval: add phone last-4-digits verification
-- Remplace la fonction public_get_ticket_qr pour exiger les 4 derniers
-- chiffres du numero WhatsApp de l'acheteur en plus du type + numero ticket.

-- Suppression de l'ancienne version si elle existe (ignore si absente)
DROP FUNCTION IF EXISTS public_get_ticket_qr(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public_get_ticket_qr(
  p_ticket_type_id  TEXT,
  p_ticket_number   TEXT,
  p_phone_last_four TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_type_id     TEXT;
  v_ticket_number      TEXT;
  v_phone_suffix       TEXT;
  v_sale               sales%ROWTYPE;
  v_total_paid         INTEGER;
  v_buyer_phone_digits TEXT;
BEGIN
  v_ticket_type_id  := btrim(COALESCE(p_ticket_type_id, ''));
  v_ticket_number   := btrim(COALESCE(p_ticket_number, ''));
  v_phone_suffix    := regexp_replace(btrim(COALESCE(p_phone_last_four, '')), '\D', '', 'g');

  IF v_ticket_type_id = '' OR v_ticket_number = '' OR length(v_phone_suffix) <> 4 THEN
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

  v_buyer_phone_digits := regexp_replace(COALESCE(v_sale.buyer_phone, ''), '\D', '', 'g');

  IF length(v_buyer_phone_digits) < 4
     OR right(v_buyer_phone_digits, 4) <> v_phone_suffix
  THEN
    RETURN jsonb_build_object('error', 'Ticket introuvable');
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM payments
  WHERE sale_id = v_sale.id;

  IF v_total_paid < v_sale.final_price THEN
    RETURN jsonb_build_object(
      'error',       'not_paid',
      'buyer_name',  v_sale.buyer_name,
      'final_price', v_sale.final_price,
      'total_paid',  v_total_paid,
      'remaining',   v_sale.final_price - v_total_paid
    );
  END IF;

  IF v_sale.qr_token IS NULL OR btrim(v_sale.qr_token) = '' THEN
    UPDATE sales
    SET
      qr_token     = gen_random_uuid()::text,
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
    'sale_id',        v_sale.id,
    'buyer_name',     v_sale.buyer_name,
    'ticket_type_id', v_sale.ticket_type_id,
    'ticket_number',  v_sale.ticket_number,
    'qr_token',       v_sale.qr_token,
    'qr_issued_at',   v_sale.qr_issued_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public_get_ticket_qr(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public_get_ticket_qr(TEXT, TEXT, TEXT) TO authenticated;
