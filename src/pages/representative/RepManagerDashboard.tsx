import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Users, ShoppingCart, ClipboardList, Settings, TrendingUp, Handshake } from "lucide-react";

export default function RepManagerDashboard() {
  const { user } = useAuth();

  const stats = [
    { title: "Total Representantes", value: "0", icon: Handshake, color: "text-blue-500" },
    { title: "Orçamentos Totais", value: "0", icon: ClipboardList, color: "text-amber-500" },
    { title: "Volume de Vendas", value: "R$ 0,00", icon: TrendingUp, color: "text-green-500" },
    { title: "Produtos Ativos", value: "0", icon: ShoppingCart, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Painel do Gestor</h2>
        <p className="text-muted-foreground">Gerencie a rede de representantes e tabelas de preços.</p>
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
            <CardTitle>Performance por Representante</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground italic">
            Nenhum dado disponível no momento.
          </CardContent>
        </Card>
        
        <Card className="col-span-3 border-border/40">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20">
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Cadastrar Representante</p>
                <p className="text-xs text-muted-foreground">Crie um novo acesso para representante externo.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20">
              <ClipboardList className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Atualizar Tabelas</p>
                <p className="text-xs text-muted-foreground">Importe novos preços e produtos.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
