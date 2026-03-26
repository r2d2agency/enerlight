-- Goals WhatsApp Daily Report Configuration
CREATE TABLE IF NOT EXISTS crm_goals_report_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL,
  send_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN DEFAULT true,
  include_channel_breakdown BOOLEAN DEFAULT true,
  include_enerlight BOOLEAN DEFAULT true,
  greeting_template TEXT DEFAULT 'Olá {primeiro_nome}, segue seu relatório diário! 👇',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipients for the daily report
CREATE TABLE IF NOT EXISTS crm_goals_report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES crm_goals_report_config(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  phone VARCHAR(30) NOT NULL,
  name VARCHAR(255),
  report_type VARCHAR(20) NOT NULL DEFAULT 'full', -- 'full' (gerente) or 'individual' (vendedor)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_report_config_org ON crm_goals_report_config(organization_id);
CREATE INDEX IF NOT EXISTS idx_goals_report_recipients_config ON crm_goals_report_recipients(config_id);
