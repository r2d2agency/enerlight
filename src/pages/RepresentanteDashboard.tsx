import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LayoutDashboard, FileText, ShoppingCart, Wallet, Plus, 
  Search, Calendar as CalendarIcon, Filter, Building2, Handshake,
  TrendingUp, CheckCircle2, Clock, CreditCard, Eye, Loader2
} from "lucide-react";
import { OnlineQuoteFormDialog } from "@/components/crm/OnlineQuoteFormDialog";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";


const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function RepresentanteDashboard() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [search, setSearch] = useState("");
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [selectedQuoteForEdit, setSelectedQuoteForEdit] = useState<any>(null);
  
  // Quotes query for the table and stats
  const { data: quotes, isLoading: loadingQuotes, refetch: refetchQuotes } = useQuery({
    queryKey: ["representative-quotes", user?.id],
    queryFn: async () => {
      const allQuotes = await api<any[]>(`/api/online-quotes/quotes`).catch(() => []);
      return allQuotes.filter((q: any) => q.created_by === user?.id);
    },
    enabled: !!user?.id
  });

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ["representative-dashboard-stats", user?.id, startDate, endDate],
    queryFn: async () => {
      const sp = new URLSearchParams();
      sp.set("start_date", startDate);
      sp.set("end_date", endDate);
      
      const commission = await api<any>(`/api/commission/my-summary?${sp.toString()}`).catch(() => ({}));
      
      const periodQuotes = (quotes || []).filter((q: any) => {
        const date = q.created_at?.split('T')[0];
        return date >= startDate && date <= endDate;
      });
      
      return {
        commission,
        quotes: {
          total: periodQuotes.length,
          value: periodQuotes.reduce((acc: number, q: any) => acc + (q.total_value || 0), 0)
        }
      };
    },
    enabled: !!user?.id && !!quotes
  });

  const filteredQuotes = (quotes || []).filter((q: any) => {
    const term = search.toLowerCase();
    return q.client_name?.toLowerCase().includes(term) || 
           q.client_document?.includes(term) ||
           q.id?.includes(term);
  });

  const handleStatusChange = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'draft' ? 'sent' : 
                      currentStatus === 'sent' ? 'approved' : 
                      currentStatus === 'approved' ? 'rejected' : 'draft';
    
    try {
      await api(`/api/online-quotes/quotes/${id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus }
      });
      refetchQuotes();
      toast.success("Status atualizado");
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              Painel do Representante
            </h1>
            <p className="text-muted-foreground">Olá, {user?.name}. Acompanhe seu desempenho e gerencie seus orçamentos.</p>
          </div>
          <div className="flex gap-2 items-end">
            <div className="grid gap-1">
              <Label className="text-xs">Período</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 h-9" />
                <span className="text-muted-foreground">-</span>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 h-9" />
              </div>
            </div>
          </div>
        </div>

        {/* Top Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-500" />
                </div>
                <Badge variant="outline">Mês</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">Orçamentos Criados</p>
                <h3 className="text-2xl font-bold">{stats?.quotes?.total || 0}</h3>
                <p className="text-xs text-muted-foreground">{fmt(stats?.quotes?.value || 0)} em volume</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <Badge variant="outline" className="bg-green-50">Aprovados</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">Pedidos Aprovados</p>
                <h3 className="text-2xl font-bold">{stats?.commission?.validated_count || 0}</h3>
                <p className="text-xs text-muted-foreground">{fmt(stats?.commission?.net_total || 0)} validados</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <Wallet className="h-5 w-5 text-amber-500" />
                </div>
                <Badge variant="outline" className="bg-amber-50 text-amber-700">Pendente</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">Comissão em Aberto</p>
                <h3 className="text-2xl font-bold">{fmt(stats?.commission?.pending_total_commission || 0)}</h3>
                <p className="text-xs text-muted-foreground">Aguardando validação</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <Badge variant="outline" className="bg-primary/5">Pagos</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">Comissões Pagas</p>
                <h3 className="text-2xl font-bold">{fmt(stats?.commission?.commission?.regular?.total || 0)}</h3>
                <p className="text-xs text-muted-foreground">Confirmadas no período</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="quotes" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="quotes" className="gap-2">
              <FileText className="h-4 w-4" /> Orçamentos
            </TabsTrigger>
            <TabsTrigger value="commissions" className="gap-2">
              <Wallet className="h-4 w-4" /> Comissões
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quotes" className="mt-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por cliente, CNPJ ou número..." 
                  className="pl-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button onClick={() => setIsQuoteDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Novo Orçamento
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Orçamentos Recentes</CardTitle>
                <CardDescription>Consulte e gerencie suas propostas comerciais</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingQuotes ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                          </TableCell>
                        </TableRow>
                      ) : filteredQuotes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            Nenhum orçamento encontrado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredQuotes.map((quote: any) => (
                          <TableRow key={quote.id}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col">
                                <span>{quote.client_name}</span>
                                <span className="text-[10px] text-muted-foreground">{quote.client_document}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              {quote.created_at ? format(parseISO(quote.created_at), "dd/MM/yyyy") : "-"}
                            </TableCell>
                            <TableCell className="text-sm font-semibold">
                              {fmt(quote.total_value)}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  quote.status === 'approved' ? 'default' :
                                  quote.status === 'rejected' ? 'destructive' :
                                  'secondary'
                                } 
                                className="text-[10px] cursor-pointer"
                                onClick={() => handleStatusChange(quote.id, quote.status)}
                              >
                                {quote.status === 'draft' ? 'Rascunho' :
                                 quote.status === 'sent' ? 'Enviado' :
                                 quote.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" asChild>
                                <a href={`/orcamentos-online?id=${quote.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" />
                                  <span className="hidden sm:inline">Ver</span>
                                </a>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="commissions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalhamento de Comissões</CardTitle>
                <CardDescription>Acompanhe o status de pagamento de suas vendas</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="p-8 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Wallet className="h-10 w-10 opacity-20" />
                      <p>Visualize o extrato detalhado em 
                        <a href="/comissoes/minhas" className="text-primary hover:underline ml-1 font-medium">Minha Comissão</a>.
                      </p>
                    </div>
                  </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Context Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Gestão de Clientes (CNPJ)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                Como representante, você pode cadastrar novos clientes diretamente via CNPJ dentro do módulo de orçamentos. 
                Seus cadastros são privados e visíveis apenas para você e seus supervisores.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Consulta automática via base da Receita Federal</li>
                <li>Histórico de orçamentos vinculados por empresa</li>
                <li>Conversão direta de Orçamento para Pedido após aprovação</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Handshake className="h-4 w-4" /> Fluxo de Pedidos
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-3">
              <p>
                Toda proposta criada vira um registro no CRM. Assim que o cliente aprova e o faturamento é realizado:
              </p>
              <div className="flex items-center gap-4 py-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">1</div>
                  <span className="text-[10px]">Orçamento</span>
                </div>
                <div className="h-px flex-1 bg-border" />
                <div className="flex flex-col items-center gap-1">
                  <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold">2</div>
                  <span className="text-[10px]">Pedido</span>
                </div>
                <div className="h-px flex-1 bg-border" />
                <div className="flex flex-col items-center gap-1">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold">3</div>
                  <span className="text-[10px]">Faturamento</span>
                </div>
              </div>
              <p>A comissão é gerada automaticamente baseada no faturamento validado pelo supervisor.</p>
            </CardContent>
          </Card>
        </div>
      </div>
      <OnlineQuoteFormDialog 
        open={isQuoteDialogOpen} 
        initialData={selectedQuoteForEdit}
        onOpenChange={(open) => {
          setIsQuoteDialogOpen(open);
          if (!open) {
            setSelectedQuoteForEdit(null);
            refetchQuotes();
          }
        }} 
      />
    </MainLayout>
  );
}
