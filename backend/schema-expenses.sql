-- Expense Reports / Prestação de Contas (Item-first approach)

-- Standalone expense items - created individually, grouped into reports later
CREATE TABLE IF NOT EXISTS expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  report_id UUID REFERENCES expense_reports(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL, -- combustivel, alimentacao, transporte, hospedagem, outros
  description VARCHAR(500),
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  expense_time TIME,
  payment_type VARCHAR(50), -- dinheiro, cartao_credito, cartao_debito, pix, outros
  location VARCHAR(255),
  establishment VARCHAR(255),
  cnpj VARCHAR(20),
  receipt_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reports are created AFTER items exist, by grouping selected items
CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft', -- draft, submitted, approved, rejected, paid
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id),
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_items_org ON expense_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_user ON expense_items(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_items_report ON expense_items(report_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_org ON expense_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_user ON expense_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON expense_reports(status);
