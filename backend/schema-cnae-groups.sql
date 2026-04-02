-- CNAE Groups for CRM Companies
-- Add cnae_principal column to crm_companies if not exists
ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS cnae_principal VARCHAR(255);

-- CNAE Groups table - allows grouping multiple CNAE codes under a label
CREATE TABLE IF NOT EXISTS crm_cnae_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    cnae_codes JSONB NOT NULL DEFAULT '[]',
    color VARCHAR(20) DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_cnae_groups_org ON crm_cnae_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_cnae ON crm_companies(cnae_principal);
