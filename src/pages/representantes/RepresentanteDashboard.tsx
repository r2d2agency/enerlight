import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import RepresentanteLayout from './RepresentanteLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { representantesApi } from '@/lib/representantes-api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, ShoppingCart, TrendingUp } from 'lucide-react';

interface DashboardData {
  companies: { active_companies: string; total_companies: string };
  orders: { orders_this_month: string; total_this_year: string; total_orders: string };
  recent_orders: Array<{
    id: string;
    order_number?: string | null;
    status: string;
    total_amount: number;
    order_date: string;
    company_name: string;
  }>;
}

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const statusLabel: Record<string, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  canceled: 'Cancelado',
};

const RepresentanteDashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    representantesApi
      .dashboard()
      .then(setData)
      .catch((error) => {
        toast({ title: 'Erro ao carregar dashboard', description: error?.message, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <RepresentanteLayout>
      {(rep) => (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Olá, {rep.name}</h1>
            <p className="text-muted-foreground text-sm">Resumo da sua carteira e pedidos</p>
          </div>

          {loading || !data ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Empresas ativas</CardTitle>
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{data.companies.active_companies}</div>
                    <p className="text-xs text-muted-foreground">{data.companies.total_companies} no total</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Pedidos no mês</CardTitle>
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{data.orders.orders_this_month}</div>
                    <p className="text-xs text-muted-foreground">{data.orders.total_orders} pedidos no total</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Vendas no ano</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCurrency(data.orders.total_this_year)}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Últimos pedidos</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.recent_orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum pedido ainda. <Link to="/representantes/pedidos" className="text-primary hover:underline">Registrar um pedido</Link>
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.recent_orders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
                          <div>
                            <p className="font-medium">{order.company_name}</p>
                            <p className="text-muted-foreground text-xs">
                              {order.order_number ? `#${order.order_number} · ` : ''}
                              {new Date(order.order_date).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{statusLabel[order.status] || order.status}</Badge>
                            <span className="font-medium">{formatCurrency(order.total_amount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </RepresentanteLayout>
  );
};

export default RepresentanteDashboard;
