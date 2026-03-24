-- CRM Funnel Automation Schema
-- Sistema de automação de remarketing por etapas do funil

-- ============================================
-- AUTOMAÇÃO DE ETAPAS
-- ============================================

-- Configuração de automação por etapa do funil (múltiplos fluxos por etapa)
CREATE TABLE IF NOT EXISTS crm_stage_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID REFERENCES crm_stages(id) ON DELETE CASCADE NOT NULL,
    
    -- Fluxo a ser executado ao entrar na etapa
    flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    
    -- Tempo de espera por resposta (em horas)
    wait_hours INTEGER NOT NULL DEFAULT 24,
    
    -- Próxima etapa se não houver resposta
    next_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    
    -- Se for última etapa, pode mover para outro funil
    fallback_funnel_id UUID REFERENCES crm_funnels(id) ON DELETE SET NULL,
    fallback_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    
    -- Configurações
    is_active BOOLEAN DEFAULT true,
    execute_immediately BOOLEAN DEFAULT true, -- Dispara fluxo ao entrar na etapa
    position INTEGER DEFAULT 0, -- Ordem de execução dos fluxos na etapa
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Registro de execução de automação por deal
CREATE TABLE IF NOT EXISTS crm_deal_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    stage_id UUID REFERENCES crm_stages(id) ON DELETE CASCADE NOT NULL,
    automation_id UUID REFERENCES crm_stage_automations(id) ON DELETE SET NULL,
    
    -- Estado da automação
    status VARCHAR(20) DEFAULT 'pending', -- pending, flow_sent, waiting, responded, moved, cancelled
    
    -- Tracking do fluxo
    flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    flow_session_id UUID, -- Referência à sessão do fluxo se existir
    flow_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Prazo para resposta
    wait_until TIMESTAMP WITH TIME ZONE,
    
    -- Resultado
    responded_at TIMESTAMP WITH TIME ZONE, -- Se o contato respondeu
    moved_at TIMESTAMP WITH TIME ZONE, -- Quando foi movido automaticamente
    next_stage_id UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
    
    -- Telefone do contato para tracking de resposta
    contact_phone VARCHAR(50),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Um deal só pode ter uma automação ativa por etapa
    UNIQUE(deal_id, stage_id, status) 
);

-- Log de ações da automação
CREATE TABLE IF NOT EXISTS crm_automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_automation_id UUID REFERENCES crm_deal_automations(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    
    action VARCHAR(50) NOT NULL, -- flow_triggered, message_received, timeout_move, manual_cancel
    details JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_crm_stage_automations_stage ON crm_stage_automations(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_automations_flow ON crm_stage_automations(flow_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_automations_active ON crm_stage_automations(is_active);

CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_deal ON crm_deal_automations(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_stage ON crm_deal_automations(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_status ON crm_deal_automations(status);
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_wait ON crm_deal_automations(wait_until) 
    WHERE status IN ('pending', 'flow_sent', 'waiting');
CREATE INDEX IF NOT EXISTS idx_crm_deal_automations_phone ON crm_deal_automations(contact_phone);

CREATE INDEX IF NOT EXISTS idx_crm_automation_logs_deal ON crm_automation_logs(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_automation_logs_automation ON crm_automation_logs(deal_automation_id);

-- ============================================
-- MIGRATION: Add position column if not exists
-- ============================================
ALTER TABLE crm_stage_automations ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Drop unique constraint on stage_id if it exists (allow multiple per stage)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'crm_stage_automations_stage_id_key' 
    OR conname = 'unique_stage_automation'
  ) THEN
    ALTER TABLE crm_stage_automations DROP CONSTRAINT IF EXISTS crm_stage_automations_stage_id_key;
    ALTER TABLE crm_stage_automations DROP CONSTRAINT IF EXISTS unique_stage_automation;
  END IF;
END $$;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_crm_automation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crm_stage_automations_updated ON crm_stage_automations;
CREATE TRIGGER trigger_crm_stage_automations_updated
    BEFORE UPDATE ON crm_stage_automations
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_automation_updated_at();

DROP TRIGGER IF EXISTS trigger_crm_deal_automations_updated ON crm_deal_automations;
CREATE TRIGGER trigger_crm_deal_automations_updated
    BEFORE UPDATE ON crm_deal_automations
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_automation_updated_at();
