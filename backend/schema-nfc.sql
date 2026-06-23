-- NFC Cards Module — standalone reference
-- (Also embedded in backend/src/init-db.js as step68NFC and auto-applied at boot)

CREATE TABLE IF NOT EXISTS nfc_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  uid VARCHAR(100) UNIQUE NOT NULL,
  chip_type VARCHAR(20) DEFAULT 'NTAG215',
  status VARCHAR(20) DEFAULT 'inactive',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  company_name VARCHAR(255),
  public_slug VARCHAR(20) UNIQUE NOT NULL,
  public_url TEXT,
  qr_code_url TEXT,
  plan VARCHAR(20) DEFAULT 'card',
  activated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nfc_card_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID UNIQUE REFERENCES nfc_cards(id) ON DELETE CASCADE NOT NULL,
  display_name VARCHAR(255), role_title VARCHAR(255),
  company_name VARCHAR(255), company_logo_url TEXT, company_description TEXT,
  photo_url TEXT, bio TEXT,
  phone VARCHAR(50), whatsapp VARCHAR(50), email VARCHAR(255),
  website TEXT, address TEXT,
  linkedin TEXT, instagram TEXT, facebook TEXT, youtube TEXT,
  theme JSONB DEFAULT '{}'::jsonb,
  meta_pixel_id VARCHAR(100), ga_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nfc_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  card_id UUID REFERENCES nfc_cards(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL, description TEXT,
  material_type VARCHAR(40) DEFAULT 'pdf',
  file_url TEXT NOT NULL, thumbnail_url TEXT,
  requires_lead BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nfc_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES nfc_cards(id) ON DELETE CASCADE NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip VARCHAR(64), city VARCHAR(120), state VARCHAR(120), country VARCHAR(120),
  device VARCHAR(60), browser VARCHAR(60), os VARCHAR(60),
  utm_source VARCHAR(120), utm_medium VARCHAR(120), utm_campaign VARCHAR(120),
  utm_term VARCHAR(120), utm_content VARCHAR(120),
  referrer TEXT, user_agent TEXT
);

CREATE TABLE IF NOT EXISTS nfc_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES nfc_cards(id) ON DELETE CASCADE NOT NULL,
  material_id UUID REFERENCES nfc_materials(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(50), email VARCHAR(255),
  company VARCHAR(255), role_title VARCHAR(255),
  utm_source VARCHAR(120), utm_medium VARCHAR(120), utm_campaign VARCHAR(120),
  ip VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfc_cards_org ON nfc_cards(organization_id);
CREATE INDEX IF NOT EXISTS idx_nfc_cards_user ON nfc_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_nfc_cards_slug ON nfc_cards(public_slug);
CREATE INDEX IF NOT EXISTS idx_nfc_reads_card ON nfc_reads(card_id);
CREATE INDEX IF NOT EXISTS idx_nfc_reads_at ON nfc_reads(read_at);
CREATE INDEX IF NOT EXISTS idx_nfc_leads_card ON nfc_leads(card_id);
CREATE INDEX IF NOT EXISTS idx_nfc_leads_org ON nfc_leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_nfc_materials_card ON nfc_materials(card_id);
CREATE INDEX IF NOT EXISTS idx_nfc_materials_org ON nfc_materials(organization_id);
