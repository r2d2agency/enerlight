-- ============================================
-- Supervisor IA: configuração de escopo por usuário
-- ============================================

CREATE TABLE IF NOT EXISTS supervisor_ia_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Escopo selecionado
  funnel_ids JSONB NOT NULL DEFAULT '[]'::jsonb,           -- UUIDs de crm_funnels
  homologation_board_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  licitacao_board_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,            -- crm_user_groups a checar
  user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,             -- usuários (vendedores) a checar
  representative_ids JSONB NOT NULL DEFAULT '[]'::jsonb,   -- representantes/indicadores a checar
  -- Critérios "card incompleto"
  rule_require_company BOOLEAN DEFAULT true,
  rule_require_value BOOLEAN DEFAULT true,
  rule_require_owner BOOLEAN DEFAULT true,
  rule_require_contact BOOLEAN DEFAULT true,
  rule_require_followup BOOLEAN DEFAULT true,
  rule_require_history BOOLEAN DEFAULT true,
  stale_hours INTEGER DEFAULT 72,                          -- "sem movimentar há X horas"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_supervisor_ia_configs_org ON supervisor_ia_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_ia_configs_user ON supervisor_ia_configs(user_id);
