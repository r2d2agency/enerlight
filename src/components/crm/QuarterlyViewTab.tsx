import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { Goal } from "@/hooks/use-goals";
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Target, FileText, ShoppingCart, Receipt, TrendingUp, Loader2, CalendarRange,
} from "lucide-react";
import { format, startOfQuarter, endOfQuarter, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

interface Props {
  goals?: Goal[];
  filterUserId: string;
  filterChannel: string;
  filterGroupId: string;
}

interface MonthData {
  month: string;         // YYYY-MM
  monthLabel: string;    // "Jan/25"
  quotes_value: number;
  orders_value: number;
  billing_value: number;
  quotes_count: number;
  orders_count: number;
  billing_count: number;
}

export function QuarterlyViewTab({ goals, filterUserId, filterChannel, filterGroupId }: Props) {
  const now = new Date();
  const qStart = startOfQuarter(now);
  const qEnd = endOfQuarter(now);
  const quarterLabel = `Q${Math.ceil((now.getMonth() + 1) / 3)}/${now.getFullYear()}`;

  // Build month ranges for the quarter
  const months = useMemo(() => {
    const result: { start: string; end: string; label: string; key: string }[] = [];
    let d = new Date(qStart);
    for (let i = 0; i < 3; i++) {
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      result.push({
        start: format(ms, "yyyy-MM-dd"),
        end: format(me, "yyyy-MM-dd"),
        label: format(ms, "MMM/yy", { locale: ptBR }),
        key: format(ms, "yyyy-MM"),
      });
      d = addMonths(d, 1);
    }
    return result;
  }, [qStart]);

  // Fetch data for each month
  const { data: monthlyData, isLoading } = useQuery({
    queryKey: ["quarterly-view", months[0]?.start, months[2]?.end, filterUserId, filterChannel, filterGroupId],
    queryFn: async () => {
      const results: MonthData[] = [];
      for (const m of months) {
        const sp = new URLSearchParams();
        sp.set("start_date", m.start);
        sp.set("end_date", m.end);
        if (filterUserId !== "all") sp.set("user_id", filterUserId);
        if (filterChannel !== "all") sp.set("channel", filterChannel);
        if (filterGroupId !== "all") sp.set("group_id", filterGroupId);
        const data = await api<any>(`/api/crm/goals/data-summary?${sp.toString()}`);
        const summary = data?.summary || { orcamento: { count: 0, value: 0 }, pedido: { count: 0, value: 0 }, faturamento: { count: 0, value: 0 } };
        results.push({
          month: m.key,
          monthLabel: m.label,
          quotes_value: summary.orcamento.value,
          orders_value: summary.pedido.value,
          billing_value: summary.faturamento.value,
          quotes_count: summary.orcamento.count,
          orders_count: summary.pedido.count,
          billing_count: summary.faturamento.count,
        });
      }
      return results;
    },
  });

  // Calculate quarterly goals (monthly goals × 3)
  const quarterlyGoals = useMemo(() => {
    if (!goals) return { quotes_value: 0, orders_value: 0, billing_value: 0, quotes_count: 0, orders_count: 0, billing_count: 0 };

    const getGoalValue = (metric: string) => {
      const activeGoals = goals.filter(g => g.metric === metric && g.is_active && g.period === "monthly");
      // Prefer geral goals
      const geral = activeGoals.filter(g => g.type === "geral");
      if (geral.length > 0) return geral.reduce((s, g) => s + g.target_value, 0) * 3;
      // Otherwise sum group goals
      const group = activeGoals.filter(g => g.type !== "individual");
      return group.reduce((s, g) => s + g.target_value, 0) * 3;
    };

    return {
      quotes_value: getGoalValue("quotes_value"),
      orders_value: getGoalValue("orders_value"),
      billing_value: getGoalValue("billing_value"),
      quotes_count: getGoalValue("quotes_count"),
      orders_count: getGoalValue("orders_count"),
      billing_count: getGoalValue("billing_count"),
    };
  }, [goals]);

  // Monthly goal (for chart line)
  const monthlyGoalValues = useMemo(() => {
    if (!goals) return { quotes_value: 0, orders_value: 0, billing_value: 0 };
    const getGoalValue = (metric: string) => {
      const activeGoals = goals.filter(g => g.metric === metric && g.is_active && g.period === "monthly");
      const geral = activeGoals.filter(g => g.type === "geral");
      if (geral.length > 0) return geral.reduce((s, g) => s + g.target_value, 0);
      const group = activeGoals.filter(g => g.type !== "individual");
      return group.reduce((s, g) => s + g.target_value, 0);
    };
    return {
      quotes_value: getGoalValue("quotes_value"),
      orders_value: getGoalValue("orders_value"),
      billing_value: getGoalValue("billing_value"),
    };
  }, [goals]);

  // Totals
  const totals = useMemo(() => {
    if (!monthlyData) return { quotes_value: 0, orders_value: 0, billing_value: 0, quotes_count: 0, orders_count: 0, billing_count: 0 };
    return monthlyData.reduce((acc, m) => ({
      quotes_value: acc.quotes_value + m.quotes_value,
      orders_value: acc.orders_value + m.orders_value,
      billing_value: acc.billing_value + m.billing_value,
      quotes_count: acc.quotes_count + m.quotes_count,
      orders_count: acc.orders_count + m.orders_count,
      billing_count: acc.billing_count + m.billing_count,
    }), { quotes_value: 0, orders_value: 0, billing_value: 0, quotes_count: 0, orders_count: 0, billing_count: 0 });
  }, [monthlyData]);

  const getProgressColor = (pct: number) => pct >= 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600";

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const sections = [
    { label: "Orçamentos", metricVal: "quotes_value", metricCount: "quotes_count", realized: totals.quotes_value, realizedCount: totals.quotes_count, goalVal: quarterlyGoals.quotes_value, goalCount: quarterlyGoals.quotes_count, color: "text-blue-600", borderColor: "border-l-blue-500", icon: <FileText className="h-4 w-4" /> },
    { label: "Pedidos", metricVal: "orders_value", metricCount: "orders_count", realized: totals.orders_value, realizedCount: totals.orders_count, goalVal: quarterlyGoals.orders_value, goalCount: quarterlyGoals.orders_count, color: "text-green-600", borderColor: "border-l-green-500", icon: <ShoppingCart className="h-4 w-4" /> },
    { label: "Faturamento", metricVal: "billing_value", metricCount: "billing_count", realized: totals.billing_value, realizedCount: totals.billing_count, goalVal: quarterlyGoals.billing_value, goalCount: quarterlyGoals.billing_count, color: "text-amber-600", borderColor: "border-l-amber-500", icon: <Receipt className="h-4 w-4" /> },
  ];

  // Chart data — each month with meta line and realized bars
  const chartData = monthlyData?.map(m => ({
    name: m.monthLabel,
    "Orçamentos": m.quotes_value,
    "Pedidos": m.orders_value,
    "Faturamento": m.billing_value,
    "Meta Orçamento": monthlyGoalValues.quotes_value,
    "Meta Pedido": monthlyGoalValues.orders_value,
    "Meta Faturamento": monthlyGoalValues.billing_value,
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CalendarRange className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Visão Trimestral — {quarterLabel}</h2>
          <p className="text-sm text-muted-foreground">
            {format(qStart, "dd/MM/yyyy")} até {format(qEnd, "dd/MM/yyyy")} — Metas mensais acumuladas para o trimestre
          </p>
        </div>
      </div>

      {/* KPI Cards — Quarterly Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map(s => {
          const pctVal = s.goalVal > 0 ? (s.realized / s.goalVal) * 100 : 0;
          const remaining = s.goalVal - s.realized;
          const isMet = remaining <= 0;
          return (
            <Card key={s.metricVal} className={`border-l-4 ${s.borderColor}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">{s.icon} {s.label} — Trimestre</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Meta Trim.</p>
                    <p className="text-sm font-bold">{s.goalVal > 0 ? fmt(s.goalVal) : "—"}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${isMet && s.goalVal > 0 ? "bg-green-50 dark:bg-green-950" : "bg-muted/50"}`}>
                    <p className="text-xs text-muted-foreground">Realizado</p>
                    <p className={`text-sm font-bold ${s.goalVal > 0 ? getProgressColor(pctVal) : s.color}`}>{fmt(s.realized)}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${isMet && s.goalVal > 0 ? "bg-green-50 dark:bg-green-950" : s.goalVal > 0 ? "bg-red-50 dark:bg-red-950" : "bg-muted/50"}`}>
                    <p className="text-xs text-muted-foreground">{isMet && s.goalVal > 0 ? "Atingida ✅" : "Falta"}</p>
                    <p className={`text-sm font-bold ${isMet && s.goalVal > 0 ? "text-green-600" : s.goalVal > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {s.goalVal > 0 ? (isMet ? "🎯" : fmt(remaining)) : "—"}
                    </p>
                  </div>
                </div>
                {s.goalVal > 0 && (
                  <div className="space-y-1">
                    <Progress value={Math.min(pctVal, 100)} className="h-2" />
                    <p className={`text-xs font-medium text-right ${getProgressColor(pctVal)}`}>{pctVal.toFixed(1)}%</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{s.realizedCount} registros no trimestre</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Monthly Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Evolução Mensal no Trimestre</CardTitle>
          <CardDescription>Detalhamento mês a mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-center">Orç. (Qtd)</TableHead>
                  <TableHead className="text-right">Orç. (R$)</TableHead>
                  <TableHead className="text-center">Ped. (Qtd)</TableHead>
                  <TableHead className="text-right">Ped. (R$)</TableHead>
                  <TableHead className="text-center">Fat. (Qtd)</TableHead>
                  <TableHead className="text-right">Fat. (R$)</TableHead>
                  <TableHead className="text-center">Conversão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData?.map(m => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium capitalize">{m.monthLabel}</TableCell>
                    <TableCell className="text-center text-blue-600">{m.quotes_count}</TableCell>
                    <TableCell className="text-right text-blue-600">{fmt(m.quotes_value)}</TableCell>
                    <TableCell className="text-center text-green-600">{m.orders_count}</TableCell>
                    <TableCell className="text-right text-green-600">{fmt(m.orders_value)}</TableCell>
                    <TableCell className="text-center text-amber-600">{m.billing_count}</TableCell>
                    <TableCell className="text-right text-amber-600">{fmt(m.billing_value)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={m.quotes_count > 0 && (m.orders_count / m.quotes_count) >= 0.3 ? "default" : "secondary"}>
                        {m.quotes_count > 0 ? ((m.orders_count / m.quotes_count) * 100).toFixed(0) : 0}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Total Trimestre</TableCell>
                  <TableCell className="text-center text-blue-600">{totals.quotes_count}</TableCell>
                  <TableCell className="text-right text-blue-600">{fmt(totals.quotes_value)}</TableCell>
                  <TableCell className="text-center text-green-600">{totals.orders_count}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(totals.orders_value)}</TableCell>
                  <TableCell className="text-center text-amber-600">{totals.billing_count}</TableCell>
                  <TableCell className="text-right text-amber-600">{fmt(totals.billing_value)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">
                      {totals.quotes_count > 0 ? ((totals.orders_count / totals.quotes_count) * 100).toFixed(0) : 0}%
                    </Badge>
                  </TableCell>
                </TableRow>
                {/* Meta row */}
                {(quarterlyGoals.quotes_value > 0 || quarterlyGoals.orders_value > 0 || quarterlyGoals.billing_value > 0) && (
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold text-primary">Meta Trimestral</TableCell>
                    <TableCell className="text-center font-bold">{quarterlyGoals.quotes_count > 0 ? quarterlyGoals.quotes_count : "—"}</TableCell>
                    <TableCell className="text-right font-bold">{quarterlyGoals.quotes_value > 0 ? fmt(quarterlyGoals.quotes_value) : "—"}</TableCell>
                    <TableCell className="text-center font-bold">{quarterlyGoals.orders_count > 0 ? quarterlyGoals.orders_count : "—"}</TableCell>
                    <TableCell className="text-right font-bold">{quarterlyGoals.orders_value > 0 ? fmt(quarterlyGoals.orders_value) : "—"}</TableCell>
                    <TableCell className="text-center font-bold">{quarterlyGoals.billing_count > 0 ? quarterlyGoals.billing_count : "—"}</TableCell>
                    <TableCell className="text-right font-bold">{quarterlyGoals.billing_value > 0 ? fmt(quarterlyGoals.billing_value) : "—"}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Evolution Line Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Evolução Trimestral — Meta vs Realizado
            </CardTitle>
            <CardDescription>Barras: valor realizado por mês · Linhas tracejadas: meta mensal</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(value: number) => fmt(value)}
                />
                <Legend />
                {/* Bars — realized */}
                <Bar dataKey="Orçamentos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={28} />
                <Bar dataKey="Pedidos" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={28} />
                <Bar dataKey="Faturamento" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={28} />
                {/* Lines — goals */}
                {monthlyGoalValues.quotes_value > 0 && (
                  <Line type="monotone" dataKey="Meta Orçamento" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4 }} />
                )}
                {monthlyGoalValues.orders_value > 0 && (
                  <Line type="monotone" dataKey="Meta Pedido" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4 }} />
                )}
                {monthlyGoalValues.billing_value > 0 && (
                  <Line type="monotone" dataKey="Meta Faturamento" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4 }} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
