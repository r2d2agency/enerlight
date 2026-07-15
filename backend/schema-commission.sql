-- Commission / billing validation module
-- Extends erp_billing_records with validation status and adds commission rules per user

ALTER TABLE erp_billing_records
  ADD COLUMN IF NOT EXISTS validation_status varchar(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_note text,
  ADD COLUMN IF NOT EXISTS adjusted_value numeric(15,2),
  ADD COLUMN IF NOT EXISTS is_refund boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_erp_billing_validation
  ON erp_billing_records(organization_id, validation_status, billing_date);

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
