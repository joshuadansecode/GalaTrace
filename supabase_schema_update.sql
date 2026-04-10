-- GalaTrace Schema Update — Ajout table expenses

CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,           -- Nom du bénéficiaire/prestataire
  amount INTEGER NOT NULL,
  payment_status TEXT DEFAULT 'non_reglee' CHECK (payment_status IN ('reglee', 'non_reglee')),
  validation_status TEXT DEFAULT 'en_attente' CHECK (validation_status IN ('en_attente', 'validee', 'rejetee')),
  created_by UUID REFERENCES profiles(id) NOT NULL,   -- Trésorière Générale
  validated_by UUID REFERENCES profiles(id),          -- Comptable
  validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Expenses viewable by authorized roles" ON expenses FOR SELECT USING (true);
CREATE POLICY "Tresoriere can insert expenses" ON expenses FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Comptable can update expenses" ON expenses FOR UPDATE USING (true);

-- Ajout numéro de ticket sur les ventes
ALTER TABLE sales ADD COLUMN IF NOT EXISTS ticket_number TEXT;

-- Ajout catégorie sur les tables
ALTER TABLE tables ADD COLUMN IF NOT EXISTS category TEXT;
