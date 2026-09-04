-- Portal de Representantes (rp_*) — módulo isolado
-- Não reaproveita crm_representatives / rep_portal_* / price_lists (módulo antigo, dados de produção).
-- Login e dados próprios, seguindo o mesmo padrão de isolamento do módulo EAD (ead_students/ead_brand_admins).
-- Este arquivo é documentação; a criação real acontece em backend/src/init-db.js (step72RepresentativesPortal),
-- executada automaticamente no boot do backend.

CREATE TABLE IF NOT EXISTS rp_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(40),
  password_hash TEXT,                             -- NULL até ativar a conta via link de convite
  status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | active | blocked
  invite_token_hash TEXT,                          -- sha256(token) — o token cru nunca é persistido
  invite_token_expires_at TIMESTAMPTZ,
  invite_token_purpose VARCHAR(20),                -- 'invite' | 'reset' (mesmo mecanismo para os 2 fluxos)
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rp_representatives_email_org_unique UNIQUE (organization_id, email)
);
CREATE INDEX IF NOT EXISTS idx_rp_representatives_org ON rp_representatives(organization_id);
CREATE INDEX IF NOT EXISTS idx_rp_representatives_email ON rp_representatives(lower(email));
CREATE INDEX IF NOT EXISTS idx_rp_representatives_invite_token ON rp_representatives(invite_token_hash) WHERE invite_token_hash IS NOT NULL;

-- Carteira de empresas/clientes do representante
CREATE TABLE IF NOT EXISTS rp_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES rp_representatives(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  document VARCHAR(20),
  email VARCHAR(200),
  phone VARCHAR(40),
  city VARCHAR(120),
  state VARCHAR(40),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rp_companies_rep ON rp_companies(representative_id);

-- Pedidos/vendas do representante, vinculados a uma empresa da carteira
CREATE TABLE IF NOT EXISTS rp_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  representative_id UUID NOT NULL REFERENCES rp_representatives(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES rp_companies(id) ON DELETE RESTRICT,
  order_number VARCHAR(60),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',     -- draft | confirmed | canceled
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  items JSONB NOT NULL DEFAULT '[]',               -- [{description, qty, unit_price}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rp_orders_rep ON rp_orders(representative_id);
CREATE INDEX IF NOT EXISTS idx_rp_orders_company ON rp_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_rp_orders_date ON rp_orders(order_date);
