-- Módulo de Orçamentos Online

-- Tabelas de Preços (Price Lists)
CREATE TABLE IF NOT EXISTS price_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

-- Produtos na Tabela de Preço
CREATE TABLE IF NOT EXISTS price_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id UUID REFERENCES price_lists(id) ON DELETE CASCADE NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    cost_price DECIMAL(15, 2) DEFAULT 0, -- Nunca mostrado ao usuário final
    sale_price DECIMAL(15, 2) DEFAULT 0,
    min_price DECIMAL(15, 2), -- Preço mínimo permitido para venda
    unit VARCHAR(20) DEFAULT 'un',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(price_list_id, product_code)
);

-- Permissões de acesso às tabelas de preço por usuário ou canal
CREATE TABLE IF NOT EXISTS price_list_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_list_id UUID REFERENCES price_lists(id) ON DELETE CASCADE NOT NULL,
    -- Acesso pode ser por usuário individual ou por grupo/canal do CRM
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES crm_user_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
);

-- Orçamentos Online (Quotes)
CREATE TABLE IF NOT EXISTS online_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Vendedor que criou
    client_name VARCHAR(255) NOT NULL,
    client_document VARCHAR(20), -- CPF/CNPJ
    client_email VARCHAR(255),
    client_phone VARCHAR(50),
    price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL,
    
    status VARCHAR(50) DEFAULT 'draft', -- draft, sent, approved, rejected
    total_value DECIMAL(15, 2) DEFAULT 0,
    total_cost DECIMAL(15, 2) DEFAULT 0, -- Para cálculo de margem gerencial
    margin_percent DECIMAL(5, 2),
    
    -- Personalização do Orçamento
    cover_image_url TEXT,
    footer_text TEXT,
    valid_until DATE,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Itens do Orçamento
CREATE TABLE IF NOT EXISTS online_quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES online_quotes(id) ON DELETE CASCADE NOT NULL,
    product_code VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(15, 3) NOT NULL DEFAULT 1,
    unit_price DECIMAL(15, 2) NOT NULL,
    cost_price DECIMAL(15, 2) NOT NULL, -- Snapshot do custo no momento
    total_price DECIMAL(15, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Configurações Globais do Módulo por Organização
CREATE TABLE IF NOT EXISTS online_quotes_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
    default_cover_image TEXT,
    default_footer TEXT,
    show_cost_to_roles VARCHAR[] DEFAULT ARRAY['admin', 'manager'], -- Quem pode ver custos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexação
CREATE INDEX idx_price_list_org ON price_lists(organization_id);
CREATE INDEX idx_price_list_items_list ON price_list_items(price_list_id);
CREATE INDEX idx_price_list_access_user ON price_list_access(user_id);
CREATE INDEX idx_price_list_access_group ON price_list_access(group_id);
CREATE INDEX idx_online_quotes_org ON online_quotes(organization_id);
CREATE INDEX idx_online_quotes_user ON online_quotes(user_id);
