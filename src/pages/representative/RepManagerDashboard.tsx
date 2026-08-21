import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Users, ShoppingCart, ClipboardList, TrendingUp, Handshake, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function RepManagerDashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api<any>("/api/representatives/admin/stats")
  });

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ["admin-performance"],
    queryFn: () => api<any[]>("/api/representatives/admin/performance")
  });

  const kpis = [
    { 
      title: "Representantes", 
      value: stats?.total_representatives || "0", 
      icon: Handshake, 
      color: "text-blue-500",
      description: "Total ativos e inativos"
    },
    { 
      title: "Orçamentos Totais", 
      value: stats?.total_quotes || "0", 
      icon: ClipboardList, 
      color: "text-amber-500",
      description: "Propostas geradas no período"
    },
    { 
      title: "Vendas Convertidas", 
      value: `R$ ${Number(stats?.sales_volume || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
      icon: TrendingUp, 
      color: "text-green-500",
      description: "Volume total de vendas"
    },
    { 
      title: "Itens em Catálogo", 
      value: stats?.total_products || "0", 
      icon: ShoppingCart, 
      color: "text-purple-500",
      description: "Produtos nas tabelas ativas"
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Painel do Gestor</h2>
        <p className="text-muted-foreground">Visão consolidada da performance da rede de representantes.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="border-border/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.title}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsLoading ? "..." : kpi.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-border/40">
          <CardHeader>
            <CardTitle>Performance por Representante (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">Orçamentos</TableHead>
                  <TableHead className="text-center">Vendas</TableHead>
                  <TableHead className="text-right">Total (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perfLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando performance...</TableCell>
                  </TableRow>
                ) : performance?.length ? (
                  performance.map((rep) => (
                    <TableRow key={rep.name}>
                      <TableCell className="font-medium text-sm">{rep.name}</TableCell>
                      <TableCell className="text-center">{rep.total_quotes}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-green-500 border-green-500/20">{rep.converted_quotes}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm">
                        {Number(rep.sales_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">Nenhum dado de performance disponível.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 border-border/40">
          <CardHeader>
            <CardTitle>Ações Administrativas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div 
              className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/10 cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => window.location.href = '/rep/manager/representatives'}
            >
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Gestão de Equipe</p>
                <p className="text-xs text-muted-foreground">Bloqueie acessos ou ajuste comissões.</p>
              </div>
            </div>
            <div 
              className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/10 cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => window.location.href = '/rep/manager/price-lists'}
            >
              <ClipboardList className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Controle de Tabelas</p>
                <p className="text-xs text-muted-foreground">Gerencie autorizações e categorias.</p>
              </div>
            </div>
            <div 
              className="flex items-start gap-4 p-3 rounded-lg border border-border/40 bg-accent/10 cursor-pointer hover:bg-accent/20 transition-colors"
              onClick={() => window.location.href = '/rep/manager/quotes'}
            >
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Auditoria de Vendas</p>
                <p className="text-xs text-muted-foreground">Consulte todos os orçamentos convertidos.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
