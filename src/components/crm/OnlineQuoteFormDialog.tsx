import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Search, Loader2, Save, Image as ImageIcon, Eye, X, Building2, List, FileText } from "lucide-react";
import { usePriceLists, usePriceListItems, useOnlineQuoteMutations, useOnlineQuoteTemplates } from "@/hooks/use-online-quotes";
import { useCRMCompanies } from "@/hooks/use-crm";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface OnlineQuoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: any;
}

export function OnlineQuoteFormDialog({ open, onOpenChange, initialData }: OnlineQuoteFormDialogProps) {
  const { user } = useAuth();
  const isRepresentative = user?.role === 'representative';
  const [step, setStep] = useState<"client" | "payment" | "items" | "fiscal" | "shipping">("client");
  const [clientInfo, setClientInfo] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    notes: "",
    fiscal_info: "",
    payment_terms: "avista",
    payment_method: "pix",
    shipping_type: "cif",
    shipping_value: 0
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
  const { createQuote, updateQuote } = useOnlineQuoteMutations();
  const { data: existingCompanies } = useCRMCompanies(companySearch);

  useEffect(() => {
    if (initialData && open) {
      setClientInfo({
        name: initialData.client_name || "",
        document: initialData.client_document || "",
        email: initialData.client_email || "",
        phone: initialData.client_phone || "",
        notes: initialData.notes || "",
        fiscal_info: initialData.fiscal_info || "",
        payment_terms: initialData.payment_terms || "avista",
        payment_method: initialData.payment_method || "pix",
        shipping_type: initialData.shipping_type || "cif",
        shipping_value: initialData.shipping_value || 0
      });
      setSelectedPriceListId(initialData.price_list_id || "");
      setSelectedTemplateId(initialData.template_id || "");
      setQuoteItems(initialData.items || []);
      setIncludeImagesInQuote(initialData.include_images !== false);
      setStep("client");
    } else if (!initialData && open) {
      // Reset only when opening for a new quote
      setStep("client");
      setQuoteItems([]);
      setClientInfo({ name: "", document: "", email: "", phone: "", notes: "", fiscal_info: "", payment_terms: "avista", payment_method: "pix", shipping_type: "cif", shipping_value: 0 });
    }
  }, [initialData, open]);

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
      fiscal_info: clientInfo.fiscal_info,
      payment_terms: company.payment_terms || "",
      payment_method: company.payment_method || "",
      shipping_type: clientInfo.shipping_type,
      shipping_value: clientInfo.shipping_value
    });
    setCompanySearch("");
    setShowCompanyResults(false);
  };

  useEffect(() => {
    if (selectedPriceListId && !initialData) {
      const priceList = priceLists?.find(pl => pl.id === selectedPriceListId);
      if (priceList?.default_template_id) {
        setSelectedTemplateId(priceList.default_template_id);
      }
    }
  }, [selectedPriceListId, priceLists, initialData]);

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
    const validQty = Math.max(0, isNaN(qty) ? 0 : qty);
    if (validQty === 0) {
      handleRemoveItem(code);
      return;
    }
    setQuoteItems(quoteItems.map(item => {
      if (item.product_code === code) {
        const unitPrice = Number(item.unit_price) || 0;
        const discountValue = item.discount_type === 'percentage' 
          ? (unitPrice * (Number(item.discount) || 0) / 100)
          : (Number(item.discount) || 0);
        return { 
          ...item, 
          quantity: validQty, 
          total_price: validQty * Math.max(0, unitPrice - discountValue) 
        };
      }
      return item;
    }));
  };

  const handleUpdateDiscount = (code: string, discount: number, type?: 'fixed' | 'percentage') => {
    const priceList = priceLists?.find(pl => pl.id === selectedPriceListId);
    const maxDiscountPercent = priceList?.discount_limit_percentage || 0;
    const validDiscount = Math.max(0, isNaN(discount) ? 0 : discount);
    
    setQuoteItems(quoteItems.map(item => {
      if (item.product_code !== code) return item;
      
      const newType = type || item.discount_type || 'fixed';
      const unitPrice = Number(item.unit_price) || 0;
      
      let discountPercent = 0;
      let discountValue = 0;

      if (newType === 'percentage') {
        discountPercent = validDiscount;
        discountValue = (unitPrice * validDiscount / 100);
      } else {
        discountValue = validDiscount;
        discountPercent = unitPrice > 0 ? (validDiscount / unitPrice) * 100 : 0;
      }
      
      if (maxDiscountPercent > 0 && discountPercent > maxDiscountPercent) {
        toast.error(`Desconto máximo permitido: ${maxDiscountPercent}%`);
        return item;
      }
      
      return { 
        ...item, 
        discount: validDiscount,
        discount_type: newType,
        total_price: Number(item.quantity || 0) * Math.max(0, unitPrice - discountValue) 
      };
    }));
  };

  const handleRemoveItem = (code: string) => {
    setQuoteItems(quoteItems.filter(item => item.product_code !== code));
  };

  const handleSubmit = async () => {
    try {
      // First, create the company in CRM if it doesn't exist
      if (clientInfo.name && !initialData) {
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

      const quoteData = {
        client_name: clientInfo.name,
        client_document: clientInfo.document,
        client_email: clientInfo.email,
        client_phone: clientInfo.phone,
        payment_terms: clientInfo.payment_terms,
        payment_method: clientInfo.payment_method,
        notes: clientInfo.notes,
        fiscal_info: clientInfo.fiscal_info,
        shipping_type: clientInfo.shipping_type,
        shipping_value: Number(clientInfo.shipping_value) || 0,
        price_list_id: selectedPriceListId,
        template_id: selectedTemplateId,
        items: quoteItems.map(item => ({
          ...item,
          unit_price: Number(item.unit_price) || 0,
          total_price: Number(item.total_price) || 0,
          discount: Number(item.discount) || 0
        })),
        include_images: includeImagesInQuote
      };

      if (initialData?.id) {
        await updateQuote.mutateAsync({ id: initialData.id, data: quoteData });
        toast.success("Orçamento atualizado com sucesso!");
      } else {
        await createQuote.mutateAsync({ ...quoteData, status: 'draft' });
        toast.success("Orçamento criado com sucesso!");
      }

      onOpenChange(false);
      // Reset
      setStep("client");
      setQuoteItems([]);
      setClientInfo({ name: "", document: "", email: "", phone: "", notes: "", fiscal_info: "", payment_terms: "avista", payment_method: "pix", shipping_type: "cif", shipping_value: 0 });
    } catch (err) {
      toast.error(initialData ? "Erro ao atualizar orçamento" : "Erro ao criar orçamento");
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
            <DialogTitle>{initialData?.id ? "Editar Orçamento" : "Novo Orçamento Online"}</DialogTitle>
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
                    <Select 
                      value={selectedTemplateId} 
                      onValueChange={setSelectedTemplateId}
                      disabled={!!priceLists?.find(pl => pl.id === selectedPriceListId)?.default_template_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um modelo de capa..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates?.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name} {t.is_default && "(Padrão)"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {priceLists?.find(pl => pl.id === selectedPriceListId)?.default_template_id && (
                      <p className="text-[10px] text-muted-foreground mt-1">Capa fixa para esta tabela de preços.</p>
                    )}
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
            ) : step === "fiscal" ? (
              <div className="space-y-6 max-w-4xl mx-auto py-4">
                <div className="space-y-3">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Informações Fiscais
                  </Label>
                  <div className="bg-background border rounded-md">
                    <ReactQuill 
                      theme="snow" 
                      value={clientInfo.fiscal_info} 
                      onChange={val => setClientInfo({...clientInfo, fiscal_info: val})}
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline'],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          ['clean']
                        ],
                      }}
                      className="h-64 mb-12"
                      placeholder="Cole aqui as informações fiscais, impostos, NCM, etc..."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Estas informações serão exibidas logo após a lista de produtos na proposta.
                  </p>
                </div>
              </div>
            ) : step === "shipping" ? (
              <div className="space-y-6 max-w-2xl mx-auto py-4">
                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Tipo de Frete</Label>
                    <Select 
                      value={clientInfo.shipping_type} 
                      onValueChange={val => setClientInfo({...clientInfo, shipping_type: val})}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue placeholder="Selecione o tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cif">CIF (Por conta do Remetente)</SelectItem>
                        <SelectItem value="fob">FOB (Por conta do Destinatário)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Valor do Frete (R$)</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={clientInfo.shipping_value} 
                      onChange={e => setClientInfo({...clientInfo, shipping_value: parseFloat(e.target.value) || 0})}
                      placeholder="0,00"
                      className="h-12 text-base"
                    />
                    <p className="text-xs text-muted-foreground">Este valor será somado ao total do orçamento.</p>
                  </div>
                </div>
              </div>
            ) : step === "items" ? (
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
                      <Table className="text-sm">
                        <TableHeader className="bg-muted/50">
                          <TableRow className="hover:bg-muted/50 border-b">
                            <TableHead className="font-bold py-3">Produto</TableHead>
                            <TableHead className="font-bold w-[90px] text-center">Qtd</TableHead>
                            <TableHead className="font-bold w-[160px] text-center">Desconto</TableHead>
                            <TableHead className="font-bold text-right pr-4">Total</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quoteItems.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                                <div className="flex flex-col items-center gap-3 opacity-60">
                                  <div className="bg-muted p-4 rounded-full">
                                    <Plus className="h-10 w-10" />
                                  </div>
                                  <p className="text-base font-medium">Selecione produtos ao lado para adicionar</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            quoteItems.map(item => (
                              <TableRow key={item.product_code} className="group hover:bg-muted/30 border-b">
                                <TableCell className="py-4">
                                  <p className="font-bold text-base text-foreground mb-0.5">{item.product_name}</p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium uppercase tracking-wider">{item.product_code}</span>
                                    <span className="text-[11px] font-bold text-primary/70">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.unit_price)} / un</span>
                                  </div>
                                </TableCell>
                                <TableCell className="py-4">
                                  <Input 
                                    type="number" 
                                    value={item.quantity}
                                    onChange={e => handleUpdateQty(item.product_code, Number(e.target.value))}
                                    className="h-12 text-lg font-black text-center border-2 border-primary/20 focus:border-primary px-1"
                                    min="1"
                                  />
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="flex items-center gap-1.5">
                                    <Input 
                                      type="number" 
                                      value={item.discount || 0}
                                      onChange={e => handleUpdateDiscount(item.product_code, Number(e.target.value))}
                                      className="h-12 text-lg font-bold border-2 border-amber-200 focus:border-amber-500 text-center px-1 flex-1"
                                      min="0"
                                    />
                                    <Select 
                                      value={item.discount_type || 'fixed'} 
                                      onValueChange={(val: 'fixed' | 'percentage') => handleUpdateDiscount(item.product_code, item.discount || 0, val)}
                                    >
                                      <SelectTrigger className="h-12 w-[65px] border-2 font-black text-primary bg-primary/5">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="fixed" className="font-bold">R$</SelectItem>
                                        <SelectItem value="percentage" className="font-bold">%</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </TableCell>
                                <TableCell className="text-lg font-black text-right py-4 pr-4 text-primary">
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
                            quoteItems.reduce((acc, item) => acc + (Number(item.total_price) || 0), 0) + (Number(clientInfo.shipping_value) || 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : step === "items" ? (
              <div className="flex flex-col h-full gap-4">
                ...
              </div>
            ) : null}
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
            ) : step === "items" ? (
              <>
                <Button variant="outline" onClick={() => setStep("payment")}>Voltar</Button>
                <Button onClick={() => setStep("fiscal")}>
                  Próximo: Informações Fiscais
                </Button>
              </>
            ) : step === "fiscal" ? (
              <>
                <Button variant="outline" onClick={() => setStep("items")}>Voltar</Button>
                <Button onClick={() => setStep("shipping")}>
                  Próximo: Frete
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep("fiscal")}>Voltar</Button>
                <Button onClick={handleSubmit} disabled={createQuote.isPending || updateQuote.isPending || quoteItems.length === 0}>
                  {(createQuote.isPending || updateQuote.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {initialData?.id ? "Salvar Alterações" : "Gerar Orçamento"}
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
