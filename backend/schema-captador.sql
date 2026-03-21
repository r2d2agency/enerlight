-- Schema para módulo Captador (Field Scout)
-- Motoboys que visitam obras e registram fichas de campo

CREATE TABLE IF NOT EXISTS field_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Localização
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address TEXT,
  
  -- Dados da obra
  construction_stage VARCHAR(100), -- etapa da obra
  stage_notes TEXT,
  
  -- Dados do contato/responsável
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  contact_role VARCHAR(100), -- engenheiro, mestre de obras, etc.
  company_name VARCHAR(255),
  company_cnpj VARCHAR(20),
  
  -- Vínculo CRM
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'new', -- new, in_progress, converted, archived
  
  -- Metadados
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_captures_org ON field_captures(organization_id);
CREATE INDEX IF NOT EXISTS idx_field_captures_user ON field_captures(created_by);
CREATE INDEX IF NOT EXISTS idx_field_captures_deal ON field_captures(deal_id);

-- Anexos (fotos, áudios, documentos)
CREATE TABLE IF NOT EXISTS field_capture_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID NOT NULL REFERENCES field_captures(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_type VARCHAR(50), -- photo, audio, document
  mime_type VARCHAR(100),
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_capture_attachments_capture ON field_capture_attachments(capture_id);

-- Histórico de visitas (revisitas à mesma obra)
CREATE TABLE IF NOT EXISTS field_capture_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID NOT NULL REFERENCES field_captures(id) ON DELETE CASCADE,
  visited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  construction_stage VARCHAR(100),
  notes TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_capture_visits_capture ON field_capture_visits(capture_id);

-- Anexos das visitas
CREATE TABLE IF NOT EXISTS field_capture_visit_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES field_capture_visits(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_type VARCHAR(50),
  mime_type VARCHAR(100),
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcva_visit ON field_capture_visit_attachments(visit_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_field_captures_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_field_captures_updated_at ON field_captures;
CREATE TRIGGER trigger_field_captures_updated_at
  BEFORE UPDATE ON field_captures
  FOR EACH ROW
  EXECUTE FUNCTION update_field_captures_updated_at();
