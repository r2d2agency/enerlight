-- Tabela de Modelos de Capa (Folha de Rosto)
CREATE TABLE IF NOT EXISTS online_quote_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    cover_url TEXT, -- URL da imagem da folha de rosto
    header_text TEXT,
    footer_text TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar coluna de segmento/canal nas tabelas de preços para controle de acesso
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS segment TEXT;

-- Adicionar coluna de template no orçamento
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES online_quote_templates(id);

-- Garantir que a permissão "Orçamentos Online" exista no sistema
-- (Isso geralmente é feito via código, mas vamos garantir que as colunas de permissão existam se necessário)
-- As permissões costumam estar na tabela users ou numa tabela de permissões dedicada.
