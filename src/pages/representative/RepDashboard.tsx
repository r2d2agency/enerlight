import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ShoppingCart, Users, ClipboardList, Wallet, TrendingUp } from "lucide-react";

export default function RepDashboard() {
  const { user } = useAuth();

  const stats = [
    { title: "Meus Clientes", value: "0", icon: Users, color: "text-blue-500" },
    { title: "Orçamentos Abertos", value: "0", icon: ClipboardList, color: "text-amber-500" },
    { title: "Vendas do Mês", value: "R$ 0,00", icon: TrendingUp, color: "text-green-500" },
    { title: "Comissões a Receber", value: "R$ 0,00", icon: Wallet, color: "text-purple-500" },
  ];

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
            <CardTitle>Resumo de Atividades</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground italic">
            Nenhuma atividade recente para exibir.
          </CardContent>
        </Card>
        
        <Card className="col-span-3 border-border/40">
          <CardHeader>
            <CardTitle>Próximos Passos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20">
              <ShoppingCart className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Faça seu primeiro orçamento</p>
                <p className="text-xs text-muted-foreground">Use o catálogo para selecionar produtos e gerar uma proposta.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/20">
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Cadastre seus clientes</p>
                <p className="text-xs text-muted-foreground">Mantenha sua base de contatos atualizada.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
