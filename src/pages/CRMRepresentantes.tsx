import { useState, useEffect } from "react";
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
  useRepresentatives, useRepresentative, useRepresentativeDashboard, useRepresentativeMutations,
  useRepresentativeDeals, useIndicatorSegments, Representative, IndicatorArea, IndicatorType,
} from "@/hooks/use-representatives";
import { useCRMMyTeam, CRMDeal } from "@/hooks/use-crm";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { IndicatorSegmentsManager } from "@/components/crm/IndicatorSegmentsManager";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Search, Users, DollarSign, Briefcase, Edit2, Trash2, ArrowLeft, Calendar,
  XCircle, Trophy, Percent, ExternalLink, MapPin, Settings, X, Tag,
} from "lucide-react";
import { format, subDays } from "date-fns";

const TYPE_LABELS: Record<IndicatorType, string> = {
  parceiro: "Parceiro",
  representante: "Representante",
  indicador: "Indicador",
};
const TYPE_COLORS: Record<IndicatorType, string> = {
  parceiro: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
  representante: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400",
  indicador: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
};

interface FormState {
  name: string; email: string; phone: string; cpf_cnpj: string;
  city: string; state: string; address: string; zip_code: string;
  commission_percent: string; notes: string; linked_user_id: string;
  indicator_type: IndicatorType;
  segment_ids: string[];
  areas: IndicatorArea[];
}

const emptyForm: FormState = {
  name: "", email: "", phone: "", cpf_cnpj: "", city: "", state: "",
  address: "", zip_code: "", commission_percent: "5", notes: "", linked_user_id: "",
  indicator_type: "representante", segment_ids: [], areas: [],
};

export default function CRMRepresentantes() {
  const { user } = useAuth();
  const canManage = user?.role && ['owner', 'admin', 'manager'].includes(user.role);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dealStatusFilter, setDealStatusFilter] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
  const [dealDetailOpen, setDealDetailOpen] = useState(false);
  const [segmentsManagerOpen, setSegmentsManagerOpen] = useState(false);

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: representatives, isLoading } = useRepresentatives(search || undefined, typeFilter);
  const { data: dashboard, isLoading: loadingDash } = useRepresentativeDashboard(selectedRepId, startDate, endDate);
  const { data: repDeals, isLoading: loadingDeals } = useRepresentativeDeals(selectedRepId, startDate, endDate, dealStatusFilter);
  const { data: orgMembers } = useCRMMyTeam();
  const { data: allSegments = [] } = useIndicatorSegments();
  const { data: editingRep } = useRepresentative(editingRepId);
  const { createRepresentative, updateRepresentative, deleteRepresentative } = useRepresentativeMutations();

  const [form, setForm] = useState<FormState>(emptyForm);

  // Pre-fill form when editingRep loads
  useEffect(() => {
    if (editingRep) {
      setForm({
        name: editingRep.name,
        email: editingRep.email || "",
        phone: editingRep.phone || "",
        cpf_cnpj: editingRep.cpf_cnpj || "",
        city: editingRep.city || "",
        state: editingRep.state || "",
        address: editingRep.address || "",
        zip_code: editingRep.zip_code || "",
        commission_percent: String(editingRep.commission_percent || 0),
        notes: editingRep.notes || "",
        linked_user_id: editingRep.linked_user_id || "",
        indicator_type: (editingRep.indicator_type as IndicatorType) || "representante",
        segment_ids: editingRep.segment_ids || [],
        areas: editingRep.areas || [],
      });
    }
  }, [editingRep]);

  const openCreate = () => {
    setEditingRepId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (rep: Representative) => {
    setEditingRepId(rep.id);
    // Pre-fill basic data immediately; areas will load via useRepresentative
    setForm({
      ...emptyForm,
      name: rep.name,
      email: rep.email || "",
      phone: rep.phone || "",
      cpf_cnpj: rep.cpf_cnpj || "",
      city: rep.city || "",
      state: rep.state || "",
      address: rep.address || "",
      zip_code: rep.zip_code || "",
      commission_percent: String(rep.commission_percent || 0),
      notes: rep.notes || "",
      linked_user_id: rep.linked_user_id || "",
      indicator_type: (rep.indicator_type as IndicatorType) || "representante",
      segment_ids: rep.segment_ids || [],
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (createRepresentative.isPending || updateRepresentative.isPending) return;
    const data = {
      ...form,
      commission_percent: Number(form.commission_percent) || 0,
    };
    if (editingRepId) {
      updateRepresentative.mutate({ id: editingRepId, ...data }, { onSuccess: () => { setFormOpen(false); setEditingRepId(null); } });
    } else {
      createRepresentative.mutate(data, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleDelete = (id: string) => {
    deleteRepresentative.mutate(id);
    setDeleteConfirm(null);
    if (selectedRepId === id) setSelectedRepId(null);
  };

  const addArea = () => setForm(f => ({ ...f, areas: [...f.areas, { city: "", state: "", radius_km: 100 }] }));
  const updateArea = (idx: number, patch: Partial<IndicatorArea>) =>
    setForm(f => ({ ...f, areas: f.areas.map((a, i) => i === idx ? { ...a, ...patch } : a) }));
  const removeArea = (idx: number) =>
    setForm(f => ({ ...f, areas: f.areas.filter((_, i) => i !== idx) }));

  const toggleSegment = (id: string) =>
    setForm(f => ({
      ...f,
      segment_ids: f.segment_ids.includes(id) ? f.segment_ids.filter(s => s !== id) : [...f.segment_ids, id],
    }));

  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const selectedRep = representatives?.find(r => r.id === selectedRepId);
  const segmentById = (id: string) => allSegments.find(s => s.id === id);

  // ============== DASHBOARD VIEW ==============
  if (selectedRepId && selectedRep) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedRepId(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{selectedRep.name}</h1>
                <Badge variant="outline" className={TYPE_COLORS[selectedRep.indicator_type || "representante"]}>
                  {TYPE_LABELS[selectedRep.indicator_type || "representante"]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Comissão: {selectedRep.commission_percent}%
                {selectedRep.linked_user_name && ` • Vendedor: ${selectedRep.linked_user_name}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
            <span className="text-sm text-muted-foreground">até</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
          </div>

          {loadingDash ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : dashboard ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card><CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><DollarSign className="h-4 w-4" />Comissão Recebida</div>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(dashboard.total_commission)}</p>
                  <p className="text-xs text-muted-foreground">{dashboard.commission_percent}% sobre ganhas</p>
                </CardContent></Card>
                <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Percent className="h-4 w-4 text-amber-600" />Comissão Potencial</div>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(dashboard.potential_commission)}</p>
                  <p className="text-xs text-muted-foreground">se fechar as abertas</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Briefcase className="h-4 w-4" />Em Aberto</div>
                  <p className="text-2xl font-bold">{dashboard.open_deals}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(dashboard.open_value)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Trophy className="h-4 w-4 text-green-500" />Fechados</div>
                  <p className="text-2xl font-bold text-green-600">{dashboard.won_deals}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(dashboard.won_value)}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><XCircle className="h-4 w-4 text-red-500" />Perdidos</div>
                  <p className="text-2xl font-bold text-red-600">{dashboard.lost_deals}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(dashboard.lost_value)}</p>
                </CardContent></Card>
              </div>

              {dashboard.loss_reasons.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Motivos de Perda</CardTitle></CardHeader>
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

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Negociações</CardTitle>
                    <Select value={dealStatusFilter} onValueChange={setDealStatusFilter}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
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
                    <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
                  ) : !repDeals?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma negociação encontrada</p>
                  ) : (
                    <div className="space-y-2">
                      {repDeals.map(deal => (
                        <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => { setSelectedDeal(deal as any); setDealDetailOpen(true); }}>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{deal.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {deal.company_name && <span className="text-xs text-muted-foreground">{deal.company_name}</span>}
                              {deal.stage_name && <Badge variant="outline" className="text-xs px-1.5 py-0">{deal.stage_name}</Badge>}
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

          <DealDetailDialog
            deal={selectedDeal} open={dealDetailOpen}
            onOpenChange={(open) => { setDealDetailOpen(open); if (!open) setSelectedDeal(null); }}
          />
        </div>
      </MainLayout>
    );
  }

  // ============== LIST VIEW ==============
  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Indicadores</h1>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSegmentsManagerOpen(true)}>
                <Tag className="h-4 w-4 mr-2" />
                Segmentos
              </Button>
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="parceiro">Parceiros</SelectItem>
              <SelectItem value="representante">Representantes</SelectItem>
              <SelectItem value="indicador">Indicadores</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid gap-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>
        ) : !representatives?.length ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Nenhum indicador cadastrado</p>
              <p className="text-sm mt-1">Cadastre parceiros, representantes ou indicadores para gerenciar áreas e segmentos.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {representatives.map(rep => {
              const t = (rep.indicator_type as IndicatorType) || "representante";
              return (
                <Card key={rep.id} className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setSelectedRepId(rep.id)}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{rep.name}</p>
                          <Badge variant="outline" className={TYPE_COLORS[t]}>{TYPE_LABELS[t]}</Badge>
                          <Badge variant="outline" className="shrink-0">
                            <Percent className="h-3 w-3 mr-1" />{rep.commission_percent}%
                          </Badge>
                          {!!rep.areas_count && (
                            <Badge variant="secondary" className="shrink-0 text-xs gap-1">
                              <MapPin className="h-3 w-3" />{rep.areas_count} {rep.areas_count === 1 ? "área" : "áreas"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                          {rep.city && <span>{rep.city}{rep.state ? `/${rep.state}` : ""}</span>}
                          {rep.phone && <span>{rep.phone}</span>}
                          {rep.linked_user_name && <span className="text-primary">{rep.linked_user_name}</span>}
                        </div>
                        {!!rep.segment_ids?.length && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {rep.segment_ids.map(sid => {
                              const s = segmentById(sid);
                              if (!s) return null;
                              return (
                                <Badge key={sid} className="border-0 text-xs" style={{ backgroundColor: s.color, color: "white" }}>
                                  {s.name}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-sm font-medium">{rep.open_deals_count || 0} negociações</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(rep.open_deals_value || 0)}</p>
                        </div>
                        {canManage && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              onClick={e => { e.stopPropagation(); openEdit(rep); }}><Edit2 className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                              onClick={e => { e.stopPropagation(); setDeleteConfirm(rep.id); }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingRepId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingRepId ? "Editar Indicador" : "Novo Indicador"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 -mr-6 pr-6">
            <div className="space-y-4 p-1">
              {/* TIPO */}
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={form.indicator_type} onValueChange={(v: IndicatorType) => setForm(f => ({ ...f, indicator_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parceiro">Parceiro</SelectItem>
                    <SelectItem value="representante">Representante</SelectItem>
                    <SelectItem value="indicador">Indicador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email</Label>
                  <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Telefone</Label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>CPF/CNPJ</Label>
                  <Input value={form.cpf_cnpj} onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Comissão (%)</Label>
                  <Input type="number" min="0" max="100" step="0.5" value={form.commission_percent} onChange={e => setForm(f => ({ ...f, commission_percent: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Cidade</Label>
                  <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Estado (UF)</Label>
                  <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} maxLength={2} /></div>
              </div>
              <div className="space-y-2"><Label>Endereço</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>

              {/* SEGMENTOS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Segmentos de Atuação</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSegmentsManagerOpen(true)}>
                    <Settings className="h-3 w-3 mr-1" /> Gerenciar
                  </Button>
                </div>
                {allSegments.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2 border border-dashed rounded">
                    Nenhum segmento cadastrado. Clique em "Gerenciar" para criar (ex: Indústria, Postos, Franquias).
                  </p>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {allSegments.map(s => {
                      const active = form.segment_ids.includes(s.id);
                      return (
                        <button key={s.id} type="button" onClick={() => toggleSegment(s.id)}
                          className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition-all ${
                            active ? "text-white border-transparent" : "bg-muted text-muted-foreground border-transparent hover:border-border"
                          }`}
                          style={active ? { backgroundColor: s.color } : {}}>
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ÁREAS DE ATUAÇÃO */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2"><MapPin className="h-4 w-4" />Áreas de Atuação (raio em km)</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addArea}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar área
                  </Button>
                </div>
                {form.areas.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 border border-dashed rounded text-center">
                    Sem áreas. Adicione cidades base para mostrar o raio de cobertura no mapa.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {form.areas.map((area, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_60px_90px_auto] gap-2 items-end p-2 bg-muted/30 rounded-md">
                        <div>
                          <Label className="text-xs">Cidade</Label>
                          <Input className="h-8" value={area.city || ""} onChange={e => updateArea(idx, { city: e.target.value })} placeholder="Ex: São José do Rio Preto" />
                        </div>
                        <div>
                          <Label className="text-xs">UF</Label>
                          <Input className="h-8" maxLength={2} value={area.state || ""} onChange={e => updateArea(idx, { state: e.target.value.toUpperCase() })} />
                        </div>
                        <div>
                          <Label className="text-xs">Raio (km)</Label>
                          <Input className="h-8" type="number" min={1} value={area.radius_km} onChange={e => updateArea(idx, { radius_km: Number(e.target.value) || 100 })} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeArea(idx)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Vendedor Vinculado</Label>
                <Select value={form.linked_user_id || "none"} onValueChange={v => setForm(f => ({ ...f, linked_user_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
              {(createRepresentative.isPending || updateRepresentative.isPending) ? "Salvando..." : editingRepId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Excluir indicador?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IndicatorSegmentsManager open={segmentsManagerOpen} onOpenChange={setSegmentsManagerOpen} />
    </MainLayout>
  );
}
