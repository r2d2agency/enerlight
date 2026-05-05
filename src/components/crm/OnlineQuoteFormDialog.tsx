import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Search, Loader2, Save, Image as ImageIcon, Eye } from "lucide-react";
import { usePriceLists, usePriceListItems, useOnlineQuoteMutations } from "@/hooks/use-online-quotes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OnlineQuoteFormDialog({ open, onOpenChange, onSuccess }: Props) {
  const [step, setStep] = useState<"client" | "items">("client");
  const [clientInfo, setClientInfo] = useState({
    name: "",
    document: "",
    email: "",
    phone: "",
    notes: ""
  });
  const [selectedPriceListId, setSelectedPriceListId] = useState<string>("");
  const [quoteItems, setQuoteItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [includeImagesInQuote, setIncludeImagesInQuote] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { data: priceLists } = usePriceLists();
  const { data: availableItems, isLoading: loadingItems } = usePriceListItems(selectedPriceListId);
  const { createQuote } = useOnlineQuoteMutations();

  const handleAddItem = (product: any) => {
    const existing = quoteItems.find(i => i.product_code === product.product_code);
    if (existing) {
      setQuoteItems(quoteItems.map(i => 
        i.product_code === product.product_code 
          ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * i.unit_price }
          : i
      ));
    } else {
      setQuoteItems([...quoteItems, {
        ...product,
        quantity: 1,
        unit_price: product.sale_price,
        total_price: product.sale_price
      }]);
    }
    toast.success(`${product.product_name} adicionado`);
  };

  const handleRemoveItem = (code: string) => {
    setQuoteItems(quoteItems.filter(i => i.product_code !== code));
  };

  const handleUpdateQty = (code: string, qty: number) => {
    setQuoteItems(quoteItems.map(i => 
      i.product_code === code 
        ? { ...i, quantity: qty, total_price: qty * i.unit_price }
        : i
    ));
  };

  const handleSubmit = async () => {
    if (quoteItems.length === 0) {
      toast.error("Adicione pelo menos um item");
      return;
    }

    try {
      await createQuote.mutateAsync({
        client_name: clientInfo.name,
        client_document: clientInfo.document,
        client_email: clientInfo.email,
        client_phone: clientInfo.phone,
        notes: clientInfo.notes,
        price_list_id: selectedPriceListId,
        items: quoteItems
      });
      onOpenChange(false);
      onSuccess?.();
      setStep("client");
      setQuoteItems([]);
    } catch (err) {
      // toast handled by mutation
    }
  };

  const filteredProducts = availableItems?.filter(p => 
    p.product_name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_code.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Gerar Novo Orçamento</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {step === "client" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Cliente *</Label>
                  <Input 
                    value={clientInfo.name} 
                    onChange={e => setClientInfo({...clientInfo, name: e.target.value})}
                    placeholder="Nome completo ou Razão Social"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF / CNPJ</Label>
                  <Input 
                    value={clientInfo.document} 
                    onChange={e => setClientInfo({...clientInfo, document: e.target.value})}
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input 
                    value={clientInfo.email} 
                    onChange={e => setClientInfo({...clientInfo, email: e.target.value})}
                    placeholder="email@cliente.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp / Telefone</Label>
                  <Input 
                    value={clientInfo.phone} 
                    onChange={e => setClientInfo({...clientInfo, phone: e.target.value})}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tabela de Preços *</Label>
                <Select value={selectedPriceListId} onValueChange={setSelectedPriceListId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma tabela..." />
                  </SelectTrigger>
                  <SelectContent>
                    {priceLists?.map(pl => (
                      <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          ) : (
            <div className="flex flex-col h-full gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[400px]">
                {/* Seleção de Produtos */}
                <div className="border rounded-lg flex flex-col overflow-hidden">
                  <div className="p-2 bg-muted flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Buscar produto..." 
                      className="h-8 bg-background"
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {loadingItems ? (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {filteredProducts?.map(product => (
                          <div 
                            key={product.id}
                            className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer group"
                            onClick={() => handleAddItem(product)}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{product.product_name}</p>
                              <p className="text-[10px] text-muted-foreground">{product.product_code} • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.sale_price)}</p>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Itens Adicionados */}
                <div className="border rounded-lg flex flex-col overflow-hidden">
                  <div className="p-2 bg-muted">
                    <p className="text-sm font-medium">Itens do Orçamento</p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-xs">Prod.</TableHead>
                          <TableHead className="text-xs w-[60px]">Qtd</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="w-[40px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quoteItems.map(item => (
                          <TableRow key={item.product_code}>
                            <TableCell className="text-xs font-medium py-2">
                              {item.product_name}
                            </TableCell>
                            <TableCell className="py-2">
                              <Input 
                                type="number" 
                                value={item.quantity}
                                onChange={e => handleUpdateQty(item.product_code, Number(e.target.value))}
                                className="h-7 text-xs px-1"
                              />
                            </TableCell>
                            <TableCell className="text-xs text-right py-2">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.total_price)}
                            </TableCell>
                            <TableCell className="py-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => handleRemoveItem(item.product_code)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="p-3 bg-muted/30 border-t">
                    <div className="flex justify-between items-center font-bold">
                      <span>Total:</span>
                      <span className="text-lg">
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

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "client" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button 
                onClick={() => setStep("items")} 
                disabled={!clientInfo.name || !selectedPriceListId}
              >
                Próximo: Adicionar Itens
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("client")}>Voltar</Button>
              <Button onClick={handleSubmit} disabled={createQuote.isPending}>
                {createQuote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Gerar Orçamento
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
