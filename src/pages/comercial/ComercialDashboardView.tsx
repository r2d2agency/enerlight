import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ComercialActor, ComercialDashboard, ComercialMyCommission } from '@/lib/comercial-api';
import {
  Loader2, TrendingUp, FileText, Clock, Users, Handshake, AlertTriangle,
  UserPlus, ShoppingCart, CheckCircle2, Wallet,
} from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const PROFILE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  gerente: 'Gerente Comercial',
  vendedor: 'Vendedor',
  parceiro: 'Parceiro Comercial',
};

const ACTIVITY_LABEL: Record<string, string> = {
  cliente_cadastrado: 'Cliente cadastrado',
  orcamento_criado: 'Orçamento criado',
  venda_registrada: 'Venda registrada',
};

const ACTIVITY_ICON: Record<string, typeof Users> = {
  cliente_cadastrado: UserPlus,
  orcamento_criado: FileText,
  venda_registrada: ShoppingCart,
};

interface Props {
  actor: ComercialActor;
  getDashboard: () => Promise<ComercialDashboard>;
  listMyCommissions?: () => Promise<{ commissions: ComercialMyCommission[] }>;
}

export default function ComercialDashboardView({ actor, getDashboard, listMyCommissions }: Props) {
  const [data, setData] = useState<ComercialDashboard | null>(null);
  const [commissions, setCommissions] = useState<ComercialMyCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((error) => toast({ title: 'Erro ao carregar dashboard', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
    listMyCommissions?.().then((res) => setCommissions(res.commissions)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const commissionByStatus = commissions.reduce(
    (acc, c) => { acc[c.status] = (acc[c.status] || 0) + Number(c.amount); return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Olá, {actor.name}</h1>
          <p className="text-sm text-muted-foreground">
            {PROFILE_LABEL[actor.profile] || actor.profile}
            {actor.team_name ? ` · Equipe ${actor.team_name}` : ''}
          </p>
        </div>
        <Badge variant="secondary">{actor.status === 'active' ? 'Acesso ativo' : actor.status}</Badge>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Vendas no mês</CardTitle>
                <TrendingUp className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatCurrency(data.sales_this_month.total)}</div>
                <p className="text-xs text-muted-foreground">{data.sales_this_month.count} venda(s)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Orçamentos enviados</CardTitle>
                <FileText className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{data.quotes.sent_count}</div>
                <p className="text-xs text-muted-foreground">{data.quotes.conversion_rate}% de conversão</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Aguardando resposta</CardTitle>
                <Clock className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{data.quotes.awaiting_count}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Convertidos em venda</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{data.quotes.converted_count}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Clientes ativos</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{data.customers.active_count}</div>
                <p className="text-xs text-muted-foreground">{data.customers.new_this_month} novo(s) no mês</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Oportunidades abertas</CardTitle>
                <Handshake className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{data.opportunities_open}</div>
              </CardContent>
            </Card>
          </div>

          {data.quotes_near_expiry.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Propostas perto de vencer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.quotes_near_expiry.map((q) => (
                  <div key={q.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium">{q.quote_number || 'Orçamento'} · {q.client_name}</p>
                      <p className="text-xs text-muted-foreground">Válido até {new Date(q.valid_until).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className="font-medium">{formatCurrency(q.total_value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {commissions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Comissão</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Prevista</p>
                  <p className="font-semibold">{formatCurrency(commissionByStatus.previsto || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Liberada</p>
                  <p className="font-semibold">{formatCurrency(commissionByStatus.liberado || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Paga</p>
                  <p className="font-semibold">{formatCurrency(commissionByStatus.pago || 0)}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Funil comercial</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.funnel.every((s) => s.count === 0) ? (
                  <p className="text-sm text-muted-foreground">Nenhuma oportunidade criada ainda.</p>
                ) : (
                  data.funnel.map((stage) => (
                    <div key={stage.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{stage.name}</span>
                      <span>{stage.count} · {formatCurrency(stage.value)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Atividades recentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.recent_activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma atividade ainda.</p>
                ) : (
                  data.recent_activity.map((a) => {
                    const Icon = ACTIVITY_ICON[a.type] || FileText;
                    return (
                      <div key={`${a.type}-${a.id}`} className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{ACTIVITY_LABEL[a.type] || a.type}: {a.label}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
