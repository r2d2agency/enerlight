-- Adiciona colunas faltantes na tabela price_list_items
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS category VARCHAR(255);
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS subcategory VARCHAR(255);
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS brand VARCHAR(255);

-- Adiciona coluna faltante na tabela online_quote_items para snapshot
ALTER TABLE online_quote_items ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Adiciona colunas para controle de template e campos adicionais em online_quotes
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES online_quote_templates(id) ON DELETE SET NULL;
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS include_images BOOLEAN DEFAULT true;
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100);

-- Adiciona colunas de desconto em online_quote_items se não existirem (ou atualiza as existentes)
ALTER TABLE online_quote_items ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'fixed'; -- 'fixed' ou 'percentage'
ALTER TABLE online_quote_items ADD COLUMN IF NOT EXISTS discount_value DECIMAL(15, 2) DEFAULT 0;

-- Adiciona coluna de template padrão em price_lists
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS default_template_id UUID REFERENCES online_quote_templates(id) ON DELETE SET NULL;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;
ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS markup_percentage DECIMAL(10, 2) DEFAULT 0;
