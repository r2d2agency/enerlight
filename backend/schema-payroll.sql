-- Payroll (Folha de Pagamento)
CREATE TABLE IF NOT EXISTS payroll_config (
  organization_id uuid PRIMARY KEY,
  manager_user_id uuid REFERENCES users(id),
  ceo_user_id uuid REFERENCES users(id),
  finance_user_id uuid REFERENCES users(id),
  updated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_salary numeric(15,2) DEFAULT 0,
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  reference_month date NOT NULL, -- always day = 01
  status varchar(30) NOT NULL DEFAULT 'draft',
  -- draft | manager_review | ceo_review | finance_review | approved | paid | rejected
  notes text,
  created_by uuid REFERENCES users(id),
  paid_at timestamptz,
  paid_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(organization_id, reference_month)
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  user_name varchar(255),
  base_salary numeric(15,2) DEFAULT 0,
  commission_value numeric(15,2) DEFAULT 0,
  bonus_value numeric(15,2) DEFAULT 0,
  deductions_total numeric(15,2) DEFAULT 0,
  total numeric(15,2) DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(period_id, user_id)
);

CREATE TABLE IF NOT EXISTS payroll_deductions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  description varchar(255) NOT NULL,
  value numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_approvals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL, -- manager | ceo | finance
  user_id uuid REFERENCES users(id),
  status varchar(20) NOT NULL, -- approved | rejected
  note text,
  created_at timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_org ON payroll_periods(organization_id, reference_month DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_items_period ON payroll_items(period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_item ON payroll_deductions(item_id);
CREATE INDEX IF NOT EXISTS idx_payroll_approvals_period ON payroll_approvals(period_id);
