import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { eachDayOfInterval, parseISO, format, subMonths, startOfMonth, endOfMonth, subDays } from "date-fns";
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

export function DailyEvolutionChart({ startDate, endDate, filterUserId, filterChannel, filterGroupId }: Props) {
  const [period, setPeriod] = useState<PeriodKey>("inherited");
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

  const chartData = useMemo(() => {
    if (!dailyData) return [];
    let allDays: Date[];
    try {
      allDays = eachDayOfInterval({ start: parseISO(effStart), end: parseISO(effEnd) });
    } catch { return []; }

    // Build map by day+type
    const map: Record<string, Record<string, number>> = {};
    dailyData.forEach(r => {
      const dayKey = typeof r.day === "string" ? r.day.split("T")[0] : String(r.day);
      if (!map[dayKey]) map[dayKey] = {};
      map[dayKey][r.data_type] = Number(r.total_value) || 0;
    });

    // Accumulate values
    let accOrc = 0, accPed = 0, accFat = 0;
    return allDays.map(d => {
      const key = format(d, "yyyy-MM-dd");
      const label = format(d, "dd/MM", { locale: ptBR });
      accOrc += map[key]?.orcamento || 0;
      accPed += map[key]?.pedido || 0;
      accFat += map[key]?.faturamento || 0;
      return {
        day: label,
        orcamento: accOrc,
        pedido: accPed,
        faturamento: accFat,
      };
    });
  }, [dailyData, effStart, effEnd]);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!chartData.length && !isLoading) return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Evolução Acumulada no Período
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1 mb-4">
          {PERIOD_OPTIONS.map(o => (
            <Button key={o.key} size="sm" variant={period === o.key ? "default" : "outline"} onClick={() => setPeriod(o.key)} className="text-xs h-7">
              {o.label}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado encontrado para o período selecionado.</p>
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Evolução Acumulada no Período
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1 mb-4">
          {PERIOD_OPTIONS.map(o => (
            <Button key={o.key} size="sm" variant={period === o.key ? "default" : "outline"} onClick={() => setPeriod(o.key)} className="text-xs h-7">
              {o.label}
            </Button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis tickFormatter={fmtShort} fontSize={11} width={55} />
            <Tooltip formatter={(v: number) => fmtFull(v)} />
            <Legend />
            <Line type="monotone" dataKey="orcamento" name="Orçamentos" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="pedido" name="Pedidos" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="faturamento" name="Faturamento" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
