-- SQL Schema for GalaTrace (Supabase)

-- 1. Profiles (linked to auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'vendeur', 'comite', 'tresoriere', 'tresoriere_generale', 'direction', 'observateur')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Ticket Types
CREATE TABLE ticket_types (
  id TEXT PRIMARY KEY, -- e.g. 'gold_interne'
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  public_type TEXT NOT NULL -- 'Etudiants', 'Externes', 'Administration'
);

INSERT INTO ticket_types (id, name, price, public_type) VALUES
('gold_interne', 'Gold Interne', 10000, 'Étudiants'),
('platinum_interne', 'Platinum Interne', 12000, 'Étudiants'),
('diamond_interne', 'Diamond Interne', 15000, 'Étudiants'),
('gold_externe', 'Gold Externe', 15000, 'Externes'),
('diamond_externe', 'Diamond Externe', 20000, 'Externes'),
('royal', 'Royal', 25000, 'Administration');

-- 3. Quotas (Carnets remis physiquement)
CREATE TABLE quotas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES profiles(id) NOT NULL,
  ticket_type_id TEXT REFERENCES ticket_types(id) NOT NULL,
  quantity_given INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Sales (Distributions)
CREATE TABLE sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  ticket_type_id TEXT REFERENCES ticket_types(id) NOT NULL,
  base_price INTEGER NOT NULL,
  discount_amount INTEGER DEFAULT 0,
  discount_source TEXT, -- 'BDE', 'Administration'
  final_price INTEGER NOT NULL, -- base_price - discount_amount
  seller_id UUID REFERENCES profiles(id) NOT NULL,
  notes TEXT, -- Pour le placement
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Payments (Versements des clients)
CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  collector_id UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Cash Transfers (Versement Caisse)
CREATE TABLE cash_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id UUID REFERENCES profiles(id) NOT NULL,
  to_id UUID REFERENCES profiles(id) NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'valide', 'rejete')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Tables & Seats
CREATE TABLE tables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE seats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID REFERENCES tables(id) ON DELETE CASCADE NOT NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  seat_number INTEGER NOT NULL,
  UNIQUE(table_id, seat_number)
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;

-- Simple policies (to be refined)
CREATE POLICY "Public read ticket types" ON ticket_types FOR SELECT USING (true);
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
