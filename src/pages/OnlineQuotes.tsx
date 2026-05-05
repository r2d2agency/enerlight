import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, List, Settings, ShieldCheck, Loader2, Eye, Download } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePriceLists, useOnlineQuoteMutations, useOnlineQuotes } from "@/hooks/use-online-quotes";
import { OnlineQuoteFormDialog } from "@/components/crm/OnlineQuoteFormDialog";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateQuotePDF } from "@/lib/pdf-generator";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function OnlineQuotes() {
  const { user } = useAuth();
  const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
  const isAdmin = ['owner', 'admin', 'manager'].includes(user?.role || '');

  const { data: priceLists, isLoading: loadingPriceLists } = usePriceLists();
  const { data: quotes, isLoading: loadingQuotes } = useOnlineQuotes();
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleDownloadPDF = async (quote: any) => {
    try {
      const fullQuote = await api<any>(`/api/online-quotes/quotes/${quote.id}`);
      const org = await api<any>(`/api/organizations/${user?.organization_id}`);
      await generateQuotePDF(fullQuote, org);
    } catch (err) {
      toast.error("Erro ao gerar PDF");
    }
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orçamentos Online</h1>
            <p className="text-muted-foreground">
              Gerencie tabelas de preços, permissões e gere orçamentos personalizados.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setIsNewQuoteOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Novo Orçamento
            </Button>
          </div>
        </div>

        <Tabs defaultValue="quotes" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="quotes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Orçamentos
            </TabsTrigger>
            <TabsTrigger value="price-lists" className="flex items-center gap-2">
              <List className="h-4 w-4" /> Tabelas
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="access" className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Permissões
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Ajustes
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="quotes" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Meus Orçamentos</CardTitle>
                <CardDescription>
                  Visualize e gerencie seus orçamentos gerados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingQuotes ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : quotes && quotes.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((quote) => (
                        <TableRow key={quote.id}>
                          <TableCell className="text-sm">
                            {format(parseISO(quote.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="font-medium">{quote.client_name}</TableCell>
                          <TableCell>{formatCurrency(quote.total_value)}</TableCell>
                          <TableCell>
                            <Badge variant={
                              quote.status === 'approved' ? 'default' :
                              quote.status === 'rejected' ? 'destructive' :
                              'secondary'
                            }>
                              {quote.status === 'draft' ? 'Rascunho' :
                               quote.status === 'sent' ? 'Enviado' :
                               quote.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" title="Visualizar">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" title="Baixar PDF" onClick={() => handleDownloadPDF(quote)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                    <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium">Nenhum orçamento encontrado</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                      Comece criando seu primeiro orçamento clicando no botão acima.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="price-lists" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Tabelas de Preços</CardTitle>
                  <CardDescription>
                    Tabelas disponíveis para seu perfil.
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" /> Nova Tabela
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {loadingPriceLists ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {priceLists?.map(pl => (
                      <Card key={pl.id} className="hover:border-primary/50 transition-colors cursor-pointer">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{pl.name}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground">{pl.description || "Sem descrição"}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <Badge variant={pl.is_active ? "default" : "secondary"}>
                              {pl.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {priceLists?.length === 0 && (
                      <div className="col-span-full py-12 text-center border-2 border-dashed rounded-lg">
                        <List className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                        <h3 className="text-lg font-medium">Nenhuma tabela de preços</h3>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="access" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Controle de Acesso</CardTitle>
                    <CardDescription>
                      Gerencie quais usuários ou canais podem acessar cada tabela de preços.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground italic">Em desenvolvimento...</p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="settings" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuração do Orçamento</CardTitle>
                    <CardDescription>
                      Personalize a página de rosto e o rodapé dos orçamentos gerados.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="grid gap-2">
                        <label className="text-sm font-medium">Página de Rosto Padrão (URL)</label>
                        <input type="text" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" placeholder="https://..." />
                     </div>
                     <div className="grid gap-2">
                        <label className="text-sm font-medium">Rodapé Padrão</label>
                        <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" placeholder="Informações de contato, termos e condições..." />
                     </div>
                     <Button>Salvar Configurações</Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>

        <OnlineQuoteFormDialog 
          open={isNewQuoteOpen} 
          onOpenChange={setIsNewQuoteOpen} 
        />
      </div>
    </MainLayout>
  );
}
