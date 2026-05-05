import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, List, Settings, ShieldCheck, Loader2, Eye, Download, LayoutTemplate, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePriceLists, useOnlineQuoteMutations, useOnlineQuotes, useOnlineQuoteTemplates } from "@/hooks/use-online-quotes";
import { OnlineQuoteFormDialog } from "@/components/crm/OnlineQuoteFormDialog";
import { PriceListItemsDialog } from "@/components/crm/PriceListItemsDialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateQuotePDF } from "@/lib/pdf-generator";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function OnlineQuotes() {
  const { user } = useAuth();
  const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState<{id: string, name: string} | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [isPriceListDialogOpen, setIsPriceListDialogOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<any>(null);

  const isAdmin = ['owner', 'admin', 'manager'].includes(user?.role || '');

  const { data: priceLists, isLoading: loadingPriceLists } = usePriceLists();
  const { data: quotes, isLoading: loadingQuotes } = useOnlineQuotes();
  const { data: templates, isLoading: loadingTemplates } = useOnlineQuoteTemplates();
  const { saveTemplate, savePriceList } = useOnlineQuoteMutations();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
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

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      id: editingTemplate?.id,
      name: formData.get('name'),
      description: formData.get('description'),
      cover_url: formData.get('cover_url'),
      header_text: formData.get('header_text'),
      footer_text: formData.get('footer_text'),
      is_default: formData.get('is_default') === 'on'
    };

    try {
      await saveTemplate.mutateAsync(data);
      setIsTemplateDialogOpen(false);
    } catch (err) {
      toast.error("Erro ao salvar template");
    }
  };

  const handleSavePriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      id: editingPriceList?.id,
      name: formData.get('name'),
      description: formData.get('description'),
      segment: formData.get('segment'),
      is_active: formData.get('is_active') === 'on'
    };

    try {
      await savePriceList.mutateAsync(data);
      setIsPriceListDialogOpen(false);
    } catch (err) {
      toast.error("Erro ao salvar tabela");
    }
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orçamentos Online</h1>
            <p className="text-muted-foreground">
              Gerencie tabelas de preços, modelos de capa e gere orçamentos personalizados.
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
                <TabsTrigger value="templates" className="flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4" /> Modelos
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
                    Tabelas disponíveis por segmento ou canal.
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => { setEditingPriceList(null); setIsPriceListDialogOpen(true); }}>
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
                      <Card 
                        key={pl.id} 
                        className="hover:border-primary/50 transition-colors cursor-pointer group"
                      >
                        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                          <CardTitle className="text-base" onClick={() => setSelectedPriceList(pl)}>{pl.name}</CardTitle>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditingPriceList(pl); setIsPriceListDialogOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </CardHeader>
                        <CardContent onClick={() => setSelectedPriceList(pl)}>
                          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">{pl.description || "Sem descrição"}</p>
                          <div className="mt-4 flex items-center justify-between">
                            <Badge variant={pl.is_active ? "default" : "secondary"}>
                              {pl.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                            {pl.segment && (
                              <Badge variant="outline" className="bg-primary/5">
                                {pl.segment}
                              </Badge>
                            )}
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

          <TabsContent value="templates" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Modelos de Capa</CardTitle>
                  <CardDescription>
                    Gerencie os modelos de folha de rosto disponíveis para os vendedores.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setEditingTemplate(null); setIsTemplateDialogOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" /> Novo Modelo
                </Button>
              </CardHeader>
              <CardContent>
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {templates?.map(tpl => (
                      <Card key={tpl.id} className="group overflow-hidden">
                        <div className="aspect-[4/3] bg-muted relative">
                          {tpl.cover_url ? (
                            <img src={tpl.cover_url} alt={tpl.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                              <LayoutTemplate className="h-12 w-12" />
                            </div>
                          )}
                          <div className="absolute top-2 right-2 flex gap-1">
                            {tpl.is_default && <Badge variant="default" className="shadow-sm">Padrão</Badge>}
                            <Button 
                              variant="secondary" 
                              size="icon" 
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 shadow-sm"
                              onClick={() => { setEditingTemplate(tpl); setIsTemplateDialogOpen(true); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <CardHeader className="p-4">
                          <CardTitle className="text-base">{tpl.name}</CardTitle>
                          <CardDescription className="line-clamp-1">{tpl.description}</CardDescription>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Configurações do Módulo</CardTitle>
                <CardDescription>
                  Permissões avançadas e configurações globais.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground italic">Em desenvolvimento...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Template Dialog */}
        <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Editar Modelo" : "Novo Modelo de Capa"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveTemplate} className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nome do Modelo</Label>
                    <Input name="name" defaultValue={editingTemplate?.name} required placeholder="Ex: Modelo Corporativo" />
                  </div>
                  <div className="space-y-2">
                    <Label>URL da Imagem de Capa</Label>
                    <Input name="cover_url" defaultValue={editingTemplate?.cover_url} placeholder="https://..." onChange={(e) => setEditingTemplate({...editingTemplate, cover_url: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input name="description" defaultValue={editingTemplate?.description} placeholder="Breve descrição do modelo" />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto de Cabeçalho (HTML)</Label>
                    <Textarea name="header_text" defaultValue={editingTemplate?.header_text} placeholder="Opcional..." className="font-mono text-xs h-24" />
                  </div>
                  <div className="space-y-2">
                    <Label>Texto de Rodapé (HTML)</Label>
                    <Textarea name="footer_text" defaultValue={editingTemplate?.footer_text} placeholder="Opcional..." className="font-mono text-xs h-24" />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>Preview da Capa</Label>
                  <div className="aspect-[3/4] border rounded-lg overflow-hidden bg-muted flex items-center justify-center relative shadow-inner">
                    {editingTemplate?.cover_url ? (
                      <img src={editingTemplate.cover_url} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-4">
                        <ImageIcon className="h-12 w-12 text-muted-foreground/20 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Insira uma URL para visualizar a capa</p>
                      </div>
                    )}
                    <div className="absolute top-0 left-0 w-full p-2 bg-white/80 backdrop-blur-sm border-b text-[8px] truncate">
                      {editingTemplate?.header_text || "Cabeçalho do Modelo"}
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-2 bg-white/80 backdrop-blur-sm border-t text-[8px] truncate">
                      {editingTemplate?.footer_text || "Rodapé do Modelo"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-4 border-t">
                <Switch name="is_default" id="is_default" defaultChecked={editingTemplate?.is_default} />
                <Label htmlFor="is_default">Tornar modelo padrão para novos orçamentos</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saveTemplate.isPending}>
                  {saveTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Modelo
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Price List Dialog */}
        <Dialog open={isPriceListDialogOpen} onOpenChange={setIsPriceListDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPriceList ? "Editar Tabela" : "Nova Tabela de Preços"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSavePriceList} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome da Tabela</Label>
                <Input name="name" defaultValue={editingPriceList?.name} required />
              </div>
              <div className="space-y-2">
                <Label>Segmento / Canal</Label>
                <Input name="segment" defaultValue={editingPriceList?.segment} placeholder="Ex: Construção Civil, E-commerce..." />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea name="description" defaultValue={editingPriceList?.description} />
              </div>
              <div className="flex items-center space-x-2">
                <Switch name="is_active" id="is_active" defaultChecked={editingPriceList?.is_active !== false} />
                <Label htmlFor="is_active">Tabela Ativa</Label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPriceListDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={savePriceList.isPending}>
                  {savePriceList.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Tabela
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <OnlineQuoteFormDialog 
          open={isNewQuoteOpen} 
          onOpenChange={setIsNewQuoteOpen} 
        />

        <PriceListItemsDialog 
          priceList={selectedPriceList} 
          onOpenChange={(open) => !open && setSelectedPriceList(null)} 
        />
      </div>
    </MainLayout>
  );
}
