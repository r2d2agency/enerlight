-- ============================================
-- Schema: Módulo de Licitação
-- Execute após schema-v2.sql
-- ============================================

-- Quadros de Licitação
CREATE TABLE IF NOT EXISTS licitacao_boards (
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
CREATE TABLE IF NOT EXISTS licitacao_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES licitacao_boards(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_final BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Licitações (cards do kanban)
CREATE TABLE IF NOT EXISTS licitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES licitacao_boards(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES licitacao_stages(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  -- Dados do edital
  edital_number VARCHAR(100),
  edital_url TEXT,
  modality VARCHAR(100),          -- Pregão, Concorrência, Tomada de Preços, etc.
  opening_date TIMESTAMP WITH TIME ZONE,  -- Data de abertura
  deadline_date TIMESTAMP WITH TIME ZONE, -- Prazo final
  result_date TIMESTAMP WITH TIME ZONE,   -- Data do resultado
  estimated_value NUMERIC(15,2) DEFAULT 0,
  -- Órgão/Entidade
  entity_name VARCHAR(500),
  entity_cnpj VARCHAR(20),
  entity_contact VARCHAR(255),
  entity_phone VARCHAR(50),
  entity_email VARCHAR(255),
  -- Status
  status VARCHAR(30) DEFAULT 'open',  -- open, won, lost, canceled, suspended
  -- Responsável
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tarefas vinculadas a uma licitação
CREATE TABLE IF NOT EXISTS licitacao_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id UUID REFERENCES licitacoes(id) ON DELETE CASCADE NOT NULL,
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

-- Checklist items
CREATE TABLE IF NOT EXISTS licitacao_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id UUID REFERENCES licitacoes(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(500) NOT NULL,
  is_checked BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documentos
CREATE TABLE IF NOT EXISTS licitacao_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id UUID REFERENCES licitacoes(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  mimetype VARCHAR(100),
  size INTEGER,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notas/Retornos
CREATE TABLE IF NOT EXISTS licitacao_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id UUID REFERENCES licitacoes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  note_type VARCHAR(30) DEFAULT 'note',  -- note, return, feedback
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Histórico / timeline
CREATE TABLE IF NOT EXISTS licitacao_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id UUID REFERENCES licitacoes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_licitacao_boards_org ON licitacao_boards(organization_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_stages_board ON licitacao_stages(board_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_board ON licitacoes(board_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_stage ON licitacoes(stage_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_tasks_licitacao ON licitacao_tasks(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_checklist_licitacao ON licitacao_checklist(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_documents_licitacao ON licitacao_documents(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_notes_licitacao ON licitacao_notes(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_history_licitacao ON licitacao_history(licitacao_id);
