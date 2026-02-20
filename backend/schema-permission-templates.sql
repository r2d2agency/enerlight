-- Schema para templates de permissão gerenciáveis pelo admin

CREATE TABLE IF NOT EXISTS permission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'Users',
  permissions JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_templates_sort ON permission_templates(sort_order);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_permission_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_permission_templates_updated_at ON permission_templates;
CREATE TRIGGER trigger_permission_templates_updated_at
  BEFORE UPDATE ON permission_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_permission_templates_updated_at();

-- Insert default templates
INSERT INTO permission_templates (name, description, icon, permissions, is_default, sort_order)
VALUES
  ('Vendedor', 'Chat, CRM básico, contatos e tarefas', 'UserCheck', 
   '{"can_view_chat":true,"can_view_chatbots":false,"can_view_flows":false,"can_view_departments":false,"can_view_schedules":true,"can_view_tags":true,"can_view_contacts":true,"can_view_ai_secretary":false,"can_view_ai_agents":false,"can_view_crm":true,"can_view_prospects":true,"can_view_companies":true,"can_view_map":true,"can_view_calendar":true,"can_view_tasks":true,"can_view_reports":false,"can_view_revenue_intel":false,"can_view_ghost":false,"can_view_crm_settings":false,"can_view_projects":false,"can_view_campaigns":false,"can_view_sequences":false,"can_view_external_flows":false,"can_view_webhooks":false,"can_view_ctwa":false,"can_view_billing":false,"can_view_connections":false,"can_view_organizations":false,"can_view_settings":true}',
   true, 1),
  ('Gerente', 'Tudo do vendedor + relatórios, projetos e departamentos', 'Briefcase',
   '{"can_view_chat":true,"can_view_chatbots":true,"can_view_flows":true,"can_view_departments":true,"can_view_schedules":true,"can_view_tags":true,"can_view_contacts":true,"can_view_ai_secretary":false,"can_view_ai_agents":true,"can_view_crm":true,"can_view_prospects":true,"can_view_companies":true,"can_view_map":true,"can_view_calendar":true,"can_view_tasks":true,"can_view_reports":true,"can_view_revenue_intel":true,"can_view_ghost":false,"can_view_crm_settings":true,"can_view_projects":true,"can_view_campaigns":true,"can_view_sequences":true,"can_view_external_flows":true,"can_view_webhooks":true,"can_view_ctwa":true,"can_view_billing":false,"can_view_connections":false,"can_view_organizations":false,"can_view_settings":true}',
   true, 2),
  ('Administrador', 'Acesso total a todos os módulos', 'Crown',
   '{"can_view_chat":true,"can_view_chatbots":true,"can_view_flows":true,"can_view_departments":true,"can_view_schedules":true,"can_view_tags":true,"can_view_contacts":true,"can_view_ai_secretary":true,"can_view_ai_agents":true,"can_view_crm":true,"can_view_prospects":true,"can_view_companies":true,"can_view_map":true,"can_view_calendar":true,"can_view_tasks":true,"can_view_reports":true,"can_view_revenue_intel":true,"can_view_ghost":true,"can_view_crm_settings":true,"can_view_projects":true,"can_view_campaigns":true,"can_view_sequences":true,"can_view_external_flows":true,"can_view_webhooks":true,"can_view_ctwa":true,"can_view_billing":true,"can_view_connections":true,"can_view_organizations":true,"can_view_settings":true}',
   true, 3)
ON CONFLICT DO NOTHING;
