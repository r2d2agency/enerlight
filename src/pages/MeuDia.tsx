import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, RefreshCw, AlertTriangle, Calendar, Phone, Bell, Kanban,
  MessageSquare, TrendingDown, CheckCircle2, Clock, ChevronRight, Filter,
} from "lucide-react";
import { useMeuDia, MeuDiaItem, MeuDiaItemType } from "@/hooks/use-meu-dia";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const TYPE_META: Record<MeuDiaItemType, { label: string; icon: any; color: string }> = {
  task:             { label: "Tarefa",         icon: CheckCircle2, color: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  followup:         { label: "Follow-up",      icon: Phone,        color: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  meeting:          { label: "Reunião",        icon: Calendar,     color: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  alert:            { label: "Alerta IA",      icon: Sparkles,     color: "bg-pink-500/10 text-pink-700 dark:text-pink-300" },
  stale_deal:       { label: "Card parado",    icon: TrendingDown, color: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
  scheduled_message:{ label: "Teleatendimento",icon: MessageSquare,color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  kanban_card:      { label: "Kanban",         icon: Kanban,       color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
};

const FILTERS: Array<{ key: "all" | MeuDiaItemType; label: string }> = [
  { key: "all",                label: "Tudo" },
  { key: "meeting",            label: "Reuniões" },
  { key: "task",               label: "Tarefas" },
  { key: "followup",           label: "Follow-ups" },
  { key: "alert",              label: "Alertas IA" },
  { key: "stale_deal",         label: "Cards parados" },
  { key: "scheduled_message",  label: "Teleatendimento" },
  { key: "kanban_card",        label: "Kanban" },
];

function formatCurrency(v?: number | null) {
  if (!v) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatTime(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return null; }
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function ItemRow({ item }: { item: MeuDiaItem }) {
  const navigate = useNavigate();
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const time = formatTime(item.starts_at);
  const value = formatCurrency(item.deal_value);

  return (
    <button
      onClick={() => navigate(item.link)}
      className={cn(
        "w-full text-left group flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors",
        item.is_overdue && "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
      )}
    >
      <div className={cn("shrink-0 mt-0.5 p-2 rounded-md", meta.color)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge variant="outline" className="text-[10px] uppercase font-medium">{meta.label}</Badge>
          {item.is_overdue && (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="h-3 w-3" /> Atrasado
            </Badge>
          )}
          {item.severity && item.severity !== "low" && (
            <Badge variant={item.severity === "critical" || item.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">
              {item.severity}
            </Badge>
          )}
          {time && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {time}
            </span>
          )}
          {value && (
            <span className="text-[11px] font-medium text-foreground/70">{value}</span>
          )}
        </div>
        <p className="font-medium text-sm leading-snug line-clamp-2">{item.title}</p>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.subtitle}</p>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function StatCard({ icon: Icon, label, value, accent }: any) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-md", accent)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] uppercase text-muted-foreground font-medium tracking-wide">{label}</p>
          <p className="text-xl font-semibold leading-none mt-1">{value}</p>
        </div>
      </div>
    </Card>
  );
}

export default function MeuDia() {
  const { data, isLoading, refetch, isFetching } = useMeuDia();
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | MeuDiaItemType>("all");

  const items = data?.items ?? [];
  const summary = data?.summary;

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter(i => i.type === filter)),
    [items, filter]
  );

  const firstName = (user?.name || "").split(" ")[0] || "";
  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {greetingByHour()}{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-sm text-muted-foreground capitalize">
            {today} • Suas ações priorizadas pela IA
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <StatCard icon={Sparkles}   label="Total"        value={summary.total}        accent="bg-primary/10 text-primary" />
          <StatCard icon={AlertTriangle} label="Atrasados" value={summary.overdue}     accent="bg-destructive/10 text-destructive" />
          <StatCard icon={Calendar}   label="Reuniões"     value={summary.meetings}    accent="bg-violet-500/10 text-violet-600" />
          <StatCard icon={Phone}      label="Follow-ups"   value={summary.followups}   accent="bg-amber-500/10 text-amber-600" />
          <StatCard icon={Bell}       label="Alertas IA"   value={summary.alerts}      accent="bg-pink-500/10 text-pink-600" />
          <StatCard icon={TrendingDown} label="Parados"    value={summary.stale_deals} accent="bg-orange-500/10 text-orange-600" />
        </div>
      )}

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex w-max">
            {FILTERS.map(f => (
              <TabsTrigger key={f.key} value={f.key} className="text-xs">{f.label}</TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
      </Tabs>

      {/* List */}
      <Card>
        <CardContent className="p-3 md:p-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-medium">Nada para fazer agora 🎉</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === "all"
                  ? "Você está em dia com tudo. A IA vai te avisar quando surgir algo."
                  : "Nenhum item nesse filtro."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => <ItemRow key={item.id} item={item} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {data?.generated_at && (
        <p className="text-[11px] text-muted-foreground text-center">
          Atualizado em {new Date(data.generated_at).toLocaleTimeString("pt-BR")} • Refresh automático a cada 1 min
        </p>
      )}
    </div>
  );
}
