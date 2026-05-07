import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Search, Loader2, Save, Image as ImageIcon, Eye, X, Building2, List } from "lucide-react";
import { usePriceLists, usePriceListItems, useOnlineQuoteMutations, useOnlineQuoteTemplates } from "@/hooks/use-online-quotes";
import { useCRMCompanies } from "@/hooks/use-crm";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface OnlineQuoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnlineQuoteFormDialog({ open, onOpenChange }: OnlineQuoteFormDialogProps) {
  const { user } = useAuth();
  const isRepresentative = user?.role === 'representative';
  const [step, setStep] = useState<"client" | "payment" | "items">("client");
  const [clientInfo, setClientInfo] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    notes: "",
    payment_terms: "avista",
    payment_method: "pix"
  });
  const [selectedPriceListId, setSelectedPriceListId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [quoteItems, setQuoteItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [includeImagesInQuote, setIncludeImagesInQuote] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSearchingCNPJ, setIsSearchingCNPJ] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [showCompanyResults, setShowCompanyResults] = useState(false);

  const { data: priceLists } = usePriceLists();
  const { data: templates } = useOnlineQuoteTemplates();
  const { data: priceListItems, isLoading: loadingItems } = usePriceListItems(selectedPriceListId);
  const { createQuote } = useOnlineQuoteMutations();
  const { data: existingCompanies } = useCRMCompanies(companySearch);

  useEffect(() => {
    if (templates?.length && !selectedTemplateId) {
      const defaultTemplate = templates.find(t => t.is_default);
      if (defaultTemplate) setSelectedTemplateId(defaultTemplate.id);
    }
  }, [templates]);

  const handleLookupCNPJ = async () => {
    const cnpj = clientInfo.document.replace(/\D/g, "");
    if (cnpj.length !== 14) {
      toast.error("CNPJ inválido");
      return;
    }

    setIsSearchingCNPJ(true);
    try {
      const data = await api<any>(`/api/cnpj/lookup/${cnpj}`);
      setClientInfo({
        ...clientInfo,
        name: data.razao_social || data.nome_fantasia || clientInfo.name,
        email: data.email || clientInfo.email,
        phone: data.telefone || clientInfo.phone
      });
      toast.success("Dados preenchidos via CNPJ");
    } catch (err) {
      toast.error("CNPJ não encontrado");
    } finally {
      setIsSearchingCNPJ(false);
    }
  };

  const selectCompany = (company: any) => {
    setClientInfo({
      name: company.name,
      document: company.cnpj || "",
      email: company.email || "",
      phone: company.phone || "",
      notes: clientInfo.notes,
      payment_terms: company.payment_terms || "",
      payment_method: company.payment_method || ""
    });
    setCompanySearch("");
    setShowCompanyResults(false);
  };

  const handleAddItem = (product: any) => {
    const existing = quoteItems.find(item => item.product_code === product.product_code);
    if (existing) {
      handleUpdateQty(product.product_code, existing.quantity + 1);
      return;
    }

    setQuoteItems([...quoteItems, {
      product_code: product.product_code,
      product_name: product.product_name,
      quantity: 1,
      unit_price: product.sale_price,
      total_price: product.sale_price,
      image_url: product.image_url,
      discount_type: 'fixed',
      discount: 0
    }]);
  };

  const handleUpdateQty = (code: string, qty: number) => {
    if (qty < 0) return;
    if (qty === 0) {
      handleRemoveItem(code);
      return;
    }
    setQuoteItems(quoteItems.map(item => {
      if (item.product_code === code) {
        const discountValue = item.discount_type === 'percentage' 
          ? (item.unit_price * (item.discount || 0) / 100)
          : (item.discount || 0);
        return { ...item, quantity: qty, total_price: qty * (item.unit_price - discountValue) };
      }
      return item;
    }));
  };

  const handleUpdateDiscount = (code: string, discount: number, type?: 'fixed' | 'percentage') => {
    const priceList = priceLists?.find(pl => pl.id === selectedPriceListId);
    const maxDiscountPercent = priceList?.discount_limit_percentage || 0;
    
    setQuoteItems(quoteItems.map(item => {
      if (item.product_code !== code) return item;
      
      const newType = type || item.discount_type || 'fixed';
      const unitPrice = item.unit_price;
      
      let discountPercent = 0;
      let discountValue = 0;

      if (newType === 'percentage') {
        discountPercent = discount;
        discountValue = (unitPrice * discount / 100);
      } else {
        discountValue = discount;
        discountPercent = (discount / unitPrice) * 100;
      }
      
      if (discountPercent > maxDiscountPercent) {
        toast.error(`Desconto máximo permitido: ${maxDiscountPercent}%`);
        return item;
      }
      
      return { 
        ...item, 
        discount: discount,
        discount_type: newType,
        total_price: item.quantity * (unitPrice - discountValue) 
      };
    }));
  };

  const handleRemoveItem = (code: string) => {
    setQuoteItems(quoteItems.filter(item => item.product_code !== code));
  };

  const handleSubmit = async () => {
    try {
      // First, create the company in CRM if it doesn't exist
      if (clientInfo.name) {
        try {
          await api("/api/online-quotes/companies/create-from-quote", {
            method: "POST",
            body: {
              name: clientInfo.name,
              document: clientInfo.document,
              email: clientInfo.email,
              phone: clientInfo.phone
            }
          });
        } catch (e) {
          console.error("Failed to sync company to CRM", e);
        }
      }

      await createQuote.mutateAsync({
        client_name: clientInfo.name,
        client_document: clientInfo.document,
        client_email: clientInfo.email,
        client_phone: clientInfo.phone,
        payment_terms: clientInfo.payment_terms,
        payment_method: clientInfo.payment_method,
        notes: clientInfo.notes,
        price_list_id: selectedPriceListId,
        template_id: selectedTemplateId,
        items: quoteItems,
        include_images: includeImagesInQuote
      });
      toast.success("Orçamento criado com sucesso!");
      onOpenChange(false);
      // Reset
      setStep("client");
      setQuoteItems([]);
      setClientInfo({ name: "", document: "", email: "", phone: "", notes: "", payment_terms: "", payment_method: "" });
    } catch (err) {
      toast.error("Erro ao criar orçamento");
    }
  };

  const filteredProducts = priceListItems?.filter(p => 
    p.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_code.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] lg:max-w-6xl w-full h-[95vh] lg:h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle>Novo Orçamento Online</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-2">
            {step === "client" ? (
              <div className="space-y-4">
                {!isRepresentative && (
                  <div className="relative">
                    <Label>Buscar Empresa Existente (Nome ou CNPJ)</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={companySearch}
                      onChange={e => {
                        setCompanySearch(e.target.value);
                        setShowCompanyResults(true);
                      }}
                      placeholder="Pesquisar..."
                    />
                    <Button 
                      size="icon" 
                      variant="outline" 
                      title="Buscar dados por CNPJ"
                      onClick={handleLookupCNPJ}
                      disabled={isSearchingCNPJ || clientInfo.document.replace(/\D/g, "").length !== 14}
                    >
                      {isSearchingCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                    </Button>
                  </div>
                  {showCompanyResults && existingCompanies && existingCompanies.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                      {existingCompanies.map((company) => (
                        <div 
                          key={company.id}
                          className="flex items-center gap-3 p-2 hover:bg-muted cursor-pointer text-sm"
                          onClick={() => selectCompany(company)}
                        >
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1">
                            <p className="font-medium">{company.name}</p>
                            <p className="text-[10px] text-muted-foreground">{company.cnpj || "Sem CNPJ"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome do Cliente / Razão Social *</Label>
                    <Input 
                      value={clientInfo.name} 
                      onChange={e => setClientInfo({...clientInfo, name: e.target.value})}
                      placeholder="Nome completo ou Razão Social"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF/CNPJ</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={clientInfo.document} 
                        onChange={e => setClientInfo({...clientInfo, document: e.target.value})}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input 
                      type="email"
                      value={clientInfo.email} 
                      onChange={e => setClientInfo({...clientInfo, email: e.target.value})}
                      placeholder="cliente@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone/WhatsApp</Label>
                    <Input 
                      value={clientInfo.phone} 
                      onChange={e => setClientInfo({...clientInfo, phone: e.target.value})}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Folha de Rosto (Template) *</Label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um modelo de capa..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates?.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name} {t.is_default && "(Padrão)"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tabela de Preços *</Label>
                    <Select value={selectedPriceListId} onValueChange={setSelectedPriceListId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma tabela..." />
                      </SelectTrigger>
                      <SelectContent>
                        {priceLists?.map(pl => (
                          <SelectItem key={pl.id} value={pl.id}>
                            {pl.name} {pl.segment ? `[${pl.segment}]` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Observações Internas</Label>
                  <Textarea 
                    value={clientInfo.notes} 
                    onChange={e => setClientInfo({...clientInfo, notes: e.target.value})}
                    placeholder="Anotações sobre este orçamento..."
                  />
                </div>
              </div>
            ) : step === "payment" ? (
              <div className="space-y-6 max-w-2xl mx-auto py-4">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Forma de Pagamento</Label>
                    <Select 
                      value={clientInfo.payment_method} 
                      onValueChange={val => setClientInfo({...clientInfo, payment_method: val})}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Selecione a forma..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boleto">Boleto Bancário</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                        <SelectItem value="transferencia">Transferência / TED</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Prazo de Pagamento</Label>
                    <Select 
                      value={clientInfo.payment_terms} 
                      onValueChange={val => setClientInfo({...clientInfo, payment_terms: val})}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Selecione o prazo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="avista">À Vista</SelectItem>
                        <SelectItem value="7_dias">7 dias</SelectItem>
                        <SelectItem value="15_dias">15 dias</SelectItem>
                        <SelectItem value="30_dias">30 dias</SelectItem>
                        <SelectItem value="30_60_dias">30/60 dias</SelectItem>
                        <SelectItem value="30_60_90_dias">30/60/90 dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Condições Adicionais (Observações do Orçamento)</Label>
                  <Textarea 
                    value={clientInfo.notes} 
                    onChange={e => setClientInfo({...clientInfo, notes: e.target.value})}
                    placeholder="Ex: Frete incluso, validade da proposta..."
                    className="min-h-[150px] text-base"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full gap-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">
                  {/* Seleção de Produtos */}
                  <div className="lg:col-span-5 border rounded-lg flex flex-col overflow-hidden bg-muted/10">
                    <div className="p-3 bg-muted flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 relative">
                        <Search className="h-4 w-4 absolute left-3 text-muted-foreground pointer-events-none" />
                        <Input 
                          placeholder="Buscar produto..." 
                          className="h-10 pl-9 bg-background"
                          value={productSearch}
                          onChange={e => setProductSearch(e.target.value)}
                        />
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={cn("h-10 w-10 p-0 shrink-0", showThumbnails && "text-primary bg-primary/10")}
                        onClick={() => setShowThumbnails(!showThumbnails)}
                        title="Mostrar fotos"
                      >
                        <ImageIcon className="h-5 w-5" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {loadingItems ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="p-2 space-y-2">
                          {filteredProducts?.map(product => (
                            <div 
                              key={product.id}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:border-primary/50 transition-colors cursor-pointer group shadow-sm"
                              onClick={() => handleAddItem(product)}
                            >
                              {showThumbnails && (
                                <div 
                                  className="h-16 w-16 rounded-md border bg-white flex-shrink-0 overflow-hidden relative group/thumb"
                                  onClick={(e) => {
                                    if (product.image_url) {
                                      e.stopPropagation();
                                      setPreviewImage(product.image_url);
                                    }
                                  }}
                                >
                                  {product.image_url ? (
                                    <>
                                      <img src={product.image_url} alt={product.product_name} className="h-full w-full object-cover" />
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                        <Eye className="h-5 w-5 text-white" />
                                      </div>
                                    </>
                                  ) : (
                                    <ImageIcon className="h-8 w-8 text-muted-foreground/20 m-auto" />
                                  )}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate leading-tight mb-1">{product.product_name}</p>
                                <p className="text-xs text-muted-foreground mb-1">{product.product_code}</p>
                                <p className="text-sm font-bold text-primary">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.sale_price)}</p>
                              </div>
                              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0 sm:opacity-0 group-hover:opacity-100">
                                <Plus className="h-5 w-5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Itens Adicionados */}
                  <div className="lg:col-span-7 border rounded-lg flex flex-col overflow-hidden shadow-sm">
                    <div className="p-3 bg-primary/5 border-b">
                      <p className="font-semibold flex items-center gap-2">
                        <List className="h-4 w-4" />
                        Itens do Orçamento ({quoteItems.length})
                      </p>
                    </div>
                    <div className="flex-1 overflow-x-auto overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="text-xs font-bold uppercase tracking-wider">Produto</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wider w-[100px]">Qtd</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wider w-[180px]">Desconto</TableHead>
                            <TableHead className="text-xs font-bold uppercase tracking-wider text-right">Total</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quoteItems.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                <div className="flex flex-col items-center gap-2">
                                  <Plus className="h-8 w-8 opacity-20" />
                                  <p>Selecione produtos ao lado para adicionar</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            quoteItems.map(item => (
                              <TableRow key={item.product_code} className="group hover:bg-muted/30">
                                <TableCell className="text-sm py-4">
                                  <p className="font-medium">{item.product_name}</p>
                                  <p className="text-[10px] text-muted-foreground">{item.product_code}</p>
                                </TableCell>
                                <TableCell className="py-4">
                                  <Input 
                                    type="number" 
                                    value={item.quantity}
                                    onChange={e => handleUpdateQty(item.product_code, Number(e.target.value))}
                                    className="h-10 text-base font-medium px-2 w-full min-w-[70px]"
                                    min="1"
                                  />
                                </TableCell>
                                <TableCell className="py-4">
                                  <Input 
                                    type="number" 
                                    value={item.discount || 0}
                                    onChange={e => handleUpdateDiscount(item.product_code, Number(e.target.value))}
                                    className="h-10 text-base font-medium px-2 w-full min-w-[90px] border-amber-200 focus:border-amber-400"
                                    min="0"
                                  />
                                </TableCell>
                                <TableCell className="text-sm font-bold text-right py-4">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price)}
                                </TableCell>
                                <TableCell className="py-4">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleRemoveItem(item.product_code)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="p-4 bg-muted/20 border-t space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-semibold">Incluir fotos no PDF</Label>
                          <p className="text-xs text-muted-foreground">Exibir miniaturas no documento final</p>
                        </div>
                        <Switch 
                          checked={includeImagesInQuote}
                          onCheckedChange={setIncludeImagesInQuote}
                        />
                      </div>
                      <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg">
                        <span className="text-sm font-bold uppercase tracking-wider text-primary">Valor Total:</span>
                        <span className="text-2xl font-black text-primary">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                            quoteItems.reduce((acc, item) => acc + item.total_price, 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-6 pt-2 gap-2 sm:gap-0 border-t">
            {step === "client" ? (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button 
                  onClick={() => setStep("payment")} 
                  disabled={!clientInfo.name || !selectedPriceListId || !selectedTemplateId}
                >
                  Próximo: Pagamento
                </Button>
              </>
            ) : step === "payment" ? (
              <>
                <Button variant="outline" onClick={() => setStep("client")}>Voltar</Button>
                <Button onClick={() => setStep("items")}>
                  Próximo: Adicionar Itens
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep("payment")}>Voltar</Button>
                <Button onClick={handleSubmit} disabled={createQuote.isPending || quoteItems.length === 0}>
                  {createQuote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Gerar Orçamento
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-transparent border-none shadow-none">
          <div className="relative aspect-auto flex items-center justify-center">
            {previewImage && (
              <img 
                src={previewImage} 
                alt="Preview" 
                className="max-h-[80vh] w-auto object-contain rounded-lg shadow-2xl" 
              />
            )}
            <Button 
              className="absolute top-2 right-2 h-8 w-8 p-0 rounded-full" 
              variant="secondary"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
