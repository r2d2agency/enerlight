-- Representatives (Representantes) module
CREATE TABLE IF NOT EXISTS crm_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  cpf_cnpj VARCHAR(20),
  city VARCHAR(100),
  state VARCHAR(2),
  address TEXT,
  zip_code VARCHAR(10),
  commission_percent NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- vinculado a um vendedor
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_representatives_org ON crm_representatives(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_representatives_user ON crm_representatives(linked_user_id);

-- Link deals to representatives
ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS representative_id UUID REFERENCES crm_representatives(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deals_representative ON crm_deals(representative_id);
