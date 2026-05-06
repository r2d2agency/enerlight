import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, List, Settings, ShieldCheck, Loader2, Eye, Download, LayoutTemplate, Pencil, Image as ImageIcon, Upload, Globe, Instagram, Linkedin, Phone, Mail as MailIcon } from "lucide-react";
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
import { RichEmailEditor } from "@/components/email/RichEmailEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OnlineQuotes() {
  const { user } = useAuth();
  const [isNewQuoteOpen, setIsNewQuoteOpen] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState<{id: string, name: string} | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  const [isPriceListDialogOpen, setIsPriceListDialogOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<any>(null);

  const isAdmin = ['owner', 'admin', 'manager'].includes(user?.role || '');
  const canEditPriceLists = isAdmin || user?.user_permissions?.can_edit_price_lists;

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
                    {priceLists?.map(pl => (
                      <Card 
                        key={pl.id} 
                        className="hover:border-primary/50 transition-colors cursor-pointer group"
                      >
                        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                          <CardTitle className="text-base" onClick={() => setSelectedPriceList(pl)}>{pl.name}</CardTitle>
                          {canEditPriceLists && (
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
