-- SLA configuration for Devoluções (RMA) module
-- Allows per-organization customization of maximum hours per status.

CREATE TABLE IF NOT EXISTS devolucao_sla_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL,
  hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, status)
);

CREATE INDEX IF NOT EXISTS idx_devolucao_sla_configs_org ON devolucao_sla_configs(organization_id);

-- Grants required for Supabase Data API / PostgREST access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devolucao_sla_configs TO authenticated;
GRANT ALL ON public.devolucao_sla_configs TO service_role;

ALTER TABLE public.devolucao_sla_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage SLA config in their org"
  ON public.devolucao_sla_configs
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
