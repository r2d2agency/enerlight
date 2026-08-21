import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, UserPlus, Pencil, Phone, Mail, MapPin, History } from "lucide-react";
import { useRepCustomers, useRepCustomerMutations, RepCustomer } from "@/hooks/use-representatives";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function RepCustomers() {
  const [search, setSearch] = useState("");
  const [editingCustomer, setEditingCustomer] = useState<RepCustomer | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<RepCustomer>>({});

  const { data: customers, isLoading } = useRepCustomers(search);
  const { createCustomer, updateCustomer } = useRepCustomerMutations();

  const handleOpenForm = (customer?: RepCustomer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData(customer);
    } else {
      setEditingCustomer(null);
      setFormData({});
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    if (editingCustomer) {
      updateCustomer.mutate({ id: editingCustomer.id, ...formData });
    } else {
      createCustomer.mutate(formData);
    }
    setIsFormOpen(false);
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Meus Clientes</h1>
            <p className="text-muted-foreground text-sm">Gerencie sua base exclusiva de clientes.</p>
          </div>
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Cliente
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nome, CNPJ, e-mail..." 
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 text-center animate-pulse text-muted-foreground">Carregando clientes...</div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome / Razão Social</TableHead>
                      <TableHead>CPF / CNPJ</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      <TableHead className="w-[100px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers?.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-xs text-muted-foreground">{customer.trading_name}</div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{customer.cpf_cnpj || "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {customer.phone && (
                              <div className="flex items-center gap-1 text-xs">
                                <Phone className="h-3 w-3" /> {customer.phone}
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-1 text-xs">
                                <Mail className="h-3 w-3" /> {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {customer.city ? `${customer.city}/${customer.state}` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenForm(customer)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {customers?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          Nenhum cliente cadastrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Nome ou Razão Social *</Label>
              <Input 
                value={formData.name || ""} 
                onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} 
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Nome Fantasia</Label>
              <Input 
                value={formData.trading_name || ""} 
                onChange={(e) => setFormData(f => ({ ...f, trading_name: e.target.value }))} 
              />
            </div>
            <div className="space-y-2">
              <Label>CPF ou CNPJ</Label>
              <Input 
                value={formData.cpf_cnpj || ""} 
                onChange={(e) => setFormData(f => ({ ...f, cpf_cnpj: e.target.value }))} 
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do Contato</Label>
              <Input 
                value={formData.contact_name || ""} 
                onChange={(e) => setFormData(f => ({ ...f, contact_name: e.target.value }))} 
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input 
                value={formData.phone || ""} 
                onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))} 
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input 
                type="email"
                value={formData.email || ""} 
                onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))} 
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Endereço</Label>
              <Input 
                value={formData.address || ""} 
                onChange={(e) => setFormData(f => ({ ...f, address: e.target.value }))} 
              />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input 
                value={formData.city || ""} 
                onChange={(e) => setFormData(f => ({ ...f, city: e.target.value }))} 
              />
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>UF</Label>
                  <Input 
                    maxLength={2}
                    value={formData.state || ""} 
                    onChange={(e) => setFormData(f => ({ ...f, state: e.target.value.toUpperCase() }))} 
                  />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input 
                    value={formData.zip_code || ""} 
                    onChange={(e) => setFormData(f => ({ ...f, zip_code: e.target.value }))} 
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Observações</Label>
              <Textarea 
                value={formData.notes || ""} 
                onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!formData.name}>
              {editingCustomer ? "Salvar Alterações" : "Cadastrar Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Orçamentos - {selectedCustomer?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {quoteHistory && quoteHistory.length > 0 ? (
              <div className="space-y-4">
                {quoteHistory.map((quote) => (
                  <div key={quote.id} className="p-4 border rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold">{quote.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(quote.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <Badge variant="outline">{quote.status}</Badge>
                    </div>
                    <div className="flex justify-between items-end pt-2">
                      <p className="text-sm text-muted-foreground">{quote.description || 'Sem observações'}</p>
                      <p className="font-bold text-primary">R$ {Number(quote.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground italic">
                Nenhum orçamento vinculado a este cliente.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsHistoryOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
