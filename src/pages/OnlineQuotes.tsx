import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, List, Settings, ShieldCheck, Loader2, Eye, Download, LayoutTemplate, Pencil, Image as ImageIcon, Upload, Globe, Instagram, Linkedin, Phone, Mail as MailIcon, Trash2, Building2, Search, CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePriceLists, useOnlineQuoteMutations, useOnlineQuotes, useOnlineQuoteTemplates, usePermissionTemplates } from "@/hooks/use-online-quotes";
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
import { RichEmailEditor } from "@/components/email/RichEmailEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OnlineQuotes() {
  const { user } = useAuth();
  const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<any>(null);
  const [selectedPriceList, setSelectedPriceList] = useState<{id: string, name: string} | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  const [isPriceListDialogOpen, setIsPriceListDialogOpen] = useState(false);
  const [selectedQuoteForPreview, setSelectedQuoteForPreview] = useState<any>(null);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [editingPriceList, setEditingPriceList] = useState<any>(null);

  const isAdmin = ['owner', 'admin', 'manager'].includes(user?.role || '');
  const canEditPriceLists = isAdmin || user?.user_permissions?.can_edit_price_lists;

  const { data: priceLists, isLoading: loadingPriceLists } = usePriceLists();
  
  const filteredPriceLists = priceLists?.filter(pl => {
    if (isAdmin) return true;
    if (!pl.is_active) return false;
    if (!pl.allowed_templates || pl.allowed_templates.length === 0) return true;
    
    // @ts-ignore - Assuming user might have permission_template_id
    const userTemplateId = user?.permission_template_id;
    return pl.allowed_templates.includes(userTemplateId);
  });

  const { data: quotes, isLoading: loadingQuotes } = useOnlineQuotes();
  const { data: templates, isLoading: loadingTemplates } = useOnlineQuoteTemplates();
  const { data: permissionTemplates } = usePermissionTemplates();
  const { saveTemplate, savePriceList, deletePriceList, deleteQuote, updateQuoteStatus } = useOnlineQuoteMutations();
  
  const filteredQuotes = quotes?.filter(quote => {
    const matchesSearch = quote.client_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (quote.client_email && quote.client_email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (dateFilter === "all") return true;
    
    const quoteDate = parseISO(quote.created_at);
    const today = new Date();
    
    if (dateFilter === "today") {
      return format(quoteDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
    }
    if (dateFilter === "week") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      return quoteDate >= sevenDaysAgo;
    }
    if (dateFilter === "month") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      return quoteDate >= thirtyDaysAgo;
    }
    
    return true;
  });

  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);

  useEffect(() => {
    if (editingPriceList) {
      setSelectedTemplates(editingPriceList.allowed_templates || []);
    } else {
      setSelectedTemplates([]);
    }
  }, [editingPriceList]);

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

  const handlePreviewQuote = async (quote: any) => {
    try {
      const fullQuote = await api<any>(`/api/online-quotes/quotes/${quote.id}`);
      // Ensure organization info is available for the preview/PDF logic
      const org = await api<any>(`/api/organizations/${user?.organization_id}`);
      setSelectedQuoteForPreview({ ...fullQuote, organization: org });
      setIsPreviewDialogOpen(true);
    } catch (err) {
      toast.error("Erro ao carregar detalhes do orçamento");
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    // Build footer config from current state
    const footerConfig = editingTemplate?.footer_config || {
      left: { type: 'text', content: '' },
      center: { type: 'logo', content: '' },
      right: { type: 'social', content: '' },
      social: { website: '', instagram: '', linkedin: '', phone: '', email: '' }
    };

    const data = {
      id: editingTemplate?.id,
      name: (formData.get('name') as string) || editingTemplate?.name,
      description: (formData.get('description') as string) || editingTemplate?.description,
      cover_url: editingTemplate?.cover_url || '',
      header_text: editingTemplate?.header_text || '',
      footer_text: editingTemplate?.footer_text || '',
      footer_config: JSON.stringify(footerConfig),
      is_default: formData.get('is_default') === 'on'
    };

    if (!data.name) {
      toast.error("O nome do modelo é obrigatório");
      return;
    }

    try {
      console.log("Saving template data:", data);
      await saveTemplate.mutateAsync(data);
      setIsTemplateDialogOpen(false);
      toast.success("Modelo salvo com sucesso!");
    } catch (err: any) {
      console.error("Erro detalhado ao salvar template:", err);
      // More descriptive error for common issues
      if (err?.message?.includes("502") || err?.status === 502) {
        toast.error("O servidor demorou muito para responder. Tente novamente em instantes.");
      } else if (err?.message?.includes("500") || err?.status === 500) {
        toast.error("Erro interno no servidor ao salvar. Verifique se os campos estão corretos.");
      } else {
        toast.error(err?.message || "Erro ao salvar modelo");
      }
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
      markup_percentage: parseFloat(formData.get('markup_percentage') as string || '0'),
      discount_limit_percentage: parseFloat(formData.get('discount_limit_percentage') as string || '0'),
      is_master: formData.get('is_master') === 'on',
      allowed_templates: selectedTemplates,
      is_active: formData.get('is_active') === 'on'
    };

    try {
      await savePriceList.mutateAsync(data);
      setIsPriceListDialogOpen(false);
    } catch (err) {
      toast.error("Erro ao salvar tabela");
    }
  };

  const handleEditQuote = async (quote: any) => {
    try {
      const fullQuote = await api<any>(`/api/online-quotes/quotes/${quote.id}`);
      setEditingQuote(fullQuote);
      setIsNewQuoteOpen(true);
    } catch (err) {
      toast.error("Erro ao carregar detalhes para edição");
    }
  };

  const handleChangeStatus = async (id: string, status: string) => {
    try {
      await updateQuoteStatus.mutateAsync({ id, status });
    } catch (err) {
      // Handled by mutation
    }
  };

  const handleDeletePriceList = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir a tabela "${name}"? Esta ação não pode ser desfeita.`)) {
      try {
        await deletePriceList.mutateAsync(id);
      } catch (err) {
        // Error handled by mutation toast
      }
    }
  };

  const handleDeleteQuote = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir este orçamento?")) {
      try {
        await deleteQuote.mutateAsync(id);
      } catch (err) {
        // Handled by mutation
      }
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
            <Button onClick={() => {
              setSelectedPriceList(null); // Reset items view
              setIsNewQuoteOpen(true);
            }}>
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
            {canEditPriceLists && (
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
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Meus Orçamentos</CardTitle>
                  <CardDescription>
                    Visualize e gerencie seus orçamentos gerados.
                  </CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por cliente..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Data" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todo período</SelectItem>
                      <SelectItem value="today">Hoje</SelectItem>
                      <SelectItem value="week">Últimos 7 dias</SelectItem>
                      <SelectItem value="month">Últimos 30 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loadingQuotes ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredQuotes && filteredQuotes.length > 0 ? (
                  <div className="grid gap-3">
                    {filteredQuotes.map((quote) => (
                      <div 
                        key={quote.id} 
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-card hover:border-primary/50 transition-all shadow-sm group relative overflow-hidden"
                      >
                        <div className="flex items-start gap-4">
                          <div className="bg-primary/10 p-2.5 rounded-lg text-primary shrink-0">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-bold text-base truncate max-w-[200px] sm:max-w-md">{quote.client_name}</h4>
                              <div className="flex gap-1">
                                <Badge variant={
                                  quote.status === 'approved' ? 'default' :
                                  quote.status === 'rejected' ? 'destructive' :
                                  'secondary'
                                } className="text-[10px] h-5 px-1.5 uppercase font-bold tracking-wider cursor-pointer"
                                onClick={() => {
                                  const nextStatus = quote.status === 'draft' ? 'sent' : 
                                                    quote.status === 'sent' ? 'approved' : 
                                                    quote.status === 'approved' ? 'rejected' : 'draft';
                                  handleChangeStatus(quote.id, nextStatus);
                                }}>
                                  {quote.status === 'draft' ? 'Rascunho' :
                                   quote.status === 'sent' ? 'Enviado' :
                                   quote.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <CalendarDays className="h-3 w-3" /> {format(parseISO(quote.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                              <span className="font-bold text-foreground">
                                {formatCurrency(quote.total_value)}
                              </span>
                              {quote.client_email && (
                                <span className="hidden md:flex items-center gap-1.5">
                                  <MailIcon className="h-3 w-3" /> {quote.client_email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-end gap-1 mt-4 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-dashed">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-9 px-3 hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={() => handlePreviewQuote(quote)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            <span className="sm:inline hidden">Visualizar</span>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-9 px-3 hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={() => handleEditQuote(quote)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            <span className="sm:inline hidden">Editar</span>
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-9 px-3 hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={() => handleDownloadPDF(quote)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            <span className="sm:inline hidden">PDF</span>
                          </Button>
                          {isAdmin && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDeleteQuote(quote.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
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
                {canEditPriceLists && (
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
                    {filteredPriceLists?.map(pl => (
                      <Card 
                        key={pl.id} 
                        className="hover:border-primary/50 transition-colors cursor-pointer group"
                        onClick={() => setSelectedPriceList(pl)}
                      >
                        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                          <CardTitle className="text-base">{pl.name}</CardTitle>
                          {canEditPriceLists && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setEditingPriceList(pl); setIsPriceListDialogOpen(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); handleDeletePriceList(pl.id, pl.name); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]">{pl.description || "Sem descrição"}</p>
                          <div className="mt-4 flex flex-wrap gap-2 items-center justify-between">
                            <div className="flex gap-1">
                              <Badge variant={pl.is_active ? "default" : "secondary"}>
                                {pl.is_active ? "Ativa" : "Inativa"}
                              </Badge>
                              {pl.is_master && (
                                <Badge variant="outline" className="border-primary text-primary bg-primary/5">
                                  Matriz
                                </Badge>
                              )}
                            </div>
                            {pl.segment && (
                              <Badge variant="outline" className="bg-primary/5">
                                {pl.segment}
                              </Badge>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {filteredPriceLists?.length === 0 && (
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
                <Button variant="outline" size="sm" onClick={() => { 
                  setEditingTemplate({
                    name: "",
                    description: "",
                    cover_url: "",
                    header_text: "",
                    footer_config: {
                      left: { type: 'text', content: '' },
                      center: { type: 'logo', content: '' },
                      right: { type: 'social', content: '' },
                      social: { website: '', instagram: '', linkedin: '', phone: '', email: '' }
                    }
                  }); 
                  setIsTemplateDialogOpen(true); 
                }}>
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
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-0">
              <DialogTitle>{editingTemplate ? "Editar Modelo" : "Novo Modelo de Capa"}</DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSaveTemplate} className="flex-1 overflow-hidden flex flex-col">
              <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
                <div className="px-6 border-b">
                  <TabsList className="bg-transparent h-12 w-full justify-start gap-4">
                    <TabsTrigger value="general" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Geral</TabsTrigger>
                    <TabsTrigger value="content" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Conteúdo</TabsTrigger>
                    <TabsTrigger value="footer" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Rodapé</TabsTrigger>
                    <TabsTrigger value="preview" className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">Visualização</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <TabsContent value="general" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Nome do Modelo</Label>
                          <Input name="name" defaultValue={editingTemplate?.name} required placeholder="Ex: Modelo Corporativo" />
                        </div>
                        <div className="space-y-2">
                          <Label>Descrição</Label>
                          <Input name="description" defaultValue={editingTemplate?.description} placeholder="Breve descrição do modelo" />
                        </div>
                        <div className="space-y-2">
                          <Label>Imagem de Capa (Página 1)</Label>
                          <div className="flex gap-2">
                            <Input 
                              name="cover_url" 
                              value={editingTemplate?.cover_url || ''} 
                              placeholder="https://..." 
                              className="flex-1" 
                              onChange={(e) => setEditingTemplate({...editingTemplate, cover_url: e.target.value})} 
                            />
                            <Button type="button" variant="outline" size="icon" className="relative shrink-0" title="Subir imagem do computador">
                              <Upload className="h-4 w-4" />
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="absolute inset-0 opacity-0 cursor-pointer" 
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  try {
                                    const res = await api<any>('/api/uploads', {
                                      method: 'POST',
                                      body: formData,
                                      isFormData: true
                                    });
                                    if (res.file?.url) {
                                      setEditingTemplate({...editingTemplate, cover_url: res.file.url});
                                      toast.success("Capa enviada!");
                                    }
                                  } catch (err) {
                                    toast.error("Erro ao subir imagem");
                                  }
                                }}
                              />
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground italic">Esta imagem será a primeira página inteira do PDF.</p>
                        </div>
                        <div className="flex items-center space-x-2 pt-4">
                          <Switch name="is_default" id="is_default" defaultChecked={editingTemplate?.is_default} />
                          <Label htmlFor="is_default">Modelo padrão</Label>
                        </div>
                      </div>
                      <div className="border rounded-lg bg-muted/30 p-2 flex items-center justify-center aspect-[3/4] overflow-hidden relative shadow-sm">
                        {editingTemplate?.cover_url ? (
                          <img src={editingTemplate.cover_url} alt="Preview" className="w-full h-full object-contain" />
                        ) : (
                          <div className="text-center text-muted-foreground/30">
                            <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                            <p className="text-xs">Preview da Capa</p>
                          </div>
                        )}
                        <Badge className="absolute top-2 left-2 pointer-events-none" variant="secondary">PÁGINA 1</Badge>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="content" className="mt-0 space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Texto de Cabeçalho / Informações Adicionais</Label>
                        <RichEmailEditor 
                          value={editingTemplate?.header_text || ''} 
                          onChange={(html) => setEditingTemplate({...editingTemplate, header_text: html})}
                          className="min-h-[400px]"
                        />
                        <p className="text-xs text-muted-foreground">Este texto aparecerá logo após a capa ou junto aos termos do orçamento.</p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="footer" className="mt-0 space-y-6">
                    <div className="space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        {['left', 'center', 'right'].map((col) => (
                          <div key={col} className="space-y-3 p-4 border rounded-lg bg-muted/10">
                            <Label className="capitalize font-bold flex items-center gap-2">
                              Coluna {col === 'left' ? 'Esquerda' : col === 'center' ? 'Central' : 'Direita'}
                            </Label>
                            <Select 
                              value={editingTemplate?.footer_config?.[col]?.type || 'text'}
                              onValueChange={(val) => {
                                const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                setEditingTemplate({
                                  ...editingTemplate,
                                  footer_config: {
                                    ...config,
                                    [col]: { ...config[col], type: val }
                                  }
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Texto Rico</SelectItem>
                                <SelectItem value="logo">Logotipo</SelectItem>
                                <SelectItem value="social">Ícones Sociais</SelectItem>
                              </SelectContent>
                            </Select>

                            {editingTemplate?.footer_config?.[col]?.type === 'text' && (
                              <Textarea 
                                className="text-xs min-h-[100px]"
                                placeholder="Texto..."
                                value={editingTemplate?.footer_config?.[col]?.content || ''}
                                onChange={(e) => {
                                  const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                  setEditingTemplate({
                                    ...editingTemplate,
                                    footer_config: {
                                      ...config,
                                      [col]: { ...config[col], content: e.target.value }
                                    }
                                  });
                                }}
                              />
                            )}

                            {editingTemplate?.footer_config?.[col]?.type === 'logo' && (
                              <div className="space-y-2">
                                <div className="aspect-square border rounded bg-white flex items-center justify-center p-2 relative overflow-hidden">
                                  {editingTemplate?.footer_config?.[col]?.content ? (
                                    <img src={editingTemplate?.footer_config?.[col]?.content} className="max-w-full max-h-full object-contain" />
                                  ) : <ImageIcon className="h-8 w-8 text-muted-foreground/20" />}
                                </div>
                                <div className="flex gap-1">
                                  <Input 
                                    className="text-[10px] h-8" 
                                    placeholder="URL da logo..."
                                    value={editingTemplate?.footer_config?.[col]?.content || ''}
                                    onChange={(e) => {
                                      const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                      setEditingTemplate({
                                        ...editingTemplate,
                                        footer_config: {
                                          ...config,
                                          [col]: { ...config[col], content: e.target.value }
                                        }
                                      });
                                    }}
                                  />
                                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 relative">
                                    <Upload className="h-3 w-3" />
                                    <input 
                                      type="file" 
                                      className="absolute inset-0 opacity-0 cursor-pointer" 
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        try {
                                          const res = await api<any>('/api/uploads', { method: 'POST', body: formData, isFormData: true });
                                          if (res.file?.url) {
                                            const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                            setEditingTemplate({
                                              ...editingTemplate,
                                              footer_config: { ...config, [col]: { ...config[col], content: res.file.url } }
                                            });
                                          }
                                        } catch(e) {}
                                      }}
                                    />
                                  </Button>
                                </div>
                              </div>
                            )}

                            {editingTemplate?.footer_config?.[col]?.type === 'social' && (
                              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                                <Globe className="h-8 w-8 mb-2 opacity-20" />
                                <p className="text-[10px] text-center">Configurado na seção abaixo</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-4 p-4 border rounded-lg">
                        <Label className="font-bold flex items-center gap-2">
                          <Settings className="h-4 w-4" /> Links e Redes Sociais
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs flex items-center gap-2"><Globe className="h-3 w-3" /> Website</Label>
                            <Input 
                              className="h-8 text-xs" 
                              placeholder="https://..." 
                              value={editingTemplate?.footer_config?.social?.website || ''}
                              onChange={(e) => {
                                const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                setEditingTemplate({
                                  ...editingTemplate,
                                  footer_config: { ...config, social: { ...config.social, website: e.target.value } }
                                });
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs flex items-center gap-2"><Instagram className="h-3 w-3" /> Instagram</Label>
                            <Input 
                              className="h-8 text-xs" 
                              placeholder="@usuario" 
                              value={editingTemplate?.footer_config?.social?.instagram || ''}
                              onChange={(e) => {
                                const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                setEditingTemplate({
                                  ...editingTemplate,
                                  footer_config: { ...config, social: { ...config.social, instagram: e.target.value } }
                                });
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs flex items-center gap-2"><Linkedin className="h-3 w-3" /> LinkedIn</Label>
                            <Input 
                              className="h-8 text-xs" 
                              placeholder="URL ou Nome" 
                              value={editingTemplate?.footer_config?.social?.linkedin || ''}
                              onChange={(e) => {
                                const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                setEditingTemplate({
                                  ...editingTemplate,
                                  footer_config: { ...config, social: { ...config.social, linkedin: e.target.value } }
                                });
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs flex items-center gap-2"><Phone className="h-3 w-3" /> WhatsApp / Tel</Label>
                            <Input 
                              className="h-8 text-xs" 
                              placeholder="(00) 00000-0000" 
                              value={editingTemplate?.footer_config?.social?.phone || ''}
                              onChange={(e) => {
                                const config = editingTemplate?.footer_config || { left:{}, center:{}, right:{}, social:{} };
                                setEditingTemplate({
                                  ...editingTemplate,
                                  footer_config: { ...config, social: { ...config.social, phone: e.target.value } }
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="preview" className="mt-0 h-full">
                    <div className="grid grid-cols-2 gap-6 h-full min-h-[500px]">
                      <div className="space-y-4">
                        <Label>Página 1 (Capa Inteira)</Label>
                        <div className="aspect-[3/4] border rounded shadow-md bg-white flex items-center justify-center overflow-hidden">
                          {editingTemplate?.cover_url ? (
                            <img src={editingTemplate.cover_url} className="w-full h-full object-cover" />
                          ) : <ImageIcon className="h-12 w-12 text-muted-foreground/10" />}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <Label>Páginas de Dados (Header/Footer)</Label>
                        <div className="aspect-[3/4] border rounded shadow-md bg-white flex flex-col p-4 relative overflow-hidden text-[6px]">
                          <div className="border-b pb-2 mb-4 opacity-50 text-left" style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: editingTemplate?.header_text || "Cabeçalho..." }} />
                          <div className="flex-1 bg-muted/20 rounded flex items-center justify-center text-muted-foreground/30">CONTEÚDO DO ORÇAMENTO</div>
                          <div className="mt-4 border-t pt-2 grid grid-cols-3 gap-2">
                             {['left', 'center', 'right'].map(col => {
                               const conf = editingTemplate?.footer_config?.[col];
                               return (
                                 <div key={col} className="text-center flex flex-col items-center justify-center">
                                   {conf?.type === 'logo' && conf.content && <img src={conf.content} className="h-4 object-contain" />}
                                   {conf?.type === 'text' && <span>{conf.content}</span>}
                                   {conf?.type === 'social' && (
                                     <div className="flex gap-1">
                                       {editingTemplate?.footer_config?.social?.instagram && <Instagram className="h-2 w-2" />}
                                       {editingTemplate?.footer_config?.social?.linkedin && <Linkedin className="h-2 w-2" />}
                                       {editingTemplate?.footer_config?.social?.website && <Globe className="h-2 w-2" />}
                                     </div>
                                   )}
                                 </div>
                               );
                             })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>

              <DialogFooter className="p-6 border-t bg-muted/20">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="markup_percentage">Markup / Acréscimo (%)</Label>
                  <Input 
                    id="markup_percentage" 
                    name="markup_percentage" 
                    type="number" 
                    step="0.01" 
                    defaultValue={editingPriceList?.markup_percentage || 0} 
                    placeholder="Ex: 20" 
                  />
                  <p className="text-[10px] text-muted-foreground">Aumenta o preço original em %</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount_limit_percentage">Limite de Desconto (%)</Label>
                  <Input 
                    id="discount_limit_percentage" 
                    name="discount_limit_percentage" 
                    type="number" 
                    step="0.01" 
                    defaultValue={editingPriceList?.discount_limit_percentage || 0} 
                    placeholder="Ex: 10" 
                  />
                  <p className="text-[10px] text-muted-foreground">Máximo de desconto permitido</p>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Grupos com Acesso</Label>
                <div className="border rounded-lg p-3 bg-muted/5 max-h-[150px] overflow-y-auto space-y-2">
                  {permissionTemplates?.map(tpl => (
                    <div key={tpl.id} className="flex items-center space-x-2">
                      <Switch 
                        id={`tpl-${tpl.id}`}
                        checked={selectedTemplates.includes(tpl.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedTemplates([...selectedTemplates, tpl.id]);
                          else setSelectedTemplates(selectedTemplates.filter(id => id !== tpl.id));
                        }}
                      />
                      <Label htmlFor={`tpl-${tpl.id}`} className="text-sm font-normal cursor-pointer">
                        {tpl.name}
                      </Label>
                    </div>
                  ))}
                  {(!permissionTemplates || permissionTemplates.length === 0) && (
                    <p className="text-xs text-muted-foreground">Nenhum grupo de acesso configurado</p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Se nenhum grupo for selecionado, todos terão acesso.</p>
              </div>

              <div className="flex flex-col gap-4 pt-2">
                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_master">Tabela Matriz</Label>
                    <p className="text-[10px] text-muted-foreground">Usa esta tabela como base para fotos e preços de custo</p>
                  </div>
                  <Switch 
                    id="is_master" 
                    name="is_master" 
                    defaultChecked={editingPriceList?.is_master} 
                  />
                </div>
                <div className="flex items-center justify-between space-x-2 border p-3 rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_active">Tabela Ativa</Label>
                    <p className="text-[10px] text-muted-foreground">Habilita o uso desta tabela nos orçamentos</p>
                  </div>
                  <Switch 
                    id="is_active" 
                    name="is_active" 
                    defaultChecked={editingPriceList?.is_active !== false} 
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsPriceListDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={savePriceList.isPending}>
                  {savePriceList.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Tabela
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
          <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 border-b shrink-0">
              <div className="flex items-center justify-between pr-8">
                <DialogTitle>Visualizar Orçamento</DialogTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleDownloadPDF(selectedQuoteForPreview)}>
                    <Download className="mr-2 h-4 w-4" /> PDF
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-0 bg-slate-100">
              {selectedQuoteForPreview && (
                <div className="max-w-[1100px] mx-auto my-8 bg-white shadow-2xl rounded-sm p-12 min-h-[800px] flex flex-col font-sans border text-slate-900 !text-black">
                  {/* Fake PDF Preview Header */}
                  <div className="flex justify-between items-start mb-10 border-b pb-8 border-slate-200">
                    <div className="space-y-1">
                      <h2 className="text-3xl font-black tracking-tighter text-black">ORÇAMENTO</h2>
                      <p className="text-sm font-bold text-slate-500 uppercase">#{selectedQuoteForPreview.id.split('-')[0].toUpperCase()}</p>
                      <p className="text-sm text-slate-500">{format(parseISO(selectedQuoteForPreview.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                    </div>
                    <div className="text-right space-y-2">
                      <div className="h-16 w-40 ml-auto rounded flex items-center justify-end overflow-hidden">
                        {selectedQuoteForPreview.organization?.logo_url ? (
                          <img src={selectedQuoteForPreview.organization.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <div className="bg-slate-50 h-full w-full rounded flex items-center justify-center border border-dashed border-slate-300">
                            <Building2 className="h-8 w-8 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <p className="text-lg font-black uppercase text-black">{selectedQuoteForPreview.organization?.name || (user as any)?.organization_name || "Empresa"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-12 bg-slate-50/50 p-8 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Destinatário</p>
                      <p className="font-bold text-lg leading-tight text-black">{selectedQuoteForPreview.client_name}</p>
                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        {selectedQuoteForPreview.client_document && <p><span className="font-semibold text-black">CNPJ/CPF:</span> {selectedQuoteForPreview.client_document}</p>}
                        {selectedQuoteForPreview.client_email && <p><span className="font-semibold text-black">Email:</span> {selectedQuoteForPreview.client_email}</p>}
                        {selectedQuoteForPreview.client_phone && <p><span className="font-semibold text-black">WhatsApp:</span> {selectedQuoteForPreview.client_phone}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Condições</p>
                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        <p><span className="font-semibold text-black">Forma de Pagamento:</span> {selectedQuoteForPreview.payment_method?.toUpperCase() || 'N/A'}</p>
                        <p><span className="font-semibold text-black">Prazo de Pagamento:</span> {selectedQuoteForPreview.payment_terms?.toUpperCase() || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-900">
                          <th className="text-left py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Descrição do Produto</th>
                          <th className="text-center py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-24">Qtd</th>
                          <th className="text-right py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-36">Unitário</th>
                          <th className="text-right py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-24">Desc.</th>
                          <th className="text-right py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 w-36">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedQuoteForPreview.items?.map((item: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-6 pr-4">
                              <div className="flex items-center gap-4">
                                {selectedQuoteForPreview.include_images && item.image_url && (
                                  <div className="h-16 w-16 border border-slate-100 rounded-lg bg-white shrink-0 overflow-hidden shadow-sm">
                                    <img src={item.image_url} className="h-full w-full object-cover" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-base font-bold text-slate-900 !text-black mb-1">{item.product_name}</p>
                                  <p className="text-[10px] text-slate-400 tracking-tight font-medium uppercase">{item.product_code}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-6 text-center text-sm font-bold text-slate-900 !text-black">{item.quantity}</td>
                            <td className="py-6 text-right text-sm font-bold text-slate-900 !text-black">{formatCurrency(item.unit_price)}</td>
                            <td className="py-6 text-right text-sm font-bold text-slate-900 !text-black">
                              {item.discount_type === 'percentage' 
                                ? `${item.discount_value || item.discount || 0}%` 
                                : formatCurrency(item.discount_value || item.discount || 0)}
                            </td>
                            <td className="py-6 text-right text-base font-black text-slate-900 !text-black">{formatCurrency(item.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-12 pt-8 border-t-4 border-black">
                    <div className="flex justify-end mb-12">
                      <div className="bg-black text-white p-8 rounded-2xl min-w-[300px] shadow-xl">
                        <div className="flex justify-between items-center gap-12">
                          <span className="text-xs font-black uppercase tracking-[0.2em] opacity-70">Total do Orçamento</span>
                          <span className="text-3xl font-black">
                            {formatCurrency(selectedQuoteForPreview.total_value)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedQuoteForPreview.notes && (
                      <div className="space-y-4 p-8 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observações Adicionais</p>
                        <div 
                          className="text-sm text-black leading-relaxed font-medium" 
                          dangerouslySetInnerHTML={{ __html: selectedQuoteForPreview.notes }} 
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="p-4 border-t shrink-0">
              <Button onClick={() => setIsPreviewDialogOpen(false)}>Fechar Visualização</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OnlineQuoteFormDialog 
          open={isNewQuoteOpen} 
          onOpenChange={setIsNewQuoteOpen} 
        />

        <PriceListItemsDialog 
          priceList={selectedPriceList} 
          onOpenChange={(open) => !open && setSelectedPriceList(null)} 
          canEdit={canEditPriceLists}
        />
      </div>
    </MainLayout>
  );
}
