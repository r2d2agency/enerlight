import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Users, ClipboardList, Wallet, TrendingUp, Clock, Percent, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function RepDashboard() {
  const { user } = useAuth();

  const { data: quotes } = useQuery({
    queryKey: ["rep-quotes-summary"],
    queryFn: () => api<any[]>("/api/representatives/my-deals")
  });

  const { data: customers } = useQuery({
    queryKey: ["rep-customers-count"],
    queryFn: () => api<any[]>("/api/representatives/customers")
  });

  const { data: stats } = useQuery({
    queryKey: ["rep-stats"],
    queryFn: () => api<any>("/api/representatives/stats")
  });

  const openQuotes = quotes?.filter(q => q.status === 'rascunho' || q.status === 'enviado' || q.status === 'em análise') || [];
  const wonQuotes = quotes?.filter(q => q.status === 'convertido') || [];
  const totalValue = quotes?.reduce((acc, q) => acc + Number(q.value), 0) || 0;
  
  const conversionRate = stats?.created_this_month > 0 
    ? (stats.converted_this_month / stats.created_this_month) * 100 
    : 0;

  const growth = stats?.created_this_month > stats?.created_last_month;

  const kpis = [
    { 
      title: "Vendas Convertidas (Mês)", 
      value: `R$ ${Number(stats?.value_this_month || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
      icon: TrendingUp, 
      color: "text-green-500",
      description: `${stats?.converted_this_month || 0} orçamentos fechados`
    },
    { 
      title: "Comissão Estimada", 
      value: `R$ ${Number(stats?.estimated_commission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
      icon: Percent, 
      color: "text-blue-500",
      description: "Pagamento pendente"
    },
    { 
      title: "Taxa de Conversão", 
      value: `${conversionRate.toFixed(1)}%`, 
      icon: ArrowUpRight, 
      color: "text-purple-500",
      description: `${stats?.created_this_month || 0} criados no mês`
    },
    { 
      title: "Projeção vs Mês Anterior", 
      value: stats?.created_last_month || 0, 
      icon: growth ? ArrowUpRight : ArrowDownRight, 
      color: growth ? "text-green-500" : "text-red-500",
      description: "Orçamentos mês anterior"
    },
  ];

  const recentQuotes = quotes?.slice(0, 5) || [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Olá, {user?.name}!</h2>
        <p className="text-muted-foreground">Bem-vindo ao seu painel de controle.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
              <kpi.icon className={cn("h-4 w-4", kpi.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-border/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Últimos Orçamentos</CardTitle>
            <Badge variant="outline" className="font-normal">
              {quotes?.length || 0} Total
            </Badge>
          </CardHeader>
          <CardContent>
            {recentQuotes.length > 0 ? (
              <div className="space-y-4">
                {recentQuotes.map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-9 w-9 rounded-full flex items-center justify-center",
                        quote.status === 'convertido' ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary"
                      )}>
                        <ClipboardList className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{quote.title}</p>
                        <p className="text-xs text-muted-foreground">{quote.customer_name || quote.company_name || 'Sem cliente'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">R$ {Number(quote.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(quote.created_at), "dd MMM, HH:mm", { locale: ptBR })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground italic">
                Nenhum orçamento recente para exibir.
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="col-span-3 border-border/40">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div 
              className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20 cursor-pointer hover:bg-accent/40 transition-colors"
              onClick={() => window.location.href = '/rep/catalog'}
            >
              <ShoppingCart className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Novo Orçamento</p>
                <p className="text-xs text-muted-foreground">Use o catálogo para selecionar produtos e gerar uma proposta.</p>
              </div>
            </div>
            <div 
              className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20 cursor-pointer hover:bg-accent/40 transition-colors"
              onClick={() => window.location.href = '/rep/clients'}
            >
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Gerenciar Clientes</p>
                <p className="text-xs text-muted-foreground">Mantenha sua base de contatos atualizada.</p>
              </div>
            </div>
            <div 
              className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20 cursor-pointer hover:bg-accent/40 transition-colors"
              onClick={() => window.location.href = '/rep/commissions'}
            >
              <Wallet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Extrato de Comissões</p>
                <p className="text-xs text-muted-foreground">Veja o detalhamento das suas vendas e ganhos.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}