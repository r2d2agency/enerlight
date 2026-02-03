-- ============================================
-- Schema para Configurações de IA da Organização
-- Execute após schema-v2.sql
-- ============================================

-- Adicionar colunas de configuração de IA na tabela organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(20) DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_api_key TEXT;

-- Índice para otimizar consultas
CREATE INDEX IF NOT EXISTS idx_organizations_ai_provider ON organizations(ai_provider) WHERE ai_provider != 'none';

COMMENT ON COLUMN organizations.ai_provider IS 'Provedor de IA: none, openai, gemini';
COMMENT ON COLUMN organizations.ai_model IS 'Modelo de IA: gpt-4o, gpt-4o-mini, gemini-1.5-pro, etc';
COMMENT ON COLUMN organizations.ai_api_key IS 'API Key criptografada do provedor de IA';
