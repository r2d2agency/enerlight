import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ComercialActor, ComercialCustomer, ComercialListFilters as ListFilters, ComercialOpportunity, ComercialOpportunityStage,
} from '@/lib/comercial-api';
import ComercialListFilters from './ComercialListFilters';
import { Loader2, Plus, Handshake, LayoutGrid, List as ListIcon, GripVertical, CalendarDays, UserRound } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

interface Props {
  basePath: string;
  listStages: () => Promise<{ stages: ComercialOpportunityStage[] }>;
  listOpportunities: (filters?: ListFilters) => Promise<{ opportunities: ComercialOpportunity[] }>;
  actor: ComercialActor;
  createOpportunity: (body: Partial<ComercialOpportunity>) => Promise<{ opportunity: ComercialOpportunity }>;
  updateOpportunity: (id: string, body: Partial<ComercialOpportunity>) => Promise<{ opportunity: ComercialOpportunity }>;
  listCustomers: () => Promise<{ customers: ComercialCustomer[] }>;
}

const emptyForm = { customer_id: '', title: '', estimated_value: '', probability_percent: '', expected_close_date: '', origin: '' };

export default function ComercialOportunidadesView({
  basePath, listStages, listOpportunities, createOpportunity, updateOpportunity, listCustomers, actor,
}: Props) {
  const [stages, setStages] = useState<ComercialOpportunityStage[]>([]);
  const [opportunities, setOpportunities] = useState<ComercialOpportunity[]>([]);
  const [customers, setCustomers] = useState<ComercialCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFilters>({});
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = (nextFilters = filters) => {
    setLoading(true);
    Promise.all([listStages(), listOpportunities(nextFilters)])
      .then(([stagesRes, oppsRes]) => {
        setStages(stagesRes.stages);
        setOpportunities(oppsRes.opportunities);
      })
      .catch((error) => toast({ title: 'Erro ao carregar oportunidades', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setForm(emptyForm);
    setDialogOpen(true);
    if (customers.length === 0) listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  };

  const handleCreate = async () => {
    if (!form.customer_id || !form.title.trim()) {
      toast({ title: 'Cliente e título são obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createOpportunity({
        customer_id: form.customer_id,
        title: form.title.trim(),
        estimated_value: form.estimated_value ? Number(form.estimated_value) : 0,
        probability_percent: form.probability_percent ? Number(form.probability_percent) : undefined,
        expected_close_date: form.expected_close_date || undefined,
        origin: form.origin || undefined,
      });
      setDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar oportunidade', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const stageId = String(event.over?.id || '');
    const opp = opportunities.find((item) => item.id === String(event.active.id));
    if (opp && stageId && stageId !== opp.stage_id) handleMove(opp, stageId);
  };

  const handleMove = async (opp: ComercialOpportunity, stageId: string) => {
    setMovingId(opp.id);
    try {
      await updateOpportunity(opp.id, { stage_id: stageId });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao mover', description: message, variant: 'destructive' });
    } finally {
      setMovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const DroppableStage = ({ stageId, className, children }: { stageId: string; className: string; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({ id: stageId });
    return <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-primary ring-offset-2' : ''}`}>{children}</div>;
  };

  const OpportunityCard = ({ opp, stageId }: { opp: ComercialOpportunity; stageId: string }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id });
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
    return <Card ref={setNodeRef} style={style} {...listeners} {...attributes} className={`group cursor-grab border-muted shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:cursor-grabbing ${isDragging ? 'z-20 opacity-70 shadow-xl' : ''}`}>
      <CardContent className="p-4" onClick={() => navigate(`${basePath}/${opp.id}`)}><div className="mb-3 flex items-start justify-between gap-2"><p className="text-sm font-semibold leading-snug">{opp.title}</p><GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" /></div><p className="mb-3 truncate text-xs text-muted-foreground">{opp.customer_name || 'Cliente não informado'}</p><div className="flex items-center justify-between"><p className="text-sm font-bold text-primary">{formatCurrency(opp.estimated_value)}</p>{opp.probability_percent != null && <span className="text-[11px] text-muted-foreground">{opp.probability_percent}%</span>}</div>{opp.actor_name && <p className="mt-3 flex items-center gap-1 truncate border-t pt-2 text-[11px] text-muted-foreground"><UserRound className="h-3 w-3" />{opp.actor_name}</p>}</CardContent>
      <div className="border-t bg-muted/20 px-3 py-2" onClick={(e) => e.stopPropagation()}><Select value={stageId} onValueChange={(v) => handleMove(opp, v)} disabled={movingId === opp.id}><SelectTrigger className="h-7 border-0 bg-transparent text-xs shadow-none"><SelectValue placeholder="Mover para..." /></SelectTrigger><SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
    </Card>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">Funil comercial — acompanhe cada negociação por etapa.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Nova oportunidade
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova oportunidade</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Cliente *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Projeto 50 luminárias" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor estimado</Label>
                  <Input type="number" step="0.01" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Probabilidade (%)</Label>
                  <Input type="number" min="0" max="100" value={form.probability_percent} onChange={(e) => setForm({ ...form, probability_percent: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Previsão de fechamento</Label>
                  <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Origem</Label>
                  <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Indicação, site..." />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ComercialListFilters actor={actor} value={filters} onChange={setFilters} onApply={() => load()} onClear={() => { setFilters({}); load({}); }} />
      <div className="flex items-center justify-between rounded-xl border bg-card p-2"><div><p className="px-2 text-sm font-semibold">Visão do funil</p><p className="px-2 text-xs text-muted-foreground">{opportunities.length} oportunidades filtradas</p></div><div className="flex rounded-lg bg-muted p-1"><Button size="sm" variant={viewMode === 'kanban' ? 'default' : 'ghost'} onClick={() => setViewMode('kanban')}><LayoutGrid className="mr-1 h-4 w-4" />Kanban</Button><Button size="sm" variant={viewMode === 'list' ? 'default' : 'ghost'} onClick={() => setViewMode('list')}><ListIcon className="mr-1 h-4 w-4" />Lista</Button></div></div>

      {opportunities.length === 0 && stages.length > 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Handshake className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma oportunidade criada ainda.</p>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <Card><CardContent className="overflow-x-auto p-0"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Oportunidade</th><th className="p-3">Cliente</th><th className="p-3">Vendedor</th><th className="p-3">Etapa</th><th className="p-3">Valor</th><th className="p-3">Probabilidade</th><th className="p-3">Data</th></tr></thead><tbody>{opportunities.map((opp) => <tr key={opp.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => navigate(`${basePath}/${opp.id}`)}><td className="p-3 font-medium">{opp.title}</td><td className="p-3">{opp.customer_name || '—'}</td><td className="p-3 text-muted-foreground">{opp.actor_name || '—'}</td><td className="p-3">{stages.find((stage) => stage.id === opp.stage_id)?.name || '—'}</td><td className="p-3 font-semibold">{formatCurrency(opp.estimated_value)}</td><td className="p-3">{opp.probability_percent != null ? `${opp.probability_percent}%` : '—'}</td><td className="p-3 text-muted-foreground">{opp.created_at ? new Date(opp.created_at).toLocaleDateString('pt-BR') : '—'}</td></tr>)}</tbody></table></CardContent></Card>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}><div className="flex gap-4 overflow-x-auto rounded-xl bg-muted/20 p-3 pb-4">
          {stages.map((stage, index) => {
            const stageOpps = opportunities.filter((o) => o.stage_id === stage.id);
            const stageTotal = stageOpps.reduce((s, o) => s + Number(o.estimated_value || 0), 0);
            return (
              <DroppableStage key={stage.id} stageId={stage.id} className="min-w-[290px] w-[290px] flex-shrink-0 rounded-xl border bg-background/80 p-3 shadow-sm">
                <div className="mb-3 flex items-start justify-between border-b pb-3">
                  <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${['bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500'][index % 5]}`} /><div><p className="text-sm font-semibold">{stage.name}</p><p className="text-[11px] text-muted-foreground">{stageOpps.length} oportunidade{stageOpps.length === 1 ? '' : 's'}</p></div></div>
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium">{formatCurrency(stageTotal)}</span>
                </div>
                <div className="min-h-[110px] space-y-3">
                  {stageOpps.map((opp) => <OpportunityCard key={opp.id} opp={opp} stageId={stage.id} />)}
                  {stageOpps.length === 0 && <div className="flex h-20 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">Nenhuma oportunidade</div>}
                </div>
              </DroppableStage>
            );
          })}
        </div></DndContext>
      )}
    </div>
  );
}
