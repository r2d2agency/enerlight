-- Sales Goals / Metas de Vendas
CREATE TABLE IF NOT EXISTS crm_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'individual', -- 'individual' or 'group'
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- for individual goals
  target_group_id UUID REFERENCES crm_user_groups(id) ON DELETE CASCADE, -- for group goals
  metric VARCHAR(50) NOT NULL, -- 'new_deals', 'closed_deals', 'won_value', 'new_clients', 'recurring_clients'
  target_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  period VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly'
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_goals_org ON crm_goals(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_goals_user ON crm_goals(target_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_goals_group ON crm_goals(target_group_id);
