-- Schema para permissões granulares por usuário
-- Cada usuário pode ter permissões individuais que sobrescrevem as do role

CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Atendimento
  can_view_chat BOOLEAN DEFAULT true,
  can_view_chatbots BOOLEAN DEFAULT false,
  can_view_flows BOOLEAN DEFAULT false,
  can_view_departments BOOLEAN DEFAULT false,
  can_view_schedules BOOLEAN DEFAULT false,
  can_view_tags BOOLEAN DEFAULT true,
  can_view_contacts BOOLEAN DEFAULT true,
  can_view_ai_secretary BOOLEAN DEFAULT false,
  can_view_ai_agents BOOLEAN DEFAULT false,

  -- CRM
  can_view_crm BOOLEAN DEFAULT true,
  can_view_prospects BOOLEAN DEFAULT true,
  can_view_companies BOOLEAN DEFAULT false,
  can_view_map BOOLEAN DEFAULT false,
  can_view_calendar BOOLEAN DEFAULT true,
  can_view_tasks BOOLEAN DEFAULT true,
  can_view_reports BOOLEAN DEFAULT false,
  can_view_revenue_intel BOOLEAN DEFAULT false,
  can_view_ghost BOOLEAN DEFAULT false,
  can_view_crm_settings BOOLEAN DEFAULT false,

  -- Projetos
  can_view_projects BOOLEAN DEFAULT false,

  -- Disparos
  can_view_campaigns BOOLEAN DEFAULT false,
  can_view_sequences BOOLEAN DEFAULT false,
  can_view_external_flows BOOLEAN DEFAULT false,
  can_view_webhooks BOOLEAN DEFAULT false,
  can_view_ctwa BOOLEAN DEFAULT false,

  -- Administração
  can_view_billing BOOLEAN DEFAULT false,
  can_view_connections BOOLEAN DEFAULT false,
  can_view_organizations BOOLEAN DEFAULT false,
  can_view_settings BOOLEAN DEFAULT true,

  -- Comunicação Interna
  can_view_internal_chat BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_org ON user_permissions(organization_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_user_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_permissions_updated_at ON user_permissions;
CREATE TRIGGER trigger_user_permissions_updated_at
  BEFORE UPDATE ON user_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_permissions_updated_at();
