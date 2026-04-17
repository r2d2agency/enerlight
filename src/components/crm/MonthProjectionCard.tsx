import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loader2, TrendingUp, TrendingDown, Minus, FileText, ShoppingCart, Receipt } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isBusinessDay } from "@/lib/brazilian-holidays";

interface DailyRow {
  data_type: string;
  day: string;
  count: number;
  total_value: number;
}

interface Props {
  filterUserId?: string;
  filterChannel?: string;
  filterGroupId?: string;
  quotesGoal?: number;
  ordersGoal?: number;
  billingGoal?: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}
function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export function MonthProjectionCard({
  filterUserId, filterChannel, filterGroupId,
  quotesGoal = 0, ordersGoal = 0, billingGoal = 0,
}: Props) {
  const today = new Date();
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");

  const { data: dailyData, isLoading } = useQuery<DailyRow[]>({
    queryKey: ["crm-goals-projection", monthStart, monthEnd, filterUserId, filterChannel, filterGroupId],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("start_date", monthStart);
      sp.set("end_date", monthEnd);
      if (filterUserId && filterUserId !== "all") sp.set("user_id", filterUserId);
      if (filterChannel && filterChannel !== "all") sp.set("channel", filterChannel);
      if (filterGroupId && filterGroupId !== "all") sp.set("group_id", filterGroupId);
      return api<DailyRow[]>(`/api/crm/goals/data-daily?${sp.toString()}`);
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Projeção do Mês (ritmo atual)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Build map dia → tipo → valor
  const allDays = eachDayOfInterval({ start: parseISO(monthStart), end: parseISO(monthEnd) });
  const todayKey = format(today, "yyyy-MM-dd");
  const businessDaysAll = allDays.filter(d => isBusinessDay(d));
  const businessDaysElapsed = allDays.filter(d => format(d, "yyyy-MM-dd") <= todayKey && isBusinessDay(d));
  const businessDaysRemaining = businessDaysAll.length - businessDaysElapsed.length;

  const dataMap: Record<string, Record<string, number>> = {};
  (dailyData || []).forEach(r => {
    const dayKey = typeof r.day === "string" ? r.day.split("T")[0] : r.day;
    if (!dataMap[dayKey]) dataMap[dayKey] = {};
    dataMap[dayKey][r.data_type] = (dataMap[dayKey][r.data_type] || 0) + Number(r.total_value || 0);
  });

  const totals = { orcamento: 0, pedido: 0, faturamento: 0 };
  for (const day in dataMap) {
    if (day > todayKey) continue;
    totals.orcamento += dataMap[day]?.orcamento || 0;
    totals.pedido += dataMap[day]?.pedido || 0;
    totals.faturamento += dataMap[day]?.faturamento || 0;
  }

  const elapsed = Math.max(businessDaysElapsed.length, 1);
  const dailyAvg = {
    orcamento: totals.orcamento / elapsed,
    pedido: totals.pedido / elapsed,
    faturamento: totals.faturamento / elapsed,
  };
  const projection = {
    orcamento: totals.orcamento + dailyAvg.orcamento * businessDaysRemaining,
    pedido: totals.pedido + dailyAvg.pedido * businessDaysRemaining,
    faturamento: totals.faturamento + dailyAvg.faturamento * businessDaysRemaining,
  };

  // Build chart: cumulative realized + projected line until end of month
  let cumOrc = 0, cumPed = 0, cumFat = 0;
  const chartData = allDays.map(d => {
    const key = format(d, "yyyy-MM-dd");
    const isPast = key <= todayKey;
    if (isPast) {
      cumOrc += dataMap[key]?.orcamento || 0;
      cumPed += dataMap[key]?.pedido || 0;
      cumFat += dataMap[key]?.faturamento || 0;
    }
    return {
      day: format(d, "dd/MM"),
      key,
      isPast,
      isBiz: isBusinessDay(d),
      realOrc: isPast ? cumOrc : null,
      realPed: isPast ? cumPed : null,
      realFat: isPast ? cumFat : null,
    };
  });

  // Project linear from "today" until end of month using daily average per business day
  let pOrc = cumOrc, pPed = cumPed, pFat = cumFat;
  const projData = chartData.map(row => {
    if (row.key < todayKey) {
      return { ...row, projOrc: null, projPed: null, projFat: null };
    }
    if (row.key === todayKey) {
      return { ...row, projOrc: cumOrc, projPed: cumPed, projFat: cumFat };
    }
    if (row.isBiz) {
      pOrc += dailyAvg.orcamento;
      pPed += dailyAvg.pedido;
      pFat += dailyAvg.faturamento;
    }
    return { ...row, projOrc: pOrc, projPed: pPed, projFat: pFat };
  });

  const sections = [
    {
      key: "pedido", label: "Pedidos", icon: <ShoppingCart className="h-4 w-4" />, color: "text-green-600",
      realized: totals.pedido, projected: projection.pedido, goal: ordersGoal, daily: dailyAvg.pedido,
    },
    {
      key: "orcamento", label: "Orçamentos", icon: <FileText className="h-4 w-4" />, color: "text-blue-600",
      realized: totals.orcamento, projected: projection.orcamento, goal: quotesGoal, daily: dailyAvg.orcamento,
    },
    {
      key: "faturamento", label: "Faturamento", icon: <Receipt className="h-4 w-4" />, color: "text-amber-600",
      realized: totals.faturamento, projected: projection.faturamento, goal: billingGoal, daily: dailyAvg.faturamento,
    },
  ];

  const monthLabel = format(today, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <TrendingUp className="h-4 w-4" />
          Projeção do Mês — ritmo atual ({monthLabel})
          {filterChannel && filterChannel !== "all" && (
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
              Canal: {filterChannel}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumo dias úteis */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-border p-2 text-center">
            <p className="text-muted-foreground">Dias úteis (total)</p>
            <p className="font-bold text-base">{businessDaysAll.length}</p>
          </div>
          <div className="rounded-lg border border-border p-2 text-center">
            <p className="text-muted-foreground">Decorridos</p>
            <p className="font-bold text-base text-primary">{businessDaysElapsed.length}</p>
          </div>
          <div className="rounded-lg border border-border p-2 text-center">
            <p className="text-muted-foreground">Restantes</p>
            <p className="font-bold text-base text-amber-600">{businessDaysRemaining}</p>
          </div>
        </div>

        {/* Cards de projeção */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sections.map(s => {
            const goalReached = s.goal > 0 && s.projected >= s.goal;
            const diff = s.goal > 0 ? s.projected - s.goal : 0;
            const pctReached = s.goal > 0 ? (s.projected / s.goal) * 100 : 0;
            const Icon = goalReached ? TrendingUp : diff < 0 ? TrendingDown : Minus;
            return (
              <div key={s.key} className="rounded-lg border border-border p-3 space-y-2">
                <div className={`flex items-center gap-2 text-sm font-semibold ${s.color}`}>
                  {s.icon} {s.label}
                </div>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Realizado</span>
                    <span className="font-medium">{fmt(s.realized)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Média/dia útil</span>
                    <span className="font-medium">{fmt(s.daily)}</span>
                  </div>
                  {s.goal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Meta</span>
                      <span className="font-medium">{fmt(s.goal)}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Previsto fim do mês</span>
                    <Icon className={`h-4 w-4 ${goalReached ? "text-green-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"}`} />
                  </div>
                  <p className={`text-lg font-bold ${goalReached ? "text-green-600" : diff < 0 ? "text-red-600" : "text-foreground"}`}>
                    {fmt(s.projected)}
                  </p>
                  {s.goal > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {pctReached.toFixed(0)}% da meta •{" "}
                      <span className={diff >= 0 ? "text-green-600" : "text-red-600"}>
                        {diff >= 0 ? "+" : ""}{fmt(diff)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Gráfico linha: realizado (sólido) + projetado (tracejado) + linhas de meta */}
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={projData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="day" fontSize={11} interval={Math.max(Math.floor(projData.length / 15), 0)} />
            <YAxis tickFormatter={fmtShort} fontSize={11} width={55} />
            <Tooltip
              formatter={(v: any) => (v == null ? "-" : fmt(Number(v)))}
              contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={format(today, "dd/MM")} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" label={{ value: "Hoje", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            {ordersGoal > 0 && (
              <ReferenceLine y={ordersGoal} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} label={{ value: `Meta Ped: ${fmtShort(ordersGoal)}`, fontSize: 10, fill: "#22c55e", position: "right" }} />
            )}
            {/* Realizado (linhas sólidas) */}
            <Line type="monotone" dataKey="realPed" name="Pedidos (real)" stroke="#22c55e" strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="realOrc" name="Orçamentos (real)" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="realFat" name="Faturamento (real)" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
            {/* Projeção (linhas tracejadas) */}
            <Line type="monotone" dataKey="projPed" name="Pedidos (previsto)" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="projOrc" name="Orçamentos (previsto)" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 4" dot={false} connectNulls={false} />
            <Line type="monotone" dataKey="projFat" name="Faturamento (previsto)" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 4" dot={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>

        <p className="text-xs text-muted-foreground text-center">
          A previsão usa a média diária realizada (em dias úteis) projetada para os {businessDaysRemaining} dias úteis restantes do mês.
        </p>
      </CardContent>
    </Card>
  );
}
