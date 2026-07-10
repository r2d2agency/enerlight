-- ============================================
-- Schema: Controle de Veículos (frota interna)
-- ============================================

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(150) NOT NULL,
  plate VARCHAR(20),
  brand VARCHAR(80),
  model VARCHAR(120),
  year INTEGER,
  current_km NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_org ON vehicles(organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(organization_id, is_active);

CREATE TABLE IF NOT EXISTS vehicle_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE NOT NULL,
  driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  departure_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  return_at TIMESTAMP WITH TIME ZONE,
  km_start NUMERIC(12,2) NOT NULL DEFAULT 0,
  km_end NUMERIC(12,2),
  purpose VARCHAR(30) NOT NULL DEFAULT 'visit', -- visit | delivery | other
  destination_text TEXT,
  client_company_id UUID,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  shipment_id UUID REFERENCES logistics_shipments(id) ON DELETE SET NULL,
  checklist_out JSONB DEFAULT '{}'::jsonb,
  checklist_in JSONB DEFAULT '{}'::jsonb,
  notes_out TEXT,
  notes_in TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open | closed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_trips_org ON vehicle_trips(organization_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_vehicle ON vehicle_trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_driver ON vehicle_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_status ON vehicle_trips(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_shipment ON vehicle_trips(shipment_id);
