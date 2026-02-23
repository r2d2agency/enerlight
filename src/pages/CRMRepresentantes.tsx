import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  useRepresentatives, useRepresentativeDashboard, useRepresentativeMutations, 
  useRepresentativeDeals, Representative 
} from "@/hooks/use-representatives";
import { useCRMMyTeam, CRMDeal } from "@/hooks/use-crm";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Plus, Search, Users, DollarSign, TrendingUp, TrendingDown, 
  Briefcase, Edit2, Trash2, ArrowLeft, Calendar, XCircle, Trophy, Percent, ExternalLink 
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";


export default function CRMRepresentantes() {
  const { user } = useAuth();
  const canManage = user?.role && ['owner', 'admin', 'manager'].includes(user.role);

  const [search, setSearch] = useState("");
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<Representative | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dealStatusFilter, setDealStatusFilter] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
  const [dealDetailOpen, setDealDetailOpen] = useState(false);

  // Dashboard date filters
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: representatives, isLoading } = useRepresentatives(search || undefined);
  const { data: dashboard, isLoading: loadingDash } = useRepresentativeDashboard(selectedRepId, startDate, endDate);
  const { data: repDeals, isLoading: loadingDeals } = useRepresentativeDeals(selectedRepId, startDate, endDate, dealStatusFilter);
  const { data: orgMembers } = useCRMMyTeam();
  const { createRepresentative, updateRepresentative, deleteRepresentative } = useRepresentativeMutations();

  // Form state
  const [form, setForm] = useState({
    name: "", email: "", phone: "", cpf_cnpj: "", city: "", state: "",
    address: "", zip_code: "", commission_percent: "5", notes: "", linked_user_id: "",
  });

  const openCreate = () => {
    setEditingRep(null);
    setForm({ name: "", email: "", phone: "", cpf_cnpj: "", city: "", state: "", address: "", zip_code: "", commission_percent: "5", notes: "", linked_user_id: "" });
    setFormOpen(true);
  };

  const openEdit = (rep: Representative) => {
    setEditingRep(rep);
    setForm({
      name: rep.name, email: rep.email || "", phone: rep.phone || "",
      cpf_cnpj: rep.cpf_cnpj || "", city: rep.city || "", state: rep.state || "",
      address: rep.address || "", zip_code: rep.zip_code || "",
      commission_percent: String(rep.commission_percent || 0),
      notes: rep.notes || "", linked_user_id: rep.linked_user_id || "",
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (createRepresentative.isPending || updateRepresentative.isPending) return;
    const data = { ...form, commission_percent: Number(form.commission_percent) || 0 };
    if (editingRep) {
      updateRepresentative.mutate({ id: editingRep.id, ...data }, { onSuccess: () => setFormOpen(false) });
    } else {
      createRepresentative.mutate(data, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleDelete = (id: string) => {
    deleteRepresentative.mutate(id);
    setDeleteConfirm(null);
    if (selectedRepId === id) setSelectedRepId(null);
  };

  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const selectedRep = representatives?.find(r => r.id === selectedRepId);

  // Dashboard view
  if (selectedRepId && selectedRep) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedRepId(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{selectedRep.name}</h1>
              <p className="text-sm text-muted-foreground">
                Comissão: {selectedRep.commission_percent}% 
                {selectedRep.linked_user_name && ` • Vendedor: ${selectedRep.linked_user_name}`}
              </p>
            </div>
          </div>

          {/* Date filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
            <span className="text-sm text-muted-foreground">até</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
          </div>

          {loadingDash ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : dashboard ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      Comissão Total
                    </div>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(dashboard.total_commission)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Briefcase className="h-4 w-4" />
                      Em Aberto
                    </div>
                    <p className="text-2xl font-bold">{dashboard.open_deals}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(dashboard.open_value)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Trophy className="h-4 w-4 text-green-500" />
                      Fechados
                    </div>
                    <p className="text-2xl font-bold text-green-600">{dashboard.won_deals}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(dashboard.won_value)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Perdidos
                    </div>
                    <p className="text-2xl font-bold text-red-600">{dashboard.lost_deals}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(dashboard.lost_value)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Loss reasons */}
              {dashboard.loss_reasons.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Motivos de Perda</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboard.loss_reasons.map((lr, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm">{lr.reason}</span>
                          <Badge variant="secondary">{lr.count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Deals list */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Negociações</CardTitle>
                    <Select value={dealStatusFilter} onValueChange={setDealStatusFilter}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="open">Abertas</SelectItem>
                        <SelectItem value="won">Ganhas</SelectItem>
                        <SelectItem value="lost">Perdidas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingDeals ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}
                    </div>
                  ) : !repDeals?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma negociação encontrada</p>
                  ) : (
                    <div className="space-y-2">
                      {repDeals.map(deal => (
                        <div
                          key={deal.id}
                          className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => {
                            setSelectedDeal(deal as any);
                            setDealDetailOpen(true);
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{deal.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {deal.company_name && <span className="text-xs text-muted-foreground">{deal.company_name}</span>}
                              {deal.stage_name && (
                                <Badge variant="outline" className="text-xs px-1.5 py-0">
                                  {deal.stage_name}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 ml-2">
                            <div className="text-right">
                              <p className="text-sm font-medium">{formatCurrency(deal.value)}</p>
                              <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'} className="text-xs">
                                {deal.status === 'open' ? 'Aberta' : deal.status === 'won' ? 'Ganha' : 'Perdida'}
                              </Badge>
                            </div>
                            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}

          {/* Deal Detail Dialog */}
          <DealDetailDialog
            deal={selectedDeal}
            open={dealDetailOpen}
            onOpenChange={(open) => {
              setDealDetailOpen(open);
              if (!open) setSelectedDeal(null);
            }}
          />
        </div>
      </MainLayout>
    );
  }

  // List view
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Representantes</h1>
          </div>
          {canManage && (
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Novo Representante
            </Button>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar representante..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : !representatives?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Nenhum representante cadastrado</p>
              <p className="text-sm mt-1">Crie representantes para gerenciar comissões e acompanhar performance.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {representatives.map(rep => (
              <Card 
                key={rep.id} 
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedRepId(rep.id)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{rep.name}</p>
                        <Badge variant="outline" className="shrink-0">
                          <Percent className="h-3 w-3 mr-1" />
                          {rep.commission_percent}%
                        </Badge>
                        {rep.linked_user_name && (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {rep.linked_user_name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        {rep.city && <span>{rep.city}{rep.state ? `/${rep.state}` : ""}</span>}
                        {rep.phone && <span>{rep.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{rep.open_deals_count || 0} negociações</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(rep.open_deals_value || 0)}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={e => { e.stopPropagation(); openEdit(rep); }}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(rep.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingRep ? "Editar Representante" : "Novo Representante"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-1">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CPF/CNPJ</Label>
                  <Input value={form.cpf_cnpj} onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Comissão (%)</Label>
                  <Input type="number" min="0" max="100" step="0.5" value={form.commission_percent} onChange={e => setForm(f => ({ ...f, commission_percent: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="UF" maxLength={2} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Vendedor Vinculado</Label>
                <Select value={form.linked_user_id || "none"} onValueChange={v => setForm(f => ({ ...f, linked_user_id: v === "none" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {user && !orgMembers?.some(m => m.user_id === user.id) && (
                      <SelectItem key={user.id} value={user.id}>{user.name} ({user.email}) — Eu</SelectItem>
                    )}
                    {orgMembers?.map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.name} ({m.email}){m.user_id === user?.id ? ' — Eu' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || createRepresentative.isPending || updateRepresentative.isPending}>
              {(createRepresentative.isPending || updateRepresentative.isPending) ? "Salvando..." : editingRep ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Excluir Representante?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
