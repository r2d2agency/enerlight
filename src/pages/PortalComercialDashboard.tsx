import PortalComercialShell from './comercial/PortalComercialShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Users, Handshake, FileText, ShoppingCart } from 'lucide-react';

const PROFILE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente Comercial',
  vendedor: 'Vendedor',
  parceiro: 'Parceiro Comercial',
};

export default function PortalComercialDashboard() {
  return (
    <PortalComercialShell>
      {(actor) => (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Briefcase className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Portal Comercial</h1>
              <p className="text-muted-foreground text-sm">Sua área restrita de clientes, oportunidades e orçamentos.</p>
            </div>
          </div>

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
                Clientes e catálogo já estão disponíveis no menu ao lado. Oportunidades,
                orçamentos e vendas do Portal Comercial estão sendo implementados nas
                próximas etapas.
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
        </div>
      )}
    </PortalComercialShell>
  );
}
