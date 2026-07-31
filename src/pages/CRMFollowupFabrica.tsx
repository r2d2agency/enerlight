import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, closestCorners, useSensor, useSensors, useDroppable, MeasuringStrategy,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { MainLayout } from "@/components/layout/MainLayout";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Factory, Loader2, MessageSquare, AlertTriangle, Search, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FollowupCard {
  order_key: string;
  number?: string;
  client_name?: string;
  value?: number;
  seller_name?: string;
  channel?: string;
  city?: string;
  state?: string;
  followup?: string;
  status?: string;
  emission_date?: string;
  stage: string;
  last_feedback?: string | null;
  last_feedback_at?: string | null;
  last_feedback_by_name?: string | null;
  needs_feedback_today?: boolean;
  factory_note?: string | null;
}

const STAGES: { key: string; label: string; color: string }[] = [
  { key: "aguardando", label: "Aguardando Vendedor", color: "bg-amber-500" },
  { key: "feedback", label: "Feedback Recebido", color: "bg-blue-500" },
  { key: "tratativa", label: "Em Tratativa (Fábrica)", color: "bg-purple-500" },
  { key: "pronto", label: "Pronto p/ Produção", color: "bg-emerald-500" },
];

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const safeDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy HH:mm");
};

function DraggableCard({ card, onOpen }: { card: FollowupCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.order_key });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        onClick={onOpen}
        className={cn(
          "bg-card border rounded-lg p-3 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all space-y-2",
          card.needs_feedback_today && "border-amber-500/60"
        )}
      >
        <div className="flex items-start gap-2">
          <span className="font-semibold text-xs">#{card.number || card.order_key}</span>
          <div className="flex-1" />
          <span className="text-xs font-medium">{money(Number(card.value || 0))}</span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{card.client_name || "Sem cliente"}</p>
        <div className="flex flex-wrap gap-1">
          {card.seller_name && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{card.seller_name}</Badge>
          )}
          {card.channel && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{card.channel}</Badge>
          )}
          {card.needs_feedback_today && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-600 border-amber-500/30">
              <AlertTriangle className="h-3 w-3 mr-0.5" /> Sem feedback hoje
            </Badge>
          )}
        </div>
        {card.last_feedback && (
          <div className="rounded-md bg-muted/60 p-2">
            <p className="text-[11px] leading-snug line-clamp-3">{card.last_feedback}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {card.last_feedback_by_name || "—"} · {safeDate(card.last_feedback_at)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StageColumn({
  stage, cards, onOpen,
}: { stage: typeof STAGES[number]; cards: FollowupCard[]; onOpen: (c: FollowupCard) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const total = cards.reduce((s, c) => s + Number(c.value || 0), 0);

  return (
    <div className={cn(
      "min-w-[280px] w-80 flex-shrink-0 flex flex-col rounded-lg border bg-muted/20 transition-colors",
      isOver && "ring-2 ring-primary/30 bg-primary/5"
    )}>
      <div className="flex items-center gap-2 p-3 border-b">
        <span className={cn("w-2.5 h-2.5 rounded-full", stage.color)} />
        <h3 className="font-semibold text-sm flex-1">{stage.label}</h3>
        <Badge variant="secondary" className="text-[10px]">{cards.length}</Badge>
      </div>
      <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b">{money(total)}</div>
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-320px)] overflow-y-auto">
        {cards.map((c) => (
          <DraggableCard key={c.order_key} card={c} onOpen={() => onOpen(c)} />
        ))}
        {cards.length === 0 && (
          <div className="text-center text-[11px] text-muted-foreground py-6 border border-dashed rounded-md">
            Arraste pedidos aqui
          </div>
        )}
      </div>
    </div>
  );
}

export default function CRMFollowupFabrica() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FollowupCard | null>(null);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["crm-followup-board-kanban"],
    queryFn: () =>
      api<{ cards: FollowupCard[]; total_value: number; followups?: string[]; custom_filters?: boolean }>(
        "/api/crm/goals/followup-board"
      ),
    refetchInterval: 60_000,
  });

  const activeFollowups = data?.followups || [];

  const { data: allFollowups } = useQuery({
    queryKey: ["crm-goals-followups"],
    queryFn: () => api<{ followup: string; count: number }[]>("/api/crm/goals/followups"),
  });

  const { data: followupConfig } = useQuery({
    queryKey: ["crm-followup-config"],
    queryFn: () => api<any>("/api/crm/goals/followup-config"),
  });

  const saveWaiting = useMutation({
    mutationFn: (values: string[]) =>
      api("/api/crm/goals/followup-config", {
        method: "PUT",
        body: JSON.stringify({ waiting_values: values }),
      }),
    onSuccess: () => {
      toast.success("FollowUps salvos");
      qc.invalidateQueries({ queryKey: ["crm-followup-config"] });
      qc.invalidateQueries({ queryKey: ["crm-followup-board-kanban"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar"),
  });




  const { data: logs } = useQuery({
    queryKey: ["crm-followup-logs", detail?.order_key],
    queryFn: () => api<any[]>(`/api/crm/goals/followup/${encodeURIComponent(detail!.order_key)}/logs`),
    enabled: !!detail,
  });

  const updateStage = useMutation({
    mutationFn: (payload: { order_key: string; stage?: string; factory_note?: string; resolved?: boolean }) =>
      api(`/api/crm/goals/followup/${encodeURIComponent(payload.order_key)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-followup-board-kanban"] });
      qc.invalidateQueries({ queryKey: ["crm-followup-logs"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao atualizar"),
  });

  const addFeedback = useMutation({
    mutationFn: (payload: { order_key: string; feedback: string }) =>
      api("/api/crm/goals/followup/feedback", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setFeedback("");
      toast.success("Feedback registrado");
      qc.invalidateQueries({ queryKey: ["crm-followup-board-kanban"] });
      qc.invalidateQueries({ queryKey: ["crm-followup-logs"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao registrar feedback"),
  });

  const cards = useMemo(() => {
    const list = data?.cards || [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter((c) =>
      [c.order_key, c.number, c.client_name, c.seller_name, c.city].some((f) =>
        String(f || "").toLowerCase().includes(s)
      )
    );
  }, [data, search]);

  const byStage = useMemo(() => {
    const map: Record<string, FollowupCard[]> = {};
    for (const st of STAGES) map[st.key] = [];
    for (const c of cards) (map[c.stage] || map.aguardando).push(c);
    return map;
  }, [cards]);

  const pendingToday = cards.filter((c) => c.needs_feedback_today).length;
  const totalValue = cards.reduce((s, c) => s + Number(c.value || 0), 0);

  function handleDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || !STAGES.some((s) => s.key === overId)) return;
    const orderKey = String(e.active.id);
    const card = cards.find((c) => c.order_key === orderKey);
    if (!card || card.stage === overId) return;
    updateStage.mutate({ order_key: orderKey, stage: overId });
  }

  const activeCard = cards.find((c) => c.order_key === activeId);

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Pedidos Aguardando Informação</h1>
          </div>
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido, cliente, vendedor..."
              className="pl-7 h-9 w-64"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} /> Atualizar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">FollowUps ativos:</span>
          {activeFollowups.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">nenhum filtro definido pelo admin</span>
          ) : (
            activeFollowups.map((f) => (
              <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
            ))
          )}
          {data && !data.custom_filters && activeFollowups.length > 0 && (
            <span className="text-[10px] text-muted-foreground">(padrão)</span>
          )}
        </div>



        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pedidos parados</CardTitle></CardHeader>
            <CardContent className="pt-0"><p className="text-2xl font-bold">{cards.length}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Valor total</CardTitle></CardHeader>
            <CardContent className="pt-0"><p className="text-2xl font-bold">{money(totalValue)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Sem feedback hoje</CardTitle></CardHeader>
            <CardContent className="pt-0"><p className="text-2xl font-bold text-amber-500">{pendingToday}</p></CardContent></Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          >
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-3 items-start min-w-max">
                {STAGES.map((st) => (
                  <StageColumn key={st.key} stage={st} cards={byStage[st.key] || []} onOpen={(c) => { setDetail(c); setNote(c.factory_note || ""); }} />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            <DragOverlay>
              {activeCard ? (
                <div className="w-72 bg-card border rounded-lg p-3 shadow-2xl rotate-1">
                  <p className="text-xs font-semibold">#{activeCard.number || activeCard.order_key}</p>
                  <p className="text-[11px] text-muted-foreground">{activeCard.client_name}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby="followup-detail-desc">
          <DialogHeader>
            <DialogTitle>Pedido #{detail?.number || detail?.order_key}</DialogTitle>
            <DialogDescription id="followup-detail-desc">
              {detail?.client_name} · {detail?.seller_name || "sem vendedor"} · {money(Number(detail?.value || 0))}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <Button
                    key={s.key}
                    size="sm"
                    variant={detail.stage === s.key ? "default" : "outline"}
                    onClick={() => {
                      updateStage.mutate({ order_key: detail.order_key, stage: s.key });
                      setDetail({ ...detail, stage: s.key });
                    }}
                  >{s.label}</Button>
                ))}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Observação da fábrica</p>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anotação interna..." />
                <Button size="sm" variant="secondary" onClick={() => updateStage.mutate({ order_key: detail.order_key, factory_note: note })}>
                  Salvar observação
                </Button>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Novo feedback</p>
                <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Descreva o status atual do pedido (mínimo 10 caracteres)" />
                <Button
                  size="sm"
                  disabled={feedback.trim().length < 10 || addFeedback.isPending}
                  onClick={() => addFeedback.mutate({ order_key: detail.order_key, feedback })}
                >
                  {addFeedback.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MessageSquare className="h-4 w-4 mr-1" />}
                  Registrar feedback
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Histórico</p>
                {(logs || []).length === 0 && <p className="text-xs text-muted-foreground">Sem registros.</p>}
                {(logs || []).map((l) => (
                  <div key={l.id} className="border rounded-md p-2">
                    <p className="text-[11px] text-muted-foreground">
                      {l.user_name || "—"} · {safeDate(l.created_at)} · {l.kind === "stage" ? "movimentação" : "feedback"}
                      {l.stage ? ` · ${STAGES.find((s) => s.key === l.stage)?.label || l.stage}` : ""}
                    </p>
                    {l.feedback && <p className="text-xs mt-1">{l.feedback}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
