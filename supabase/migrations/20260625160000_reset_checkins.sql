-- GalaTrace — Réinitialisation des scans (admin uniquement)
-- Si p_sale_id est fourni → reset d'un seul ticket
-- Si p_sale_id est NULL  → reset global de tous les tickets

CREATE OR REPLACE FUNCTION reset_checkins(p_sale_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RETURN jsonb_build_object('error', 'Accès refusé — admin uniquement');
  END IF;

  IF p_sale_id IS NOT NULL THEN
    -- Reset d'un seul ticket
    UPDATE sales
    SET qr_used_at = NULL,
        qr_used_by = NULL
    WHERE id = p_sale_id
      AND qr_used_at IS NOT NULL;
  ELSE
    -- Reset global
    UPDATE sales
    SET qr_used_at = NULL,
        qr_used_by = NULL
    WHERE qr_used_at IS NOT NULL;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'reset_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION reset_checkins(UUID) TO authenticated;
