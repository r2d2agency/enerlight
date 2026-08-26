import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useRepresentativePortalCompanies,
  useRepresentativePortalDashboard,
  useRepresentativePortalMe,
  useRepresentativePortalMutations,
  useRepresentativePortalOrders,
  useRepresentativePortalPriceListItems,
  useRepresentativePortalPriceLists,
  useRepresentativePortalQuotes,
} from "@/hooks/use-representative-portal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Building2, FileText, ShoppingCart, Plus, LayoutDashboard, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const statusLabel: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovado",
  pending: "Pendente",
};

interface CompanyFormState {
  company_name: string;
  trade_name: string;
  cnpj: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  address_city: string;
  address_state: string;
  notes: string;
}

interface QuoteItemFormState {
  catalog_item_id: string;
  product_code: string;
  product_name: string;
  quantity: string;
  unit_price: string;
}

const emptyCompanyForm: CompanyFormState = {
  company_name: "",
  trade_name: "",
  cnpj: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  address_city: "",
  address_state: "",
  notes: "",
};

const emptyQuoteItem: QuoteItemFormState = {
  catalog_item_id: "",
  product_code: "",
  product_name: "",
  quantity: "1",
  unit_price: "0",
};

export default function RepresentanteDashboard() {
  const { user } = useAuth();
  const { data: portalMe, isLoading: loadingMe, error: meError } = useRepresentativePortalMe();
  const { data: dashboard, isLoading: loadingDashboard } = useRepresentativePortalDashboard();
  const { data: companies = [], isLoading: loadingCompanies } = useRepresentativePortalCompanies();
  const { data: quotes = [], isLoading: loadingQuotes } = useRepresentativePortalQuotes();
  const { data: orders = [], isLoading: loadingOrders } = useRepresentativePortalOrders();
  const { data: priceLists = [] } = useRepresentativePortalPriceLists();
  const { createCompany, createQuote, confirmOrder } = useRepresentativePortalMutations();

  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(emptyCompanyForm);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedPriceListId, setSelectedPriceListId] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuoteItemFormState[]>([{ ...emptyQuoteItem }]);

  const { data: catalogItems = [], isLoading: loadingCatalogItems } =
    useRepresentativePortalPriceListItems(selectedPriceListId || undefined);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  );

  const quoteTotal = useMemo(
    () =>
      quoteItems.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        return sum + quantity * unitPrice;
      }, 0),
    [quoteItems]
  );

  const handleCompanySave = async () => {
    if (!companyForm.company_name.trim()) {
      toast.error("Informe a razão social da empresa");
      return;
    }

    try {
      await createCompany.mutateAsync(companyForm);
      toast.success("Cliente cadastrado com sucesso");
      setCompanyDialogOpen(false);
      setCompanyForm(emptyCompanyForm);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível cadastrar o cliente");
    }
  };

  const handleQuoteSave = async () => {
    if (!selectedCompany) {
      toast.error("Selecione um cliente");
      return;
    }

    const normalizedItems = quoteItems
      .filter((item) => item.product_name.trim())
      .map((item) => ({
        product_code: item.product_code || null,
        product_name: item.product_name.trim(),
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        total_price: (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
      }));

    if (!normalizedItems.length) {
      toast.error("Adicione pelo menos um item ao orçamento");
      return;
    }

    try {
      await createQuote.mutateAsync({
        company_id: selectedCompany.id,
        price_list_id: selectedPriceListId || null,
        company_name: selectedCompany.company_name,
        client_document: selectedCompany.cnpj || null,
        client_contact_name: selectedCompany.contact_name || null,
        client_phone: selectedCompany.contact_phone || null,
        client_email: selectedCompany.contact_email || null,
        notes: quoteNotes,
        items: normalizedItems,
      });
      toast.success("Orçamento criado com sucesso");
      setQuoteDialogOpen(false);
      setSelectedCompanyId("");
      setSelectedPriceListId("");
      setQuoteNotes("");
      setQuoteItems([{ ...emptyQuoteItem }]);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível criar o orçamento");
    }
  };

  const handleCreateOrder = async (quoteId: string) => {
    try {
      await confirmOrder.mutateAsync(quoteId);
      toast.success("Pedido gerado com sucesso");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o pedido");
    }
  };

  const handleCatalogItemChange = (rowIndex: number, itemId: string) => {
    const catalogItem = catalogItems.find((item) => item.id === itemId);
    if (!catalogItem) return;

    setQuoteItems((current) =>
      current.map((row, index) =>
        index === rowIndex
          ? {
              catalog_item_id: itemId,
              product_code: catalogItem.product_code || "",
              product_name: catalogItem.product_name,
              quantity: row.quantity || "1",
              unit_price: String(catalogItem.sale_price || 0),
            }
          : row
      )
    );
  };

  const updateQuoteItem = (rowIndex: number, patch: Partial<QuoteItemFormState>) => {
    setQuoteItems((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, ...patch } : row))
    );
  };

  const removeQuoteItem = (rowIndex: number) => {
    setQuoteItems((current) =>
      current.length === 1 ? current : current.filter((_, index) => index !== rowIndex)
    );
  };

  if (loadingMe) {
    return (
      <MainLayout>
        <div className="h-[70vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (meError) {
    return (
      <MainLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Painel do Representante</CardTitle>
              <CardDescription>
                Seu usuário ainda não está vinculado a um representante no portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Peça para o administrador liberar seu acesso e vincular seu usuário no cadastro de representantes.
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              Portal do Representante
            </h1>
            <p className="text-muted-foreground">
              Olá, {portalMe?.representative?.name || user?.name}. Aqui você acompanha sua operação sem misturar com o CRM interno.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCompanyDialogOpen(true)}>
              <Building2 className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
            <Button onClick={() => setQuoteDialogOpen(true)} disabled={!companies.length || !priceLists.length}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Orçamento
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Clientes</p>
              <div className="text-3xl font-bold mt-2">
                {loadingDashboard ? <Loader2 className="h-5 w-5 animate-spin" /> : dashboard?.companies || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Orçamentos</p>
              <div className="text-3xl font-bold mt-2">{dashboard?.quotes.total || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{fmt(dashboard?.quotes.total_value || 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pedidos</p>
              <div className="text-3xl font-bold mt-2">{dashboard?.orders.total || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{fmt(dashboard?.orders.total_value || 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Tabelas disponíveis</p>
              <div className="text-3xl font-bold mt-2">{priceLists.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Preço separado do CRM atual</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="companies" className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[520px]">
            <TabsTrigger value="companies" className="gap-2">
              <Building2 className="h-4 w-4" />
              Clientes
            </TabsTrigger>
            <TabsTrigger value="quotes" className="gap-2">
              <FileText className="h-4 w-4" />
              Orçamentos
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Pedidos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Meus Clientes</CardTitle>
                <CardDescription>Somente empresas cadastradas por este representante aparecem aqui.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead>Cadastro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCompanies ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        </TableCell>
                      </TableRow>
                    ) : !companies.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          Nenhum cliente cadastrado ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      companies.map((company) => (
                        <TableRow key={company.id}>
                          <TableCell className="font-medium">{company.company_name}</TableCell>
                          <TableCell>{company.cnpj || "-"}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{company.contact_name || "-"}</span>
                              <span className="text-xs text-muted-foreground">{company.contact_phone || ""}</span>
                            </div>
                          </TableCell>
                          <TableCell>{[company.address_city, company.address_state].filter(Boolean).join("/") || "-"}</TableCell>
                          <TableCell>{format(parseISO(company.created_at), "dd/MM/yyyy")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Meus Orçamentos</CardTitle>
                <CardDescription>Orçamentos do portal independente do representante.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
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
                        <TableCell colSpan={6} className="h-24 text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        </TableCell>
                      </TableRow>
                    ) : !quotes.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          Nenhum orçamento criado ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      quotes.map((quote) => (
                        <TableRow key={quote.id}>
                          <TableCell className="font-medium">{quote.code}</TableCell>
                          <TableCell>{quote.company_name}</TableCell>
                          <TableCell>{format(parseISO(quote.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{fmt(quote.total_value)}</TableCell>
                          <TableCell>
                            <Badge variant={quote.status === "approved" ? "default" : "secondary"}>
                              {statusLabel[quote.status] || quote.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCreateOrder(quote.id)}
                              disabled={confirmOrder.isPending}
                            >
                              <ShoppingCart className="h-4 w-4 mr-2" />
                              Gerar Pedido
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Meus Pedidos</CardTitle>
                <CardDescription>Pedidos do representante prontos para futura integração com ERP.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>ERP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingOrders ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        </TableCell>
                      </TableRow>
                    ) : !orders.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          Nenhum pedido gerado ainda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.order_number}</TableCell>
                          <TableCell>{order.company_name}</TableCell>
                          <TableCell>{format(parseISO(order.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{fmt(order.total_value)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{statusLabel[order.status] || order.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={order.erp_status === "integrated" ? "default" : "outline"}>
                              {order.erp_status === "pending_integration" ? "Pendente" : order.erp_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label>Razão Social</Label>
              <Input
                value={companyForm.company_name}
                onChange={(e) => setCompanyForm((current) => ({ ...current, company_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Nome Fantasia</Label>
              <Input
                value={companyForm.trade_name}
                onChange={(e) => setCompanyForm((current) => ({ ...current, trade_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>CNPJ</Label>
              <Input
                value={companyForm.cnpj}
                onChange={(e) => setCompanyForm((current) => ({ ...current, cnpj: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Contato</Label>
              <Input
                value={companyForm.contact_name}
                onChange={(e) => setCompanyForm((current) => ({ ...current, contact_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Telefone</Label>
              <Input
                value={companyForm.contact_phone}
                onChange={(e) => setCompanyForm((current) => ({ ...current, contact_phone: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input
                value={companyForm.contact_email}
                onChange={(e) => setCompanyForm((current) => ({ ...current, contact_email: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Cidade</Label>
              <Input
                value={companyForm.address_city}
                onChange={(e) => setCompanyForm((current) => ({ ...current, address_city: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>UF</Label>
              <Input
                value={companyForm.address_state}
                onChange={(e) => setCompanyForm((current) => ({ ...current, address_state: e.target.value }))}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={companyForm.notes}
                onChange={(e) => setCompanyForm((current) => ({ ...current, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCompanySave} disabled={createCompany.isPending}>
              {createCompany.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Novo Orçamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Cliente</Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tabela de Preço</Label>
                <Select value={selectedPriceListId} onValueChange={setSelectedPriceListId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma tabela" />
                  </SelectTrigger>
                  <SelectContent>
                    {priceLists.map((priceList) => (
                      <SelectItem key={priceList.id} value={priceList.id}>
                        {priceList.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Itens do Orçamento</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setQuoteItems((current) => [...current, { ...emptyQuoteItem }])}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar item
                </Button>
              </div>

              <div className="space-y-3">
                {quoteItems.map((item, index) => (
                  <div key={`${index}-${item.catalog_item_id}`} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
                    <div className="grid gap-2">
                      <Label>Produto</Label>
                      <Select
                        value={item.catalog_item_id || ""}
                        onValueChange={(value) => handleCatalogItemChange(index, value)}
                        disabled={!selectedPriceListId || loadingCatalogItems}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !selectedPriceListId
                                ? "Selecione a tabela primeiro"
                                : "Escolha um produto da tabela"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogItems.map((catalogItem) => (
                            <SelectItem key={catalogItem.id} value={catalogItem.id}>
                              {catalogItem.product_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Quantidade</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuoteItem(index, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Valor Unit.</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateQuoteItem(index, { unit_price: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeQuoteItem(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Observações</Label>
              <Textarea value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-4">
              <div className="text-sm text-muted-foreground">Total estimado do orçamento</div>
              <div className="text-xl font-semibold">{fmt(quoteTotal)}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleQuoteSave} disabled={createQuote.isPending || !companies.length}>
              {createQuote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Orçamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
