-- Adiciona obrigatoriedade de biometria facial para colaboradores
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS requires_facial_recognition BOOLEAN DEFAULT FALSE;

-- Garante permissões (assumindo que o serviço roda como service_role)
GRANT ALL ON TABLE public.organization_members TO service_role;
GRANT SELECT, UPDATE ON TABLE public.organization_members TO authenticated;
