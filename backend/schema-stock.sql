-- Schema do módulo de estoque
CREATE TABLE IF NOT EXISTS stock_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  product_kind VARCHAR(20) NOT NULL DEFAULT 'COMPONENT' CHECK (product_kind IN ('COMPONENT','COMPOSITE')),
  unit VARCHAR(20) NOT NULL DEFAULT 'UN',
  minimum_quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
  quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, sku)
);
CREATE TABLE IF NOT EXISTS stock_product_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  code VARCHAR(150) NOT NULL, code_type VARCHAR(30) NOT NULL DEFAULT 'EAN', UNIQUE(product_id, code), UNIQUE(code)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES stock_products(id) ON DELETE RESTRICT, movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('IN','OUT','ADJUSTMENT')),
  quantity NUMERIC(15,3) NOT NULL CHECK (quantity > 0), reference VARCHAR(150), idempotency_key VARCHAR(200), notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS stock_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_hash VARCHAR(64) NOT NULL, invoice_number VARCHAR(100), created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chave_nfe VARCHAR(44), serie VARCHAR(10), nnf VARCHAR(20),
  emit_cnpj VARCHAR(20), emit_name VARCHAR(255), dest_cnpj VARCHAR(20), dest_name VARCHAR(255),
  issue_date TIMESTAMPTZ, total_products NUMERIC(15,2), total_invoice NUMERIC(15,2),
  raw_xml TEXT, status VARCHAR(20) NOT NULL DEFAULT 'processed',
  items_total INTEGER DEFAULT 0, items_matched INTEGER DEFAULT 0, items_unmatched INTEGER DEFAULT 0,
  UNIQUE(organization_id, document_hash)
);
CREATE INDEX IF NOT EXISTS idx_stock_imports_org_date ON stock_imports(organization_id, created_at DESC);
CREATE TABLE IF NOT EXISTS stock_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), import_id UUID NOT NULL REFERENCES stock_imports(id) ON DELETE CASCADE,
  item_number INTEGER NOT NULL, raw_code VARCHAR(150), description TEXT, ncm VARCHAR(20), cfop VARCHAR(10),
  quantity NUMERIC(15,3), unit VARCHAR(20), unit_value NUMERIC(15,4), total_value NUMERIC(15,2),
  matched_product_id UUID REFERENCES stock_products(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unmatched', movement_id UUID,
  UNIQUE(import_id, item_number)
);
ALTER TABLE stock_import_items ADD COLUMN IF NOT EXISTS movement_type VARCHAR(20);
ALTER TABLE stock_import_items ADD COLUMN IF NOT EXISTS operation_id UUID;
ALTER TABLE stock_imports ADD COLUMN IF NOT EXISTS document_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_stock_import_items_import ON stock_import_items(import_id);
CREATE INDEX IF NOT EXISTS idx_stock_products_org ON stock_products(organization_id);
CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES stock_products(id) ON DELETE CASCADE, alert_type VARCHAR(30) NOT NULL,
  message TEXT NOT NULL, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_date ON stock_movements(organization_id, created_at DESC);
ALTER TABLE stock_products ADD COLUMN IF NOT EXISTS product_kind VARCHAR(20) NOT NULL DEFAULT 'COMPONENT';
DO $$ BEGIN ALTER TABLE stock_products ADD CONSTRAINT stock_products_kind_check CHECK (product_kind IN ('COMPONENT','COMPOSITE')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS stock_boms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE, version INTEGER NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, product_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_boms_active ON stock_boms(organization_id, product_id) WHERE active;
CREATE TABLE IF NOT EXISTS stock_bom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bom_id UUID NOT NULL REFERENCES stock_boms(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES stock_products(id) ON DELETE RESTRICT, quantity NUMERIC(15,3) NOT NULL CHECK(quantity > 0),
  UNIQUE(bom_id, component_product_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_bom_items_bom ON stock_bom_items(bom_id);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS operation_id UUID;
CREATE INDEX IF NOT EXISTS idx_stock_movements_operation ON stock_movements(operation_id);
CREATE TABLE IF NOT EXISTS stock_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operation_type VARCHAR(30) NOT NULL CHECK(operation_type IN ('COMPOSITE_OUT','PRODUCTION_IN')), idempotency_key VARCHAR(200) NOT NULL,
  product_id UUID REFERENCES stock_products(id), quantity NUMERIC(15,3) NOT NULL CHECK(quantity > 0), bom_id UUID REFERENCES stock_boms(id), created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, operation_type, idempotency_key)
);
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS can_view_stock BOOLEAN DEFAULT false;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS can_edit_stock BOOLEAN DEFAULT false;
