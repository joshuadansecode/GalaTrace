-- GalaTrace — Finance, admin invitations, and expense safeguards

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---- PROFILE SUPPORT ----
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pending_changes JSONB;

-- ---- EXPENSES SCHEMA ----
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS submission_token TEXT;

UPDATE expenses
SET submission_token = COALESCE(submission_token, gen_random_uuid()::text)
WHERE submission_token IS NULL OR btrim(submission_token) = '';

ALTER TABLE expenses
  ALTER COLUMN submission_token SET DEFAULT gen_random_uuid()::text;

ALTER TABLE expenses
  ALTER COLUMN submission_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_submission_token_idx
  ON expenses (submission_token);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deletion_status TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deletion_requested_by UUID REFERENCES profiles(id);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deletion_counterpart_approved_by UUID REFERENCES profiles(id);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deletion_counterpart_approved_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deletion_admin_approved_by UUID REFERENCES profiles(id);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deletion_admin_approved_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_deletion_status_check'
      AND conrelid = 'expenses'::regclass
  ) THEN
    ALTER TABLE expenses DROP CONSTRAINT expenses_deletion_status_check;
  END IF;
END $$;

ALTER TABLE expenses
  ADD CONSTRAINT expenses_deletion_status_check
  CHECK (deletion_status IN ('en_attente_counterpart', 'en_attente_admin'));

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- ---- HELPER FUNCTIONS ----
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT is_active FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- ---- POLICIES ----
DROP POLICY IF EXISTS "Tresoriere can insert expenses" ON expenses;
DROP POLICY IF EXISTS "Comptable can update expenses" ON expenses;
DROP POLICY IF EXISTS "Expenses viewable by authorized roles" ON expenses;
DROP POLICY IF EXISTS "Finance roles can view expenses" ON expenses;
DROP POLICY IF EXISTS "Tresoriere can delete own pending expenses" ON expenses;
DROP POLICY IF EXISTS "Admin and creator can delete pending expenses" ON expenses;
DROP POLICY IF EXISTS "Comptable can validate expenses" ON expenses;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Active users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can update any profile" ON profiles;
DROP POLICY IF EXISTS "User can update own profile" ON profiles;
DROP POLICY IF EXISTS "Anyone can read ticket types" ON ticket_types;
DROP POLICY IF EXISTS "Public read ticket types" ON ticket_types;
DROP POLICY IF EXISTS "Admin can manage quotas" ON quotas;
DROP POLICY IF EXISTS "Sellers can view own quotas" ON quotas;
DROP POLICY IF EXISTS "Sellers can insert own sales" ON sales;
DROP POLICY IF EXISTS "Sellers can view own sales" ON sales;
DROP POLICY IF EXISTS "Sellers can update own sales" ON sales;
DROP POLICY IF EXISTS "Admin can delete sales" ON sales;
DROP POLICY IF EXISTS "Authorized roles can insert payments" ON payments;
DROP POLICY IF EXISTS "Authorized roles can view payments" ON payments;
DROP POLICY IF EXISTS "Finance roles can manage transfers" ON cash_transfers;
DROP POLICY IF EXISTS "Authorized can view tables" ON tables;
DROP POLICY IF EXISTS "Admin and direction can manage tables" ON tables;
DROP POLICY IF EXISTS "Authorized can view seats" ON seats;
DROP POLICY IF EXISTS "Admin and direction can manage seats" ON seats;

CREATE POLICY "Active users can view profiles" ON profiles
  FOR SELECT USING (is_active_user() = true);

CREATE POLICY "Admin can update any profile" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "User can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id AND get_my_role() != 'admin');

CREATE POLICY "Anyone can read ticket types" ON ticket_types
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage quotas" ON quotas
  FOR ALL USING (get_my_role() = 'admin');

CREATE POLICY "Sellers can view own quotas" ON quotas
  FOR SELECT USING (seller_id = auth.uid());

CREATE POLICY "Sellers can insert own sales" ON sales
  FOR INSERT WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Sellers can view own sales" ON sales
  FOR SELECT USING (
    seller_id = auth.uid() OR
    get_my_role() IN ('admin', 'tresoriere', 'tresoriere_generale', 'direction', 'comite', 'observateur')
  );

CREATE POLICY "Sellers can update own sales" ON sales
  FOR UPDATE USING (
    seller_id = auth.uid() OR get_my_role() = 'admin'
  );

CREATE POLICY "Admin can delete sales" ON sales
  FOR DELETE USING (
    seller_id = auth.uid() OR get_my_role() = 'admin'
  );

CREATE POLICY "Authorized roles can insert payments" ON payments
  FOR INSERT WITH CHECK (
    get_my_role() IN ('admin', 'vendeur', 'comite', 'tresoriere')
  );

CREATE POLICY "Authorized roles can view payments" ON payments
  FOR SELECT USING (
    get_my_role() IN ('admin', 'tresoriere', 'tresoriere_generale', 'direction') OR
    collector_id = auth.uid()
  );

CREATE POLICY "Finance roles can manage transfers" ON cash_transfers
  FOR ALL USING (
    get_my_role() IN ('admin', 'tresoriere', 'tresoriere_generale') OR
    from_id = auth.uid() OR to_id = auth.uid()
  );

CREATE POLICY "Tresoriere can insert expenses" ON expenses
  FOR INSERT WITH CHECK (get_my_role() IN ('tresoriere', 'admin'));

CREATE POLICY "Finance roles can view expenses" ON expenses
  FOR SELECT USING (
    get_my_role() IN ('admin', 'tresoriere', 'tresoriere_generale', 'direction')
  );

CREATE POLICY "Admin and creator can delete pending expenses" ON expenses
  FOR DELETE USING (
    validation_status = 'en_attente' AND (
      created_by = auth.uid() OR get_my_role() = 'admin'
    )
  );

CREATE POLICY "Comptable can validate expenses" ON expenses
  FOR UPDATE USING (
    get_my_role() IN ('admin', 'tresoriere_generale')
  );

CREATE POLICY "Authorized can view tables" ON tables
  FOR SELECT USING (is_active_user() = true);

CREATE POLICY "Admin and direction can manage tables" ON tables
  FOR ALL USING (get_my_role() IN ('admin', 'direction'));

CREATE POLICY "Authorized can view seats" ON seats
  FOR SELECT USING (is_active_user() = true);

CREATE POLICY "Admin and direction can manage seats" ON seats
  FOR ALL USING (get_my_role() IN ('admin', 'direction'));

-- ---- EXPENSE WORKFLOWS ----
CREATE OR REPLACE FUNCTION create_expense_submission(
  p_title TEXT,
  p_author TEXT,
  p_amount INTEGER,
  p_payment_status TEXT,
  p_submission_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_expense_id UUID;
BEGIN
  v_role := get_my_role();

  IF v_role NOT IN ('tresoriere', 'admin') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  IF p_payment_status NOT IN ('reglee', 'non_reglee') THEN
    RETURN jsonb_build_object('error', 'Statut de paiement invalide');
  END IF;

  IF p_submission_token IS NULL OR btrim(p_submission_token) = '' THEN
    RETURN jsonb_build_object('error', 'Jeton de soumission manquant');
  END IF;

  IF EXISTS (SELECT 1 FROM expenses WHERE submission_token = p_submission_token) THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  INSERT INTO expenses (
    title,
    author,
    amount,
    submission_token,
    payment_status,
    created_by
  ) VALUES (
    p_title,
    p_author,
    p_amount,
    p_submission_token,
    p_payment_status,
    auth.uid()
  )
  RETURNING id INTO v_expense_id;

  RETURN jsonb_build_object('duplicate', false, 'id', v_expense_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('duplicate', true);
END;
$$;

CREATE OR REPLACE FUNCTION update_recent_expense(
  p_expense_id UUID,
  p_title TEXT,
  p_author TEXT,
  p_amount INTEGER,
  p_payment_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
  v_role TEXT;
BEGIN
  v_role := get_my_role();

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  IF v_expense.validation_status <> 'en_attente' THEN
    RETURN jsonb_build_object('error', 'Dépense déjà validée');
  END IF;

  IF v_role <> 'admin' AND v_expense.created_by <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'Modification réservée au créateur');
  END IF;

  IF v_role <> 'admin' AND NOW() - v_expense.created_at > INTERVAL '1 minute' THEN
    RETURN jsonb_build_object('error', 'Fenêtre de modification expirée');
  END IF;

  IF p_payment_status NOT IN ('reglee', 'non_reglee') THEN
    RETURN jsonb_build_object('error', 'Statut de paiement invalide');
  END IF;

  UPDATE expenses
  SET
    title = p_title,
    author = p_author,
    amount = p_amount,
    payment_status = p_payment_status
  WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION validate_expense(
  p_expense_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
BEGIN
  IF get_my_role() NOT IN ('admin', 'tresoriere_generale') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  IF p_status NOT IN ('validee', 'rejetee') THEN
    RETURN jsonb_build_object('error', 'Statut invalide');
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  UPDATE expenses
  SET
    validation_status = p_status,
    validated_by = auth.uid(),
    validated_at = NOW()
  WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION request_expense_payment_change(
  p_expense_id UUID,
  p_target_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
BEGIN
  IF get_my_role() NOT IN ('admin', 'tresoriere', 'tresoriere_generale') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  IF p_target_status NOT IN ('reglee', 'non_reglee') THEN
    RETURN jsonb_build_object('error', 'Statut de paiement invalide');
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  IF v_expense.payment_status = p_target_status THEN
    RETURN jsonb_build_object('error', 'La dépense est déjà dans cet état');
  END IF;

  IF v_expense.payment_status_pending IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Une demande de changement est déjà en attente');
  END IF;

  UPDATE expenses
  SET
    payment_status_pending = p_target_status,
    payment_status_requested_by = auth.uid(),
    payment_status_requested_at = NOW(),
    payment_status_confirmed_by = NULL,
    payment_status_confirmed_at = NULL
  WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION confirm_expense_payment_change(p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
BEGIN
  IF get_my_role() NOT IN ('admin', 'tresoriere', 'tresoriere_generale') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  IF v_expense.payment_status_pending IS NULL THEN
    RETURN jsonb_build_object('error', 'Aucune validation en attente');
  END IF;

  IF v_expense.payment_status_requested_by = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Vous devez attendre la validation de l’autre rôle');
  END IF;

  UPDATE expenses
  SET
    payment_status = v_expense.payment_status_pending,
    payment_status_pending = NULL,
    payment_status_requested_by = NULL,
    payment_status_requested_at = NULL,
    payment_status_confirmed_by = auth.uid(),
    payment_status_confirmed_at = NOW()
  WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION reject_expense_payment_change(p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
BEGIN
  IF get_my_role() NOT IN ('admin', 'tresoriere', 'tresoriere_generale') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  IF v_expense.payment_status_pending IS NULL THEN
    RETURN jsonb_build_object('error', 'Aucune validation en attente');
  END IF;

  IF v_expense.payment_status_requested_by = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Vous devez attendre la validation de l’autre rôle');
  END IF;

  UPDATE expenses
  SET
    payment_status_pending = NULL,
    payment_status_requested_by = NULL,
    payment_status_requested_at = NULL,
    payment_status_confirmed_by = NULL,
    payment_status_confirmed_at = NULL
  WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION request_expense_deletion(p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
  v_role TEXT;
BEGIN
  v_role := get_my_role();

  IF v_role NOT IN ('tresoriere', 'tresoriere_generale', 'admin') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  IF v_expense.validation_status <> 'validee' THEN
    RETURN jsonb_build_object('error', 'La suppression à double validation concerne uniquement une dépense validée');
  END IF;

  IF v_expense.deletion_status IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Une demande de suppression est déjà en cours');
  END IF;

  UPDATE expenses
  SET
    deletion_status = 'en_attente_counterpart',
    deletion_requested_by = auth.uid(),
    deletion_requested_at = NOW(),
    deletion_counterpart_approved_by = NULL,
    deletion_counterpart_approved_at = NULL,
    deletion_admin_approved_by = NULL,
    deletion_admin_approved_at = NULL
  WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION approve_expense_deletion_counterpart(p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
  v_role TEXT;
BEGIN
  v_role := get_my_role();

  IF v_role NOT IN ('tresoriere', 'tresoriere_generale') THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  IF v_expense.deletion_status <> 'en_attente_counterpart' THEN
    RETURN jsonb_build_object('error', 'Aucune validation contrepartie attendue');
  END IF;

  IF v_expense.deletion_requested_by = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Vous devez attendre la validation de l’autre rôle');
  END IF;

  UPDATE expenses
  SET
    deletion_status = 'en_attente_admin',
    deletion_counterpart_approved_by = auth.uid(),
    deletion_counterpart_approved_at = NOW()
  WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION approve_expense_deletion_admin(p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense expenses%ROWTYPE;
BEGIN
  IF get_my_role() <> 'admin' THEN
    RETURN jsonb_build_object('error', 'Accès refusé');
  END IF;

  SELECT * INTO v_expense
  FROM expenses
  WHERE id = p_expense_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Dépense introuvable');
  END IF;

  IF v_expense.deletion_status <> 'en_attente_admin' THEN
    RETURN jsonb_build_object('error', 'Aucune validation admin attendue');
  END IF;

  DELETE FROM expenses WHERE id = p_expense_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION create_expense_submission(TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_recent_expense(UUID, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_expense(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION request_expense_payment_change(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_expense_payment_change(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_expense_payment_change(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION request_expense_deletion(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_expense_deletion_counterpart(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_expense_deletion_admin(UUID) TO authenticated;

-- ---- SUPPORTING COLUMNS ----
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS ticket_number TEXT;

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS category TEXT;
