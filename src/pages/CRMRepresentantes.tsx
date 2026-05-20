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
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  useRepresentatives, useRepresentative, useRepresentativeDashboard, useRepresentativeMutations,
  useRepresentativeDeals, useIndicatorSegments, Representative, IndicatorArea, IndicatorType,
  useIndicatorHistory, useIndicatorHistoryMutations, useCreateScheduledMessage, useScheduledMessagesByPhone,
  useIndicatorSources, useIndicatorSourceMutations
} from "@/hooks/use-representatives";


import { useCRMMyTeam, CRMDeal, useCRMTaskMutations, useCRMTasks } from "@/hooks/use-crm";
import { api } from "@/lib/api";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { TaskDialog } from "@/components/crm/TaskDialog";

import { IndicatorSegmentsManager } from "@/components/crm/IndicatorSegmentsManager";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Search, Users, DollarSign, Briefcase, Edit2, Trash2, ArrowLeft, Calendar as CalendarIcon,
  XCircle, Trophy, Percent, ExternalLink, MapPin, Settings, X, Tag, History, Clock,
  LayoutDashboard, User, Building2, MessageSquare, Send
} from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<IndicatorType, string> = {
  parceiro: "Parceiro",
  representante: "Representante",
  indicador: "Indicador",
  instalador: "Instalador",
};
const TYPE_COLORS: Record<IndicatorType, string> = {
  parceiro: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
  representante: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-400",
  indicador: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  instalador: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400",
};

interface FormState {
  name: string; email: string; phone: string; cpf_cnpj: string;
  city: string; state: string; address: string; zip_code: string;
  commission_percent: string; notes: string; linked_user_id: string;
  indicator_type: IndicatorType;
  segment_ids: string[];
  areas: IndicatorArea[];
  source: string;
}

const emptyForm: FormState = {
  name: "", email: "", phone: "", cpf_cnpj: "", city: "", state: "",
  address: "", zip_code: "", commission_percent: "5", notes: "", linked_user_id: "",
  indicator_type: "representante", segment_ids: [], areas: [], source: "",
};


export default function CRMRepresentantes() {
  const { user, userPermissions } = useAuth();
  const canManageRep = true; // Liberado para todos cadastrarem conforme solicitação do usuário
  const isAdminOrManager = user?.role === "owner" || user?.role === "admin" || user?.role === "manager";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [dealStatusFilter, setDealStatusFilter] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
  const [dealDetailOpen, setDealDetailOpen] = useState(false);
  const [segmentsManagerOpen, setSegmentsManagerOpen] = useState(false);
  const [historyContent, setHistoryContent] = useState("");
  const [scheduleWhatsAppOpen, setScheduleWhatsAppOpen] = useState(false);
  const [whatsAppDate, setWhatsAppDate] = useState<Date | undefined>(undefined);
  const [whatsAppTime, setWhatsAppTime] = useState("09:00");
  const [whatsAppContent, setWhatsAppContent] = useState("");
  const [whatsAppCalendarOpen, setWhatsAppCalendarOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: representatives, isLoading } = useRepresentatives(search || undefined, typeFilter, ownerFilter);
  const selectedRep = representatives?.find(r => r.id === selectedRepId);
  const { data: dashboard, isLoading: loadingDash } = useRepresentativeDashboard(selectedRepId, startDate, endDate);
  const { data: repDeals, isLoading: loadingDeals } = useRepresentativeDeals(selectedRepId, startDate, endDate, dealStatusFilter);
  const { data: orgMembers } = useCRMMyTeam();
  const { data: allSegments = [] } = useIndicatorSegments();
  const { data: editingRep } = useRepresentative(editingRepId);
  const { createRepresentative, updateRepresentative, deleteRepresentative } = useRepresentativeMutations();
  const { data: history = [], refetch: refetchHistory } = useIndicatorHistory(selectedRepId);
  const { createHistory, deleteHistory } = useIndicatorHistoryMutations();

  const { data: scheduledMessages = [] } = useScheduledMessagesByPhone(selectedRep?.phone || "");
  const createScheduledMessage = useCreateScheduledMessage();
  const { createTask, deleteTask: deleteTaskMutation, completeTask } = useCRMTaskMutations();
  const { data: repTasks = [], isLoading: loadingTasks } = useCRMTasks({ company_id: selectedRepId || undefined, status: 'pending' });


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
  const updateAreaRadius = (idx: number, raw: string) => {
    // Permite digitar livremente; vazio vira 0 temporariamente para não travar o input
    const num = raw === "" ? 0 : Number(raw);
    if (Number.isNaN(num)) return;
    setForm(f => ({ ...f, areas: f.areas.map((a, i) => i === idx ? { ...a, radius_km: num } : a) }));
  };
  const removeArea = (idx: number) =>
    setForm(f => ({ ...f, areas: f.areas.filter((_, i) => i !== idx) }));

  const toggleSegment = (id: string) =>
    setForm(f => ({
      ...f,
      segment_ids: f.segment_ids.includes(id) ? f.segment_ids.filter(s => s !== id) : [...f.segment_ids, id],
    }));

  const formatCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const segmentById = (id: string) => allSegments.find(s => s.id === id);

  // ============== DASHBOARD DATA ==============
  const statsByType = (representatives || []).reduce((acc, rep) => {
    const type = rep.indicator_type || "representante";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const rankingBySeller = (representatives || []).reduce((acc, rep) => {
    const seller = rep.linked_user_name || "Sem vendedor";
    acc[seller] = (acc[seller] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedSellers = Object.entries(rankingBySeller).sort((a, b) => b[1] - a[1]);

  // ============== DASHBOARD VIEW ==============
  if (selectedRepId && selectedRep) {
    const primaryContact = selectedRep; // Using representative as contact info

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
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 h-9" />
            <span className="text-sm text-muted-foreground">até</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 h-9" />
          </div>

          {loadingDash ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : dashboard ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
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
                    ) : (() => {
                      const rate = (dashboard?.commission_percent || 0) / 100;
                      const totalValue = repDeals.reduce((s, d) => s + Number(d.value || 0), 0);
                      const totalCommission = repDeals.reduce((s, d) => s + Number(d.value || 0) * rate, 0);
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/40 border border-dashed text-xs">
                            <span className="text-muted-foreground">
                              Total ({repDeals.length} {repDeals.length === 1 ? 'negociação' : 'negociações'})
                            </span>
                            <div className="flex items-center gap-4">
                              <span className="font-medium">{formatCurrency(totalValue)}</span>
                              <span className="text-amber-600 font-semibold">
                                Comissão: {formatCurrency(totalCommission)}
                              </span>
                            </div>
                          </div>
                          {repDeals.map(deal => {
                            const dealCommission = Number(deal.value || 0) * rate;
                            return (
                              <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors group"
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
                                    <p className="text-[11px] text-amber-600 font-medium">
                                      Comissão: {formatCurrency(dealCommission)}
                                    </p>
                                    <Badge variant={deal.status === 'won' ? 'default' : deal.status === 'lost' ? 'destructive' : 'secondary'} className="text-xs mt-0.5">
                                      {deal.status === 'open' ? 'Aberta' : deal.status === 'won' ? 'Ganha' : 'Perdida'}
                                    </Badge>
                                  </div>
                                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>


                {selectedRep?.phone && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-green-500" /> WhatsApp Agendado
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {scheduledMessages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem agendada</p>
                      ) : (
                        <div className="space-y-2">
                          {scheduledMessages.map(msg => (
                            <div key={msg.id} className="p-2 rounded-lg border bg-muted/20 text-xs">
                              <p className="line-clamp-2 italic mb-1">"{msg.content}"</p>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {format(parseISO(msg.scheduled_at), "dd/MM HH:mm")}
                                </span>
                                <Badge variant="secondary" className="text-[8px] h-3.5 px-1 uppercase">
                                  {msg.status === 'pending' ? 'Pendente' : msg.status === 'sent' ? 'Enviado' : 'Falhou'}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* COLUNA HISTÓRICO */}
              <div className="space-y-6">
                <Card className="flex flex-col">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <History className="h-4 w-4" /> Histórico e Atividades
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => setTaskDialogOpen(true)}
                      >
                        <CalendarIcon className="h-3.5 w-3.5" /> Agendar Tarefa
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-xs gap-1.5" 
                        onClick={() => {
                          if (!primaryContact?.phone) {
                            toast.error("Este indicador não possui telefone cadastrado para agendar WhatsApp.");
                            return;
                          }
                          setScheduleWhatsAppOpen(!scheduleWhatsAppOpen);
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Agendar WhatsApp
                      </Button>
                    </div>

                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    {scheduleWhatsAppOpen && (
                      <div className="p-3 border rounded-lg bg-muted/30 space-y-3 mb-2 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold flex items-center gap-2"><MessageSquare className="h-3 w-3" /> Agendar WhatsApp</h4>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setScheduleWhatsAppOpen(false)}><X className="h-3 w-3" /></Button>
                        </div>
                        <div className="space-y-2">
                          <Textarea
                            placeholder="Conteúdo da mensagem..."
                            value={whatsAppContent}
                            onChange={e => setWhatsAppContent(e.target.value)}
                            className="min-h-[60px] text-xs"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Popover open={whatsAppCalendarOpen} onOpenChange={setWhatsAppCalendarOpen}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className={cn("h-8 text-[11px] justify-start text-left font-normal w-full", !whatsAppDate && "text-muted-foreground")}>
                                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                  {whatsAppDate ? format(whatsAppDate, "dd/MM/yyyy") : "Selecionar data"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={whatsAppDate}
                                  onSelect={(d) => { setWhatsAppDate(d); setWhatsAppCalendarOpen(false); }}
                                  initialFocus
                                  locale={ptBR}
                                />
                              </PopoverContent>
                            </Popover>
                            <Input
                              type="time"
                              className="h-8 text-xs"
                              value={whatsAppTime}
                              onChange={e => setWhatsAppTime(e.target.value)}
                            />
                          </div>
                          <Button 
                            size="sm" 
                            className="w-full h-8 text-xs gap-1.5"
                            disabled={!whatsAppContent.trim() || !whatsAppDate || createScheduledMessage.isPending}
                            onClick={() => {
                              const [h, m] = whatsAppTime.split(":").map(Number);
                              const date = new Date(whatsAppDate!);
                              date.setHours(h, m, 0, 0);
                              
                              createScheduledMessage.mutate({
                                phone: selectedRep.phone!,
                                content: whatsAppContent,
                                scheduled_at: date.toISOString(),
                              }, {
                                onSuccess: () => {
                                  setWhatsAppContent("");
                                  setWhatsAppDate(undefined);
                                  setScheduleWhatsAppOpen(false);
                                  toast.success("WhatsApp agendado!");
                                  
                                  // Add to history as well
                                  createHistory.mutate({
                                    indicatorId: selectedRepId!,
                                    content: `WhatsApp agendado para ${format(date, "dd/MM/yyyy HH:mm")}: ${whatsAppContent.substring(0, 50)}${whatsAppContent.length > 50 ? '...' : ''}`
                                  });
                                }
                              });
                            }}
                          >
                            <Send className="h-3 w-3" /> Agendar Mensagem
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Textarea
                        placeholder="Novo histórico..."
                        value={historyContent}
                        onChange={e => setHistoryContent(e.target.value)}
                        className="min-h-[80px] text-sm"
                      />
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!historyContent.trim() || createHistory.isPending}
                        onClick={() => {
                          createHistory.mutate(
                            { indicatorId: selectedRepId!, content: historyContent },
                            { 
                              onSuccess: () => setHistoryContent(""),
                              onError: (err: any) => {
                                if (err.message?.includes('404') || err.message?.includes('HTML')) {
                                  toast.error("O backend ainda não suporta histórico para indicadores. Contate o administrador.");
                                } else {
                                  toast.error(err.message || "Erro ao salvar histórico.");
                                }
                              }
                            }
                          );
                        }}
                      >
                        Salvar
                      </Button>
                    </div>

                    {(repTasks.length > 0 || scheduledMessages.length > 0) && (
                      <div className="space-y-4">
                        {repTasks.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <CalendarIcon className="h-3 w-3" /> Tarefas Pendentes
                            </p>
                            <div className="space-y-2">
                              {repTasks.map(task => (
                                <div key={task.id} className="p-2 rounded border bg-blue-500/5 border-blue-500/20 text-xs group relative">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-blue-600 flex items-center gap-1 uppercase text-[9px]">
                                      {task.type || 'Tarefa'}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {task.due_date ? format(parseISO(task.due_date), "dd/MM HH:mm") : 'Sem data'}
                                    </span>
                                  </div>
                                  <p className="font-medium text-foreground">{task.title}</p>
                                  {task.description && <p className="line-clamp-2 italic text-muted-foreground mt-0.5">{task.description}</p>}
                                  
                                  <div className="flex items-center gap-1 mt-2">
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="h-6 px-2 text-[10px] gap-1 text-green-600 border-green-200 bg-green-50 hover:bg-green-100 hover:text-green-700" 
                                      onClick={() => completeTask.mutate(task.id)}
                                    >
                                      <Trophy className="h-3 w-3" /> Concluir
                                    </Button>
                                    <Button 
                                      size="icon" 
                                      variant="ghost" 
                                      className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" 
                                      onClick={() => { if(window.confirm("Excluir tarefa?")) deleteTaskMutation.mutate(task.id) }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {scheduledMessages.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <MessageSquare className="h-3 w-3" /> WhatsApp Agendados
                            </p>
                            <div className="space-y-2">
                              {scheduledMessages.filter(m => m.status === 'pending').map(msg => (
                                <div key={msg.id} className="p-2 rounded border bg-amber-500/5 border-amber-500/20 text-xs">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-amber-600 flex items-center gap-1 uppercase text-[9px]">
                                      WhatsApp
                                    </span>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {format(parseISO(msg.scheduled_at), "dd/MM HH:mm")}
                                    </span>
                                  </div>
                                  <p className="line-clamp-2 italic text-muted-foreground">"{msg.content}"</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <ScrollArea className="flex-1 -mx-2 px-2 max-h-[400px]">
                      <div className="space-y-4">
                        {history.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-8">Nenhum histórico registrado.</p>
                        ) : (
                        history.map((h) => (
                          <div key={h.id} className="relative pl-4 border-l-2 border-muted pb-4 last:pb-0 group/history">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-background border-2 border-muted flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold">{h.user_name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground">{format(parseISO(h.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-5 w-5 opacity-0 group-hover/history:opacity-100 transition-opacity text-destructive"
                                    onClick={async () => {
                                      if (window.confirm("Deseja realmente excluir este histórico?")) {
                                        try {
                                          await deleteHistory.mutateAsync({ indicatorId: selectedRepId!, historyId: h.id });
                                          refetchHistory();

                                          } catch (err: any) {
                                            console.error("Erro ao excluir histórico:", err);
                                            toast.error(err.message || "Erro ao excluir histórico.");
                                          }
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{h.content}</p>
                            </div>
                          </div>
                        ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          <DealDetailDialog
            deal={selectedDeal} open={dealDetailOpen}
            onOpenChange={(open) => { setDealDetailOpen(open); if (!open) setSelectedDeal(null); }}
          />

          <TaskDialog
            task={null}
            companyId={selectedRepId || undefined}
            open={taskDialogOpen}
            onOpenChange={setTaskDialogOpen}
          />

        </div>
      </MainLayout>
    );
  }

  // ============== PIPELINE VIEW ==============
  if (viewMode === "pipeline") {
    return (
      <MainLayout>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">Pipeline de Indicadores</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewMode("list")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para Lista
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center bg-muted/30 p-3 rounded-lg border border-dashed">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, email ou cidade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdminOrManager && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-44 h-9">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <SelectValue placeholder="Vendedor" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  <SelectItem value="mine">Meus vinculados</SelectItem>
                  {orgMembers?.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="h-9 w-[1px] bg-border mx-1" />

            <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as any)} className="bg-background border rounded-md p-0.5">
              <ToggleGroupItem value="list" className="h-8 px-3 text-xs gap-1.5">
                <Users className="h-3.5 w-3.5" /> Lista
              </ToggleGroupItem>
              <ToggleGroupItem value="pipeline" className="h-8 px-3 text-xs gap-1.5">
                <LayoutDashboard className="h-3.5 w-3.5" /> Pipeline
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <ScrollArea className="h-[calc(100vh-280px)] border rounded-xl bg-muted/20">
            <div className="p-4 flex gap-4 min-w-max">
              {Object.entries(TYPE_LABELS).map(([type, label]) => {
                const reps = (representatives || []).filter(r => (r.indicator_type || "representante") === type);
                const totalValue = reps.reduce((sum, r) => sum + (r.open_deals_value || 0), 0);
                
                return (
                  <div key={type} className="w-80 flex flex-col gap-3">
                    <div className={cn("p-3 rounded-t-lg border-b-2 bg-card shadow-sm flex items-center justify-between", TYPE_COLORS[type as IndicatorType].split(' ')[0].replace('bg-', 'border-b-'))} style={{ borderTopWidth: 4, borderTopColor: 'currentColor' }}>
                      <div>
                        <h3 className="font-bold text-sm">{label}</h3>
                        <p className="text-[10px] text-muted-foreground uppercase">{reps.length} {reps.length === 1 ? 'membro' : 'membros'}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{formatCurrency(totalValue)}</Badge>
                    </div>

                    <div className="flex-1 space-y-2 pb-10">
                      {reps.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground border-2 border-dashed rounded-lg">
                          Vazio
                        </div>
                      ) : reps.map(rep => (
                        <Card key={rep.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedRepId(rep.id)}>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-semibold text-sm leading-tight">{rep.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1 h-4">{rep.commission_percent}%</Badge>
                            </div>
                            
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              <span className="truncate">{rep.city || 'Sem cidade'}</span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-dashed">
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Briefcase className="h-3 w-3" />
                                {rep.open_deals_count || 0} negociações
                              </div>
                              <span className="text-xs font-bold text-primary">{formatCurrency(rep.open_deals_value || 0)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
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
          {canManageRep && (
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

        {/* Filters and View Toggle */}
        <div className="flex flex-wrap gap-2 items-center bg-muted/30 p-3 rounded-lg border border-dashed">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, email ou cidade..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isAdminOrManager && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-44 h-9">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <SelectValue placeholder="Vendedor" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos vendedores</SelectItem>
                <SelectItem value="mine">Meus vinculados</SelectItem>
                {orgMembers?.map(m => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="h-9 w-[1px] bg-border mx-1" />

          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as any)} className="bg-background border rounded-md p-0.5">
            <ToggleGroupItem value="list" className="h-8 px-3 text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" /> Lista
            </ToggleGroupItem>
            <ToggleGroupItem value="pipeline" className="h-8 px-3 text-xs gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" /> Pipeline
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Dashboard Global */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total por Canal</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {Object.entries(TYPE_LABELS).map(([type, label]) => (
                  <div key={type} className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${TYPE_COLORS[type as IndicatorType].split(' ')[0]}`} />
                      {label}
                    </span>
                    <span className="font-bold">{statsByType[type] || 0}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Trophy className="h-3 w-3 text-amber-500" /> Ranking por Vendedor
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {sortedSellers.slice(0, 10).map(([seller, count], idx) => (
                  <div key={seller} className="flex justify-between items-center text-sm border-b border-dashed pb-1">
                    <span className="truncate">
                      <span className="text-muted-foreground mr-1">#{idx + 1}</span> {seller}
                    </span>
                    <span className="font-bold text-primary">{count}</span>
                  </div>
                ))}
                {sortedSellers.length === 0 && (
                  <p className="text-xs text-muted-foreground col-span-2 text-center py-2">Sem dados vinculados</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock className="h-3 w-3" /> Inatividade
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {(() => {
                  const now = new Date();
                  const sortedByInactivity = [...(representatives || []).filter(r => (r as any).last_interaction_at)].sort((a, b) => new Date((a as any).last_interaction_at!).getTime() - new Date((b as any).last_interaction_at!).getTime());
                  
                  return sortedByInactivity.slice(0, 5).map(rep => {
                    const last = new Date((rep as any).last_interaction_at!);
                    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <div key={rep.id} className="flex justify-between items-center text-xs border-b border-dashed pb-1 last:border-0 cursor-pointer"
                           onClick={(e) => { e.stopPropagation(); setSelectedRepId(rep.id); }}>
                        <span className="truncate max-w-[100px]">{rep.name}</span>
                        <Badge variant={diffDays > 15 ? "destructive" : diffDays > 7 ? "secondary" : "outline"} className="text-[10px] h-4">
                          {diffDays}d
                        </Badge>
                      </div>
                    );
                  });
                })()}
                {!(representatives || []).some(r => (r as any).last_interaction_at) && (
                  <p className="text-[10px] text-muted-foreground text-center py-2">Sem histórico</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Geral</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 flex flex-col items-center justify-center h-full">
              <div className="text-3xl font-bold">{(representatives || []).length}</div>
              <p className="text-xs text-muted-foreground">indicadores ativos</p>
            </CardContent>
          </Card>
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
                          {rep.linked_user_name && <span className="text-primary font-medium flex items-center gap-1">
                            <User className="h-3 w-3" /> {rep.linked_user_name}
                          </span>}
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
                        {canManageRep && (
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
          <div className="flex-1 overflow-y-auto -mr-4 pr-4 min-h-0">
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
                    <SelectItem value="instalador">Instalador</SelectItem>
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
                          <Input className="h-8" type="number" min={1} value={area.radius_km || ""} onChange={e => updateAreaRadius(idx, e.target.value)} onBlur={e => { if (!e.target.value || Number(e.target.value) < 1) updateArea(idx, { radius_km: 100 }); }} />
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
          </div>
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
