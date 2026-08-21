import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, LayoutGrid, List, ChevronDown, Building2, User, ShoppingCart, UserCheck } from "lucide-react";
import { useRepresentativeCatalog, useRepresentativeCart, useRepCustomers } from "@/hooks/use-representatives";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CompanySearchSelect } from "@/components/crm/CompanySearchSelect";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { CatalogGalleryView } from "@/components/representative/CatalogGalleryView";
import { CatalogListView } from "@/components/representative/CatalogListView";
import { RepresentativeCartSide } from "@/components/representative/RepresentativeCartSide";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function RepresentativeCatalog() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"gallery" | "list">("gallery");
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
  const { data: products, isLoading } = useRepresentativeCatalog({ search });
  const { data: cartItems, addToCart, removeFromCart } = useRepresentativeCart();
  
  const cartTotal = cartItems?.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0) || 0;
  
  const handleAddToCart = (productId: string) => {
    // Get quantity from the relative input in the view if possible, or default to 1
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
      await api<any>("/api/representatives/checkout", {
        method: "POST",
        body: checkoutData
      });
      toast.success("Orçamento gerado com sucesso!");
      setIsCheckoutOpen(false);
      navigate("/rep/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar orçamento");
    }
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 border-b bg-background sticky top-0 z-10 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold">Catálogo de Vendas</h1>
                <p className="text-xs text-muted-foreground">Explore o catálogo e adicione itens ao carrinho.</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex border rounded-md overflow-hidden">
                  <Button 
                    variant={viewMode === "gallery" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="rounded-none px-3"
                    onClick={() => setViewMode("gallery")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant={viewMode === "list" ? "secondary" : "ghost"} 
                    size="sm" 
                    className="rounded-none px-3 border-l"
                    onClick={() => setViewMode("list")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="md:hidden relative">
                      <ShoppingCart className="h-4 w-4" />
                      {cartItems && cartItems.length > 0 && (
                        <Badge className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                          {cartItems.length}
                        </Badge>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="p-0 w-[85vw] sm:w-[400px]">
                    <RepresentativeCartSide 
                      items={cartItems} 
                      onRemove={(id: string) => removeFromCart.mutate(id)}
                      onCheckout={() => setIsCheckoutOpen(true)}
                      total={cartTotal}
                    />
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por nome ou código..." 
                  className="pl-9 h-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/20">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="animate-pulse text-muted-foreground">Carregando catálogo...</p>
              </div>
            ) : products && products.length > 0 ? (
              viewMode === "gallery" ? (
                <CatalogGalleryView products={products} onAddToCart={handleAddToCart} />
              ) : (
                <CatalogListView products={products} onAddToCart={handleAddToCart} />
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Search className="h-10 w-10 opacity-20 mb-2" />
                <p>Nenhum produto encontrado.</p>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Cart Sidebar */}
        <aside className="hidden md:block w-[320px] lg:w-[380px] shrink-0">
          <RepresentativeCartSide 
            items={cartItems} 
            onRemove={(id: string) => removeFromCart.mutate(id)}
            onCheckout={() => setIsCheckoutOpen(true)}
            total={cartTotal}
          />
        </aside>
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
