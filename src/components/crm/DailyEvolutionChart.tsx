import { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { eachDayOfInterval, parseISO, format, subMonths, startOfMonth, endOfMonth, subDays, getMonth, getYear, getWeek, startOfWeek, endOfWeek, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DailyRow {
  data_type: string;
  day: string;
  count: number;
  total_value: number;
}

interface Props {
  startDate: string;
  endDate: string;
  filterUserId?: string;
  filterChannel?: string;
  filterGroupId?: string;
}

type PeriodKey = "inherited" | "current_month" | "previous_month" | "60days" | "90days";

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "inherited", label: "Período Atual" },
  { key: "current_month", label: "Mês Atual" },
  { key: "previous_month", label: "Mês Anterior" },
  { key: "60days", label: "60 dias" },
  { key: "90days", label: "90 dias" },
];

function getPeriodDates(key: PeriodKey, parentStart: string, parentEnd: string) {
  const today = new Date();
  switch (key) {
    case "current_month":
      return { start: format(startOfMonth(today), "yyyy-MM-dd"), end: format(endOfMonth(today), "yyyy-MM-dd") };
    case "previous_month": {
      const prev = subMonths(today, 1);
      return { start: format(startOfMonth(prev), "yyyy-MM-dd"), end: format(endOfMonth(prev), "yyyy-MM-dd") };
    }
    case "60days":
      return { start: format(subDays(today, 60), "yyyy-MM-dd"), end: format(today, "yyyy-MM-dd") };
    case "90days":
      return { start: format(subDays(today, 90), "yyyy-MM-dd"), end: format(today, "yyyy-MM-dd") };
    default:
      return { start: parentStart, end: parentEnd };
  }
}

function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function fmtFull(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

interface ChartRow {
  day: string;
  index: number;
  orcamento: number;
  pedido: number;
  faturamento: number;
  isMonthEnd?: boolean;
  monthLabel?: string;
  monthTotalOrc?: number;
  monthTotalPed?: number;
  monthTotalFat?: number;
}

export function DailyEvolutionChart({ startDate, endDate, filterUserId, filterChannel, filterGroupId }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("inherited");
  const [showOrcamento, setShowOrcamento] = useState(true);
  const [showPedido, setShowPedido] = useState(true);
  const [showFaturamento, setShowFaturamento] = useState(true);
  const { start: effStart, end: effEnd } = getPeriodDates(period, startDate, endDate);

  const { data: dailyData, isLoading } = useQuery<DailyRow[]>({
    queryKey: ["crm-goals-daily", effStart, effEnd, filterUserId, filterChannel, filterGroupId],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("start_date", effStart);
      sp.set("end_date", effEnd);
      if (filterUserId && filterUserId !== "all") sp.set("user_id", filterUserId);
      if (filterChannel && filterChannel !== "all") sp.set("channel", filterChannel);
      if (filterGroupId && filterGroupId !== "all") sp.set("group_id", filterGroupId);
      return api<DailyRow[]>(`/api/crm/goals/data-daily?${sp.toString()}`);
    },
  });

  const { chartData, monthBoundaries, weekBoundaries } = useMemo(() => {
    const emptyBounds = [] as { index: number; label: string; orc: number; ped: number; fat: number }[];
    if (!dailyData) return { chartData: [], monthBoundaries: emptyBounds, weekBoundaries: emptyBounds };
    let allDays: Date[];
    try {
      allDays = eachDayOfInterval({ start: parseISO(effStart), end: parseISO(effEnd) });
    } catch { return { chartData: [], monthBoundaries: emptyBounds, weekBoundaries: emptyBounds }; }

    const map: Record<string, Record<string, number>> = {};
    dailyData.forEach(r => {
      const dayKey = typeof r.day === 'string' ? r.day.split('T')[0] : r.day;
      if (!map[dayKey]) map[dayKey] = {};
      map[dayKey][r.data_type] = r.total_value;
    });

    const rows: ChartRow[] = allDays.map((d, i) => {
      const key = format(d, "yyyy-MM-dd");
      const label = format(d, "dd/MM", { locale: ptBR });
      return { day: label, index: i, orcamento: map[key]?.orcamento || 0, pedido: map[key]?.pedido || 0, faturamento: map[key]?.faturamento || 0 };
    });

    // Month boundaries
    const boundaries: typeof emptyBounds = [];
    let currentMonth = -1, currentYear = -1, monthStart = 0;
    allDays.forEach((d, i) => {
      const m = getMonth(d), y = getYear(d);
      if (currentMonth === -1) { currentMonth = m; currentYear = y; monthStart = i; }
      else if (m !== currentMonth || y !== currentYear) {
        let orc = 0, ped = 0, fat = 0;
        for (let j = monthStart; j < i; j++) { orc += rows[j].orcamento; ped += rows[j].pedido; fat += rows[j].faturamento; }
        boundaries.push({ index: i - 1, label: format(allDays[monthStart], "MMM/yy", { locale: ptBR }), orc, ped, fat });
        currentMonth = m; currentYear = y; monthStart = i;
      }
    });
    if (allDays.length > 0) {
      let orc = 0, ped = 0, fat = 0;
      for (let j = monthStart; j < rows.length; j++) { orc += rows[j].orcamento; ped += rows[j].pedido; fat += rows[j].faturamento; }
      boundaries.push({ index: rows.length - 1, label: format(allDays[monthStart], "MMM/yy", { locale: ptBR }), orc, ped, fat });
    }

    // Weekly boundaries — only when viewing a single month (<=31 days)
    const weeks: typeof emptyBounds = [];
    const totalDays = differenceInCalendarDays(parseISO(effEnd), parseISO(effStart));
    if (totalDays <= 31 && allDays.length > 0) {
      let currentWeekNum = -1, weekStart = 0;
      allDays.forEach((d, i) => {
        const wn = getWeek(d, { weekStartsOn: 1, locale: ptBR });
        if (currentWeekNum === -1) { currentWeekNum = wn; weekStart = i; }
        else if (wn !== currentWeekNum) {
          let orc = 0, ped = 0, fat = 0;
          for (let j = weekStart; j < i; j++) { orc += rows[j].orcamento; ped += rows[j].pedido; fat += rows[j].faturamento; }
          const wStart = format(allDays[weekStart], "dd/MM");
          const wEnd = format(allDays[i - 1], "dd/MM");
          weeks.push({ index: i - 1, label: `Sem ${wStart}-${wEnd}`, orc, ped, fat });
          currentWeekNum = wn; weekStart = i;
        }
      });
      // Last week
      if (allDays.length > 0) {
        let orc = 0, ped = 0, fat = 0;
        for (let j = weekStart; j < rows.length; j++) { orc += rows[j].orcamento; ped += rows[j].pedido; fat += rows[j].faturamento; }
        const wStart = format(allDays[weekStart], "dd/MM");
        const wEnd = format(allDays[rows.length - 1], "dd/MM");
        weeks.push({ index: rows.length - 1, label: `Sem ${wStart}-${wEnd}`, orc, ped, fat });
      }
    }

    return { chartData: rows, monthBoundaries: boundaries, weekBoundaries: weeks };
  }, [dailyData, effStart, effEnd]);

  const periodButtons = (
    <div className="flex flex-wrap gap-1 mb-4">
      {PERIOD_OPTIONS.map(o => (
        <Button key={o.key} size="sm" variant={period === o.key ? "default" : "outline"} onClick={() => setPeriod(o.key)} className="text-xs h-7">
          {o.label}
        </Button>
      ))}
    </div>
  );

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!chartData.length && !isLoading) return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Evolução Diária no Período
        </CardTitle>
      </CardHeader>
      <CardContent>
        {periodButtons}
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado encontrado para o período selecionado.</p>
      </CardContent>
    </Card>
  );

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {fmtFull(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Evolução Diária no Período
        </CardTitle>
      </CardHeader>
      <CardContent>
        {periodButtons}

        {/* Series toggles */}
        <div className="flex flex-wrap gap-4 mb-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={showOrcamento} onCheckedChange={(v) => setShowOrcamento(!!v)} />
            <span className="text-blue-500 font-medium">Orçamentos</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={showPedido} onCheckedChange={(v) => setShowPedido(!!v)} />
            <span className="text-green-500 font-medium">Pedidos</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={showFaturamento} onCheckedChange={(v) => setShowFaturamento(!!v)} />
            <span className="text-amber-500 font-medium">Faturamento</span>
          </label>
        </div>
        {monthBoundaries.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {monthBoundaries.map((mb, i) => (
              <div key={i} className="flex-1 min-w-[140px] rounded-lg border border-border p-2 text-xs">
                <p className="font-semibold text-foreground capitalize mb-1">{mb.label}</p>
                <p className="text-blue-500">Orç: {fmtFull(mb.orc)}</p>
                <p className="text-green-500">Ped: {fmtFull(mb.ped)}</p>
                <p className="text-amber-500">Fat: {fmtFull(mb.fat)}</p>
              </div>
            ))}
          </div>
        )}

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="day" fontSize={11} interval={Math.max(Math.floor(chartData.length / 15), 0)} />
            <YAxis tickFormatter={fmtShort} fontSize={11} width={55} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {/* Month boundary reference lines */}
            {monthBoundaries.slice(0, -1).map((mb, i) => (
              <ReferenceLine
                key={i}
                x={chartData[mb.index]?.day}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `${mb.label}: ${fmtShort(mb.orc + mb.ped + mb.fat)}`,
                  position: "top",
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
            ))}
            {showOrcamento && <Line type="monotone" dataKey="orcamento" name="Orçamentos" stroke="#3b82f6" strokeWidth={2} dot={false} />}
            {showPedido && <Line type="monotone" dataKey="pedido" name="Pedidos" stroke="#22c55e" strokeWidth={2} dot={false} />}
            {showFaturamento && <Line type="monotone" dataKey="faturamento" name="Faturamento" stroke="#f59e0b" strokeWidth={2} dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
