-- ============================================
-- Schema: Módulo de Homologação
-- Execute após schema-v2.sql
-- ============================================

-- Quadros de Homologação (cada org pode ter vários)
CREATE TABLE IF NOT EXISTS homologation_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fases/Etapas customizáveis
CREATE TABLE IF NOT EXISTS homologation_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES homologation_boards(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_final BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Empresas de homologação (independentes do CRM)
CREATE TABLE IF NOT EXISTS homologation_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES homologation_boards(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES homologation_stages(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(20),
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tarefas vinculadas a uma empresa de homologação
CREATE TABLE IF NOT EXISTS homologation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES homologation_companies(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  due_date TIMESTAMP WITH TIME ZONE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vínculo de reuniões (usa módulo existente)
CREATE TABLE IF NOT EXISTS homologation_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES homologation_companies(id) ON DELETE CASCADE NOT NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, meeting_id)
);

-- Histórico / timeline
CREATE TABLE IF NOT EXISTS homologation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES homologation_companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documentos
CREATE TABLE IF NOT EXISTS homologation_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES homologation_companies(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  mimetype VARCHAR(100),
  size INTEGER,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notas
CREATE TABLE IF NOT EXISTS homologation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES homologation_companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_homologation_boards_org ON homologation_boards(organization_id);
CREATE INDEX IF NOT EXISTS idx_homologation_stages_board ON homologation_stages(board_id);
CREATE INDEX IF NOT EXISTS idx_homologation_companies_board ON homologation_companies(board_id);
CREATE INDEX IF NOT EXISTS idx_homologation_companies_stage ON homologation_companies(stage_id);
CREATE INDEX IF NOT EXISTS idx_homologation_tasks_company ON homologation_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_homologation_meetings_company ON homologation_meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_homologation_history_company ON homologation_history(company_id);
CREATE INDEX IF NOT EXISTS idx_homologation_documents_company ON homologation_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_homologation_notes_company ON homologation_notes(company_id);
