import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { comercialInternalApi, ComercialActor } from '@/lib/comercial-api';
import { useToast } from '@/hooks/use-toast';
import { Briefcase, Users, Handshake, FileText, ShoppingCart, Loader2 } from 'lucide-react';

const PROFILE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente Comercial',
  vendedor: 'Vendedor',
  parceiro: 'Parceiro Comercial',
};

// Mesma experiência do Portal Comercial, só que dentro do app principal —
// o vendedor interno continua logado com a conta de sempre do CRM.
export default function PortalComercialDashboard() {
  const [actor, setActor] = useState<ComercialActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    comercialInternalApi
      .me()
      .then((res) => setActor(res.actor))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Erro ao carregar o Portal Comercial';
        setError(message);
        toast({ title: 'Erro ao carregar', description: message, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Briefcase className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Portal Comercial</h1>
            <p className="text-muted-foreground text-sm">Sua área restrita de clientes, oportunidades e orçamentos.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !actor ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              {error || 'Você ainda não tem acesso ao Portal Comercial. Fale com o administrador.'}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {PROFILE_LABEL[actor.profile] || actor.profile}
                {actor.team_name ? ` · Equipe ${actor.team_name}` : ''}
              </p>
              <Badge variant="secondary">Acesso ativo</Badge>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Em construção</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  As áreas de clientes, oportunidades, orçamentos, vendas e catálogo do
                  Portal Comercial estão sendo implementadas nas próximas etapas.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="flex items-center gap-2 text-foreground">
                    <Users className="h-4 w-4 text-primary" /> Clientes
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <Handshake className="h-4 w-4 text-primary" /> Oportunidades
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <FileText className="h-4 w-4 text-primary" /> Orçamentos
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <ShoppingCart className="h-4 w-4 text-primary" /> Vendas
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
