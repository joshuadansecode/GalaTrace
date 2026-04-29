-- ============================================
-- GalaTrace — RLS Policies
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Tresoriere can insert expenses" ON expenses;
DROP POLICY IF EXISTS "Comptable can update expenses" ON expenses;
DROP POLICY IF EXISTS "Public read ticket types" ON ticket_types;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Active users can view profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can update any profile" ON profiles;
DROP POLICY IF EXISTS "User can update own profile" ON profiles;
DROP POLICY IF EXISTS "Anyone can read ticket types" ON ticket_types;
DROP POLICY IF EXISTS "Admin can manage quotas" ON quotas;
DROP POLICY IF EXISTS "Sellers can view own quotas" ON quotas;
DROP POLICY IF EXISTS "Sellers can insert own sales" ON sales;
DROP POLICY IF EXISTS "Sellers can view own sales" ON sales;
DROP POLICY IF EXISTS "Sellers can update own sales" ON sales;
DROP POLICY IF EXISTS "Admin can delete sales" ON sales;
DROP POLICY IF EXISTS "Authorized roles can insert payments" ON payments;
DROP POLICY IF EXISTS "Authorized roles can view payments" ON payments;
DROP POLICY IF EXISTS "Finance roles can manage transfers" ON cash_transfers;
DROP POLICY IF EXISTS "Finance roles can view expenses" ON expenses;
DROP POLICY IF EXISTS "Tresoriere can delete own pending expenses" ON expenses;
DROP POLICY IF EXISTS "Comptable can validate expenses" ON expenses;
DROP POLICY IF EXISTS "Authorized can view tables" ON tables;
DROP POLICY IF EXISTS "Admin and direction can manage tables" ON tables;
DROP POLICY IF EXISTS "Authorized can view seats" ON seats;
DROP POLICY IF EXISTS "Admin and direction can manage seats" ON seats;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: is current user active
CREATE OR REPLACE FUNCTION is_active_user()
RETURNS BOOLEAN AS $$
  SELECT is_active FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- ---- PROFILES ----
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Active users can view profiles" ON profiles
  FOR SELECT USING (is_active_user() = true);

CREATE POLICY "Admin can update any profile" ON profiles
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY "User can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id AND get_my_role() != 'admin');

-- ---- TICKET TYPES ----
DROP POLICY IF EXISTS "Public read ticket types" ON ticket_types;
CREATE POLICY "Anyone can read ticket types" ON ticket_types FOR SELECT USING (true);

-- ---- QUOTAS ----
CREATE POLICY "Admin can manage quotas" ON quotas
  FOR ALL USING (get_my_role() = 'admin');

CREATE POLICY "Sellers can view own quotas" ON quotas
  FOR SELECT USING (seller_id = auth.uid());

-- ---- SALES ----
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

-- ---- PAYMENTS ----
CREATE POLICY "Authorized roles can insert payments" ON payments
  FOR INSERT WITH CHECK (
    get_my_role() IN ('admin', 'vendeur', 'comite', 'tresoriere')
  );

CREATE POLICY "Authorized roles can view payments" ON payments
  FOR SELECT USING (
    get_my_role() IN ('admin', 'tresoriere', 'tresoriere_generale', 'direction') OR
    collector_id = auth.uid()
  );

-- ---- CASH TRANSFERS ----
CREATE POLICY "Finance roles can manage transfers" ON cash_transfers
  FOR ALL USING (
    get_my_role() IN ('admin', 'tresoriere', 'tresoriere_generale') OR
    from_id = auth.uid() OR to_id = auth.uid()
  );

-- ---- EXPENSES ----
CREATE POLICY "Tresoriere can insert expenses" ON expenses
  FOR INSERT WITH CHECK (get_my_role() = 'tresoriere');

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

-- ---- TABLES & SEATS ----
CREATE POLICY "Authorized can view tables" ON tables
  FOR SELECT USING (is_active_user() = true);

CREATE POLICY "Admin and direction can manage tables" ON tables
  FOR ALL USING (get_my_role() IN ('admin', 'direction'));

CREATE POLICY "Authorized can view seats" ON seats
  FOR SELECT USING (is_active_user() = true);

CREATE POLICY "Admin and direction can manage seats" ON seats
  FOR ALL USING (get_my_role() IN ('admin', 'direction'));
