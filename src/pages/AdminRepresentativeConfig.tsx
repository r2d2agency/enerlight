import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// UI Components
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Icons
import { Plus, Edit2, Trash2, Search, Users, Settings, DollarSign, Phone, Mail, MapPin, Loader2 } from "lucide-react";

interface Representative {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf_cnpj?: string;
  city?: string;
  state?: string;
  address?: string;
  commission_percent: number;
  notes?: string;
  is_active: boolean;
  linked_user_id?: string;
  linked_user_name?: string;
  indicator_type: string;
  created_at: string;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  cpf_cnpj: string;
  city: string;
  state: string;
  address: string;
  zip_code: string;
  commission_percent: string;
  notes: string;
  linked_user_id: string;
  indicator_type: "representante" | "parceiro" | "indicador" | "instalador";
}

const emptyForm: FormState = {
  name: "",
  email: "",
  phone: "",
  cpf_cnpj: "",
  city: "",
  state: "",
  address: "",
  zip_code: "",
  commission_percent: "5",
  notes: "",
  linked_user_id: "",
  indicator_type: "representante",
};

export default function AdminRepresentativeConfig() {
  const { user, userPermissions } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "manager"
    || userPermissions?.can_manage_representative_config === true
    || userPermissions?.can_view_representatives === true;

  // UI States
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");

  // Queries
  const { data: representatives = [], isLoading } = useQuery({
    queryKey: ["admin-representatives", search, filterType, filterActive],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterType && filterType !== "all") params.set("type", filterType);
      const qs = params.toString();
      return api<Representative[]>(`/api/crm/representatives${qs ? `?${qs}` : ""}`);
    },
  });

  const { data: orgMembers = [] } = useQuery({
    queryKey: ["org-members"],
    queryFn: async () => api(`/api/crm/my-team`),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: Partial<Representative>) => 
      api<Representative>("/api/crm/representatives", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-representatives"] });
      setFormOpen(false);
      setForm(emptyForm);
      toast.success("Representante criado com sucesso");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao criar"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) =>
      api<Representative>(`/api/crm/representatives/${id}`, { method: "PUT", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-representatives"] });
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success("Representante atualizado");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao atualizar"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/api/crm/representatives/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-representatives"] });
      setDeleteConfirmId(null);
      toast.success("Representante excluído");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao excluir"),
  });

  // Filter logic
  const filtered = useMemo(() => {
    return representatives.map(rep => ({
      ...rep,
      commission_percent: Number(rep.commission_percent ?? 0),
      is_active: rep.is_active !== false,
    })).filter(rep => {
      if (search && !rep.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== "all" && rep.indicator_type !== filterType) return false;
      if (filterActive !== "all" && (rep.is_active ? "active" : "inactive") !== filterActive) return false;
      return true;
    });
  }, [representatives, search, filterType, filterActive]);

  // Form handlers
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (rep: Representative) => {
    setEditingId(rep.id);
    setForm({
      name: rep.name,
      email: rep.email || "",
      phone: rep.phone || "",
      cpf_cnpj: rep.cpf_cnpj || "",
      city: rep.city || "",
      state: rep.state || "",
      address: rep.address || "",
      zip_code: "",
      commission_percent: String(rep.commission_percent || 0),
      notes: rep.notes || "",
      linked_user_id: rep.linked_user_id || "",
      indicator_type: (rep.indicator_type as any) || "representante",
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    const data = {
      ...form,
      commission_percent: Number(form.commission_percent) || 0,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-muted-foreground">Acesso restrito a administradores</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Configuração de Representantes
            </h1>
            <p className="text-muted-foreground mt-1">Gerencie representantes, parceiros e indicadores</p>
          </div>
          <Button onClick={openCreate} size="lg" className="gap-2">
            <Plus className="h-4 w-4" /> Novo Representante
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Buscar por nome</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite aqui..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="representante">Representante</SelectItem>
                    <SelectItem value="parceiro">Parceiro</SelectItem>
                    <SelectItem value="indicador">Indicador</SelectItem>
                    <SelectItem value="instalador">Instalador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterActive} onValueChange={setFilterActive}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Representatives List */}
        <Card>
          <CardHeader>
            <CardTitle>Representantes ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">Nenhum representante encontrado</p>
                <Button onClick={openCreate} variant="outline">
                  Criar o primeiro
                </Button>
              </div>
            ) : (
              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="hidden md:table-cell">Tipo</TableHead>
                      <TableHead className="hidden md:table-cell">Contato</TableHead>
                      <TableHead className="hidden lg:table-cell">Comissão</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((rep) => (
                      <TableRow key={rep.id}>
                        <TableCell>
                          <div className="font-medium">{rep.name}</div>
                          <div className="text-sm text-muted-foreground hidden md:block">
                            {rep.city && rep.state ? `${rep.city}, ${rep.state}` : "-"}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant="outline" className="capitalize">
                            {rep.indicator_type === "representante" ? "Representante" :
                             rep.indicator_type === "parceiro" ? "Parceiro" :
                             rep.indicator_type === "indicador" ? "Indicador" : "Instalador"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="text-sm space-y-1">
                            {rep.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {rep.phone}
                              </div>
                            )}
                            {rep.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {rep.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            {Number(rep.commission_percent ?? 0).toFixed(2)}%
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {rep.is_active ? (
                            <Badge variant="default" className="bg-green-600">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(rep)}
                              className="gap-1"
                            >
                              <Edit2 className="h-4 w-4" />
                              <span className="hidden md:inline">Editar</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirmId(rep.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden md:inline">Deletar</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Representante" : "Novo Representante"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="w-full pr-4">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nome do representante"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={form.indicator_type}
                    onValueChange={(v: any) => setForm(f => ({ ...f, indicator_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="representante">Representante</SelectItem>
                      <SelectItem value="parceiro">Parceiro</SelectItem>
                      <SelectItem value="indicador">Indicador</SelectItem>
                      <SelectItem value="instalador">Instalador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div className="space-y-2">
                  <Label>CPF/CNPJ</Label>
                  <Input
                    value={form.cpf_cnpj}
                    onChange={(e) => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))}
                    placeholder="00.000.000/0000-00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Comissão (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.commission_percent}
                    onChange={(e) => setForm(f => ({ ...f, commission_percent: e.target.value }))}
                    placeholder="5.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="São Paulo"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input
                    value={form.state}
                    onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))}
                    placeholder="SP"
                    maxLength="2"
                  />
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label>Endereço</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Rua, número, complemento"
                  />
                </div>

                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input
                    value={form.zip_code}
                    onChange={(e) => setForm(f => ({ ...f, zip_code: e.target.value }))}
                    placeholder="00000-000"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Usuário Vinculado</Label>
                  <Select
                    value={form.linked_user_id || undefined}
                    onValueChange={(v) => setForm(f => ({ ...f, linked_user_id: v || "" }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgMembers.map((member: any) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Notas adicionais..."
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : editingId ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir representante?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados associados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
