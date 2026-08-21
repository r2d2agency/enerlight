import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Users, ClipboardList, Wallet, TrendingUp, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

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

  const openQuotes = quotes?.filter(q => q.status === 'rascunho' || q.status === 'enviado' || q.status === 'em análise') || [];
  const wonQuotes = quotes?.filter(q => q.status === 'convertido') || [];
  const wonValue = wonQuotes.reduce((acc, q) => acc + Number(q.value), 0);

  const stats = [
    { title: "Meus Clientes", value: String(customers?.length || 0), icon: Users, color: "text-blue-500" },
    { title: "Orçamentos Abertos", value: String(openQuotes.length), icon: ClipboardList, color: "text-amber-500" },
    { title: "Vendas Convertidas", value: `R$ ${wonValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: "text-green-500" },
    { title: "Total em Propostas", value: `R$ ${quotes?.reduce((acc, q) => acc + Number(q.value), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}`, icon: Wallet, color: "text-purple-500" },
  ];

  const recentQuotes = quotes?.slice(0, 5) || [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Olá, {user?.name}!</h2>
        <p className="text-muted-foreground">Bem-vindo ao seu painel de controle.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-border/40">
          <CardHeader>
            <CardTitle>Últimos Orçamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {recentQuotes.length > 0 ? (
              <div className="space-y-4">
                {recentQuotes.map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-accent/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
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
            <div className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20 opacity-50">
              <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Histórico de Vendas</p>
                <p className="text-xs text-muted-foreground">Relatórios detalhados em breve.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
