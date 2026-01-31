-- Email System Schema
-- Sistema de envio de emails via SMTP com templates

-- ============================================
-- CONFIGURAÇÕES SMTP
-- ============================================

-- Configuração SMTP por organização (padrão)
CREATE TABLE IF NOT EXISTS email_smtp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    
    -- Dados do servidor SMTP
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 587,
    secure BOOLEAN DEFAULT true, -- TLS
    
    -- Autenticação
    username VARCHAR(255) NOT NULL,
    password_encrypted TEXT NOT NULL, -- Senha criptografada
    
    -- Identidade do remetente
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(organization_id)
);

-- Configuração SMTP por usuário (sobrescreve organização)
CREATE TABLE IF NOT EXISTS email_user_smtp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    
    -- Dados do servidor SMTP
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 587,
    secure BOOLEAN DEFAULT true,
    
    -- Autenticação
    username VARCHAR(255) NOT NULL,
    password_encrypted TEXT NOT NULL,
    
    -- Identidade do remetente
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, organization_id)
);

-- ============================================
-- TEMPLATES DE EMAIL
-- ============================================

CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    
    -- Dados do template
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- 'crm', 'campaign', 'flow', 'general'
    
    -- Conteúdo
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT, -- Versão plain text
    
    -- Variáveis disponíveis (para referência)
    available_variables TEXT[] DEFAULT ARRAY[
        'nome', 'email', 'telefone', 'empresa', 
        'valor', 'deal_title', 'etapa', 'funil'
    ],
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FILA DE EMAILS
-- ============================================

CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    
    -- Remetente (usa configuração do user ou org)
    sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Template usado (opcional)
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    
    -- Destinatário
    to_email VARCHAR(255) NOT NULL,
    to_name VARCHAR(255),
    cc TEXT[], -- Array de emails em cópia
    bcc TEXT[], -- Array de emails em cópia oculta
    
    -- Conteúdo
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    
    -- Contexto (para variáveis e rastreamento)
    context_type VARCHAR(50), -- 'deal', 'contact', 'campaign', 'flow'
    context_id UUID, -- ID do deal, contato, etc.
    variables JSONB DEFAULT '{}', -- Variáveis usadas na interpolação
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, sending, sent, failed, cancelled
    priority INTEGER DEFAULT 5, -- 1-10, menor = mais urgente
    
    -- Resultados
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Agendamento
    scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- HISTÓRICO DE EMAILS
-- ============================================

CREATE TABLE IF NOT EXISTS email_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    queue_id UUID REFERENCES email_queue(id) ON DELETE SET NULL,
    
    -- Dados do email
    sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    
    -- Contexto
    context_type VARCHAR(50),
    context_id UUID,
    
    -- Status
    status VARCHAR(20) NOT NULL, -- sent, failed
    error_message TEXT,
    
    -- Métricas (para tracking futuro)
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_email_smtp_configs_org ON email_smtp_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_user_smtp_configs_user ON email_user_smtp_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_user_smtp_configs_org ON email_user_smtp_configs(organization_id);

CREATE INDEX IF NOT EXISTS idx_email_templates_org ON email_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_email_queue_org ON email_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled ON email_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_email_queue_context ON email_queue(context_type, context_id);

CREATE INDEX IF NOT EXISTS idx_email_history_org ON email_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_history_context ON email_history(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_email_history_to ON email_history(to_email);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_email_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_email_smtp_configs_updated ON email_smtp_configs;
CREATE TRIGGER trigger_email_smtp_configs_updated
    BEFORE UPDATE ON email_smtp_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_email_updated_at();

DROP TRIGGER IF EXISTS trigger_email_user_smtp_updated ON email_user_smtp_configs;
CREATE TRIGGER trigger_email_user_smtp_updated
    BEFORE UPDATE ON email_user_smtp_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_email_updated_at();

DROP TRIGGER IF EXISTS trigger_email_templates_updated ON email_templates;
CREATE TRIGGER trigger_email_templates_updated
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_email_updated_at();

DROP TRIGGER IF EXISTS trigger_email_queue_updated ON email_queue;
CREATE TRIGGER trigger_email_queue_updated
    BEFORE UPDATE ON email_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_email_updated_at();
