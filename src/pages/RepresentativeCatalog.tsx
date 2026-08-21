import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShoppingCart, Search, Filter, Plus, Minus, Trash2, CheckCircle2, Building2, User } from "lucide-react";
import { useRepresentativeCatalog, useRepresentativeCart } from "@/hooks/use-representatives";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CompanySearchSelect } from "@/components/crm/CompanySearchSelect";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function RepresentativeCatalog() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutData, setCheckoutData] = useState({
    company_id: "",
    contact_name: "",
    contact_phone: "",
    title: "",
    notes: ""
  });
  const [checkoutMode, setCheckoutMode] = useState<"company" | "contact">("company");
  
  const navigate = useNavigate();
  const { data: products, isLoading } = useRepresentativeCatalog({ search, category });
  const { data: cartItems, addToCart, removeFromCart } = useRepresentativeCart();
  
  const cartTotal = cartItems?.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0) || 0;
  
  const handleAddToCart = (productId: string) => {
    addToCart.mutate({ item_id: productId, quantity: 1 });
  };

  const handleCheckout = async () => {
    if (checkoutMode === "company" && !checkoutData.company_id) {
      toast.error("Selecione uma empresa");
      return;
    }
    if (checkoutMode === "contact" && (!checkoutData.contact_name || !checkoutData.contact_phone)) {
      toast.error("Preencha os dados do contato");
      return;
    }

    try {
      const res = await api<any>("/api/representatives/checkout", {
        method: "POST",
        body: checkoutData
      });
      toast.success("Orçamento gerado com sucesso!");
      setIsCheckoutOpen(false);
      setIsCartOpen(false);
      navigate("/crm/representante-dashboard");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar orçamento");
    }
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Catálogo de Produtos</h1>
            <p className="text-muted-foreground">Navegue pelos produtos e adicione ao orçamento.</p>
          </div>
          <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="relative">
                <ShoppingCart className="h-5 w-5 mr-2" />
                Carrinho
                {cartItems && cartItems.length > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 rounded-full">
                    {cartItems.length}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Carrinho de Orçamento</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] pr-4">
                {cartItems && cartItems.length > 0 ? (
                  <div className="space-y-4">
                    {cartItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between border-b pb-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.description}</p>
                          <p className="text-xs text-muted-foreground">Cód: {item.code}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm font-bold">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.sale_price)}
                            </span>
                            <span className="text-xs text-muted-foreground">x {item.quantity}</span>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive"
                          onClick={() => removeFromCart.mutate(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    Seu carrinho está vazio.
                  </div>
                )}
              </ScrollArea>
              <div className="pt-4 border-t">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-lg">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cartTotal)}
                  </span>
                </div>
                <Button 
                  className="w-full" 
                  disabled={!cartItems || cartItems.length === 0}
                  onClick={() => setIsCheckoutOpen(true)}
                >
                  Gerar Orçamento
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar produtos por nome ou código..." 
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-square bg-muted rounded-t-lg" />
                <CardContent className="p-4 space-y-2">
                  <div className="h-4 bg-muted w-3/4 rounded" />
                  <div className="h-4 bg-muted w-1/2 rounded" />
                </CardContent>
              </Card>
            ))
          ) : products?.map((product) => (
            <Card key={product.id} className="group overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-square bg-muted relative">
                {/* Placeholder image */}
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  Sem Foto
                </div>
                <Badge className="absolute top-2 right-2" variant="secondary">
                  {product.brand}
                </Badge>
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="min-h-[3rem]">
                  <h3 className="font-bold text-sm line-clamp-2">{product.description}</h3>
                  <p className="text-[10px] text-muted-foreground uppercase">{product.code}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-lg font-black text-primary">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.sale_price)}
                    </span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => handleAddToCart(product.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Finalizar Orçamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Vincular a:</Label>
              <div className="flex gap-2">
                <Button 
                  variant={checkoutMode === "company" ? "default" : "outline"}
                  onClick={() => setCheckoutMode("company")}
                  className="flex-1"
                >
                  <Building2 className="h-4 w-4 mr-2" /> Empresa
                </Button>
                <Button 
                  variant={checkoutMode === "contact" ? "default" : "outline"}
                  onClick={() => setCheckoutMode("contact")}
                  className="flex-1"
                >
                  <User className="h-4 w-4 mr-2" /> Contato Avulso
                </Button>
              </div>
            </div>

            {checkoutMode === "company" ? (
              <div className="space-y-2">
                <Label>Empresa *</Label>
                <CompanySearchSelect 
                  value={checkoutData.company_id} 
                  onSelect={(id) => setCheckoutData(prev => ({ ...prev, company_id: id }))} 
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Contato *</Label>
                  <Input 
                    value={checkoutData.contact_name}
                    onChange={e => setCheckoutData(prev => ({ ...prev, contact_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp *</Label>
                  <Input 
                    value={checkoutData.contact_phone}
                    onChange={e => setCheckoutData(prev => ({ ...prev, contact_phone: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Título do Orçamento</Label>
              <Input 
                value={checkoutData.title}
                onChange={e => setCheckoutData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ex: Pedido Cliente X - Verão"
              />
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Input 
                value={checkoutData.notes}
                onChange={e => setCheckoutData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCheckoutOpen(false)}>Voltar</Button>
            <Button onClick={handleCheckout}>Confirmar Orçamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
