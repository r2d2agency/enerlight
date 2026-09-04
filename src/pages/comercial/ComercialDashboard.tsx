import ComercialLayout from './ComercialLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Handshake, FileText, ShoppingCart } from 'lucide-react';

const PROFILE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente Comercial',
  vendedor: 'Vendedor',
  parceiro: 'Parceiro Comercial',
};

const ComercialDashboard = () => {
  return (
    <ComercialLayout>
      {(actor) => (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl font-semibold">Olá, {actor.name}</h1>
              <p className="text-muted-foreground text-sm">
                {PROFILE_LABEL[actor.profile] || actor.profile}
                {actor.team_name ? ` · Equipe ${actor.team_name}` : ''}
              </p>
            </div>
            <Badge variant="secondary">{actor.status === 'active' ? 'Acesso ativo' : actor.status}</Badge>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Em construção</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Seu acesso ao Portal Comercial já está liberado. As áreas de clientes,
                oportunidades, orçamentos, vendas e catálogo estão sendo implementadas
                nas próximas etapas e aparecerão aqui em breve.
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
    </ComercialLayout>
  );
};

export default ComercialDashboard;
