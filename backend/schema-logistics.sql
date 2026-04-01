-- ============================================
-- Schema: Módulo de Logística
-- ============================================

CREATE TABLE IF NOT EXISTS logistics_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  -- Dados básicos
  company_name VARCHAR(255),
  client_name VARCHAR(500) NOT NULL,
  invoice_number VARCHAR(100),
  order_number VARCHAR(100),
  -- Datas
  requested_date DATE,
  departure_date DATE,
  estimated_delivery DATE,
  actual_delivery DATE,
  -- Transporte
  carrier VARCHAR(255),
  carrier_quote_code VARCHAR(100),
  volumes INTEGER DEFAULT 0,
  -- Valores
  freight_paid NUMERIC(15,2) DEFAULT 0,
  freight_invoiced NUMERIC(15,2) DEFAULT 0,
  tax_value NUMERIC(15,2) DEFAULT 0,
  real_cost NUMERIC(15,2) DEFAULT 0,
  -- Status & canal
  status VARCHAR(100) DEFAULT 'Pendente',
  channel VARCHAR(100),
  -- Vínculo CRM
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  requester_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Import tracking
  import_batch_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_shipments_org ON logistics_shipments(organization_id);
CREATE INDEX IF NOT EXISTS idx_logistics_shipments_order ON logistics_shipments(order_number);
CREATE INDEX IF NOT EXISTS idx_logistics_shipments_deal ON logistics_shipments(deal_id);
CREATE INDEX IF NOT EXISTS idx_logistics_shipments_carrier_code ON logistics_shipments(carrier_quote_code);
CREATE INDEX IF NOT EXISTS idx_logistics_shipments_batch ON logistics_shipments(import_batch_id);

-- Unique constraint for upsert: same org + order_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_logistics_shipments_org_order_unique
  ON logistics_shipments(organization_id, order_number)
  WHERE order_number IS NOT NULL AND order_number != '';

-- Import batch history
CREATE TABLE IF NOT EXISTS logistics_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  row_count INTEGER DEFAULT 0,
  total_freight_paid NUMERIC(15,2) DEFAULT 0,
  total_freight_invoiced NUMERIC(15,2) DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_import_batches_org ON logistics_import_batches(organization_id);
