-- Commission / billing validation module
-- Extends CRM billing imports with validation status and adds commission rules per user

CREATE TABLE IF NOT EXISTS erp_billing_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  client_name varchar(500),
  order_number varchar(100),
  order_value numeric(15,2) DEFAULT 0,
  state varchar(20),
  seller_name varchar(255),
  billing_date date,
  channel varchar(255),
  user_id uuid REFERENCES users(id),
  linked_user_id uuid REFERENCES users(id),
  crm_goals_data_id uuid,
  created_at timestamptz DEFAULT NOW()
);

ALTER TABLE erp_billing_records
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS crm_goals_data_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS validation_status varchar(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_note text,
  ADD COLUMN IF NOT EXISTS adjusted_value numeric(15,2),
  ADD COLUMN IF NOT EXISTS is_refund boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_erp_billing_validation
  ON erp_billing_records(organization_id, validation_status, billing_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_billing_crm_goal
  ON erp_billing_records(organization_id, crm_goals_data_id)
  WHERE crm_goals_data_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS crm_goals_data (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data_type varchar(20) NOT NULL,
  number varchar(50),
  status varchar(100),
  client_name varchar(500),
  value numeric(15,2) DEFAULT 0,
  seller_name varchar(255),
  user_id uuid REFERENCES users(id),
  channel varchar(255),
  client_group varchar(255),
  state varchar(10),
  city varchar(255),
  emission_date date,
  delivery_date date,
  billing_date date,
  margin numeric(10,2),
  observation text,
  order_number varchar(100),
  batch_id uuid,
  created_at timestamptz DEFAULT NOW()
);

ALTER TABLE crm_goals_data
  ADD COLUMN IF NOT EXISTS validation_status varchar(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_note text,
  ADD COLUMN IF NOT EXISTS adjusted_value numeric(15,2),
  ADD COLUMN IF NOT EXISTS is_refund boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_goals_data_commission
  ON crm_goals_data(organization_id, data_type, billing_date, user_id);

CREATE TABLE IF NOT EXISTS crm_goals_seller_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  seller_name varchar(255) NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  UNIQUE(organization_id, seller_name)
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_percent numeric(6,3) NOT NULL DEFAULT 0,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_org ON commission_rules(organization_id);
