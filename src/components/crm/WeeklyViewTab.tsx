import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { Goal } from "@/hooks/use-goals";
import { SalesFunnelCard } from "@/components/crm/SalesFunnelCard";
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Target, FileText, ShoppingCart, Receipt, TrendingUp, Loader2, CalendarDays,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, isBefore, isAfter, min, max } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isBusinessDay } from "@/lib/brazilian-holidays";
import { eachDayOfInterval } from "date-fns";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

interface Props {
  goals?: Goal[];
  filterUserId: string;
  filterChannel: string;
  filterGroupId: string;
}

interface WeekInfo {
  weekNum: number;
  start: string;
  end: string;
  label: string;
  bizDays: number;
}

function getWeeksOfMonth(year: number, month: number): WeekInfo[] {
  const ms = startOfMonth(new Date(year, month, 1));
  const me = endOfMonth(ms);
  const weeks: WeekInfo[] = [];
  let weekStart = startOfWeek(ms, { weekStartsOn: 1 });
  let num = 1;

  while (isBefore(weekStart, me) || format(weekStart, "yyyy-MM") === format(ms, "yyyy-MM")) {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const clampedStart = max([weekStart, ms]);
    const clampedEnd = min([weekEnd, me]);

    if (isAfter(clampedStart, me)) break;

    const days = eachDayOfInterval({ start: clampedStart, end: clampedEnd });
    const bizDays = days.filter(d => isBusinessDay(d)).length;

    weeks.push({
      weekNum: num,
      start: format(clampedStart, "yyyy-MM-dd"),
      end: format(clampedEnd, "yyyy-MM-dd"),
      label: `Sem ${num} (${format(clampedStart, "dd/MM")} - ${format(clampedEnd, "dd/MM")})`,
      bizDays,
    });
    num++;
    weekStart = addWeeks(weekStart, 1);
    if (isAfter(weekStart, me)) break;
  }
  return weeks;
}

export function WeeklyViewTab({ goals, filterUserId, filterChannel, filterGroupId }: Props) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const weeks = useMemo(() => getWeeksOfMonth(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  // Current week index
  const currentWeekIdx = useMemo(() => {
    const today = format(now, "yyyy-MM-dd");
    const idx = weeks.findIndex(w => w.start <= today && w.end >= today);
    return idx >= 0 ? idx : 0;
  }, [weeks]);

  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null);
  const activeWeekIdx = selectedWeekIdx ?? currentWeekIdx;
  const activeWeek = weeks[activeWeekIdx];

  // Month options
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
      for (let m = 0; m < 12; m++) {
        opts.push({
          value: `${y}-${m}`,
          label: format(new Date(y, m, 1), "MMMM/yyyy", { locale: ptBR }),
        });
      }
    }
    return opts;
  }, []);

  // Fetch data for active week
  const { data: weekData, isLoading } = useQuery({
    queryKey: ["weekly-view-data", activeWeek?.start, activeWeek?.end, filterUserId, filterChannel, filterGroupId],
    queryFn: async () => {
      if (!activeWeek) return null;
      const sp = new URLSearchParams();
      sp.set("start_date", activeWeek.start);
      sp.set("end_date", activeWeek.end);
      if (filterUserId !== "all") sp.set("user_id", filterUserId);
      if (filterChannel !== "all") sp.set("channel", filterChannel);
      if (filterGroupId !== "all") sp.set("group_id", filterGroupId);
      return api<any>(`/api/crm/goals/data-summary?${sp.toString()}`);
    },
    enabled: !!activeWeek,
  });

  // Fetch all weeks data for chart
  const { data: allWeeksData } = useQuery({
    queryKey: ["weekly-view-all", selectedYear, selectedMonth, filterUserId, filterChannel, filterGroupId],
    queryFn: async () => {
      const results: Array<{ weekLabel: string; quotes_value: number; orders_value: number; billing_value: number; quotes_count: number; orders_count: number; billing_count: number }> = [];
      for (const w of weeks) {
        const sp = new URLSearchParams();
        sp.set("start_date", w.start);
        sp.set("end_date", w.end);
        if (filterUserId !== "all") sp.set("user_id", filterUserId);
        if (filterChannel !== "all") sp.set("channel", filterChannel);
        if (filterGroupId !== "all") sp.set("group_id", filterGroupId);
        const data = await api<any>(`/api/crm/goals/data-summary?${sp.toString()}`);
        const s = data?.summary || { orcamento: { count: 0, value: 0 }, pedido: { count: 0, value: 0 }, faturamento: { count: 0, value: 0 } };
        results.push({
          weekLabel: `Sem ${w.weekNum}`,
          quotes_value: s.orcamento.value,
          orders_value: s.pedido.value,
          billing_value: s.faturamento.value,
          quotes_count: s.orcamento.count,
          orders_count: s.pedido.count,
          billing_count: s.faturamento.count,
        });
      }
      return results;
    },
  });

  // Monthly goals / weeks count for weekly target
  const totalMonthBizDays = useMemo(() => {
    const ms = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    const me = endOfMonth(ms);
    return eachDayOfInterval({ start: ms, end: me }).filter(d => isBusinessDay(d)).length;
  }, [selectedYear, selectedMonth]);

  const getMonthlyGoalValue = (metric: string) => {
    if (!goals) return 0;
    const active = goals.filter(g => g.metric === metric && g.is_active && g.period === "monthly");

    // When a specific channel is selected, use that channel's goals
    if (filterChannel !== "all") {
      const channelGoals = active.filter(g => g.target_channel === filterChannel);
      if (channelGoals.length > 0) return channelGoals.reduce((s, g) => s + g.target_value, 0);
    }

    // When "all" or no channel goals found, use geral goals
    const geral = active.filter(g => g.type === "geral");
    if (geral.length > 0) return geral.reduce((s, g) => s + g.target_value, 0);
    const group = active.filter(g => g.type !== "individual");
    return group.reduce((s, g) => s + g.target_value, 0);
  };

  // Base weekly goal proportional to business days (no overflow)
  const weeklyBaseGoal = (metric: string, weekIdx: number) => {
    const monthly = getMonthlyGoalValue(metric);
    const w = weeks[weekIdx];
    if (!w || totalMonthBizDays === 0) return 0;
    return (monthly / totalMonthBizDays) * w.bizDays;
  };

  // Realized value per week (from allWeeksData)
  const weeklyRealized = (metric: string, weekIdx: number) => {
    const w = allWeeksData?.[weekIdx];
    if (!w) return 0;
    if (metric === "quotes_value") return w.quotes_value;
    if (metric === "orders_value") return w.orders_value;
    if (metric === "billing_value") return w.billing_value;
    return 0;
  };

  // Adjusted weekly goal with overflow (carry-over from previous weeks balance)
  // adjustedGoal[i] = baseGoal[i] - sum(realized[0..i-1] - baseGoal[0..i-1])
  const weeklyAdjustedGoal = (metric: string, weekIdx: number) => {
    const base = weeklyBaseGoal(metric, weekIdx);
    let carry = 0;
    for (let j = 0; j < weekIdx; j++) {
      carry += weeklyRealized(metric, j) - weeklyBaseGoal(metric, j);
    }
    // Positive carry => surplus reduces next goal; negative carry => deficit increases next goal
    return Math.max(0, base - carry);
  };

  // Backwards compatibility alias for active week
  const weeklyGoal = (metric: string) => {
    if (!activeWeek) return 0;
    return weeklyAdjustedGoal(metric, activeWeekIdx);
  };

  const weeklyBaseForActive = (metric: string) => weeklyBaseGoal(metric, activeWeekIdx);
  const weeklyCarryForActive = (metric: string) => {
    let carry = 0;
    for (let j = 0; j < activeWeekIdx; j++) {
      carry += weeklyRealized(metric, j) - weeklyBaseGoal(metric, j);
    }
    return carry;
  };

  const gd = weekData?.summary || { orcamento: { count: 0, value: 0 }, pedido: { count: 0, value: 0 }, faturamento: { count: 0, value: 0 } };
  const getProgressColor = (pct: number) => pct >= 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600";

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  }

  const sections = [
    { label: "Orçamentos", metric: "quotes_value", realized: gd.orcamento.value, count: gd.orcamento.count, color: "text-blue-600", borderColor: "border-l-blue-500", icon: <FileText className="h-4 w-4" /> },
    { label: "Pedidos", metric: "orders_value", realized: gd.pedido.value, count: gd.pedido.count, color: "text-green-600", borderColor: "border-l-green-500", icon: <ShoppingCart className="h-4 w-4" /> },
    { label: "Faturamento", metric: "billing_value", realized: gd.faturamento.value, count: gd.faturamento.count, color: "text-amber-600", borderColor: "border-l-amber-500", icon: <Receipt className="h-4 w-4" /> },
  ];

  // Chart with adjusted goals (carry-over from previous weeks)
  const chartData = allWeeksData?.map((w, i) => ({
    name: w.weekLabel,
    "Orçamentos": w.quotes_value,
    "Pedidos": w.orders_value,
    "Faturamento": w.billing_value,
    "Meta Orçamento": weeklyAdjustedGoal("quotes_value", i),
    "Meta Pedido": weeklyAdjustedGoal("orders_value", i),
    "Meta Faturamento": weeklyAdjustedGoal("billing_value", i),
    "Meta Base Orç": weeklyBaseGoal("quotes_value", i),
    "Meta Base Ped": weeklyBaseGoal("orders_value", i),
    "Meta Base Fat": weeklyBaseGoal("billing_value", i),
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Visão Semanal — {activeWeek?.label}</h2>
            <p className="text-sm text-muted-foreground">
              {activeWeek?.bizDays} dias úteis na semana • Meta proporcional ao período
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={`${selectedYear}-${selectedMonth}`} onValueChange={v => {
            const [y, m] = v.split("-").map(Number);
            setSelectedYear(y);
            setSelectedMonth(m);
            setSelectedWeekIdx(null);
          }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(activeWeekIdx)} onValueChange={v => setSelectedWeekIdx(Number(v))}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((w, i) => <SelectItem key={i} value={String(i)}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map(s => {
          const baseGoal = weeklyBaseForActive(s.metric);
          const carry = weeklyCarryForActive(s.metric);
          const goal = weeklyGoal(s.metric); // adjusted (with carry)
          const pct = goal > 0 ? (s.realized / goal) * 100 : 0;
          const remaining = goal - s.realized;
          const isMet = remaining <= 0 && goal > 0;
          const hasCarry = activeWeekIdx > 0 && Math.abs(carry) > 0.5;
          return (
            <Card key={s.metric} className={`border-l-4 ${s.borderColor}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">{s.icon} {s.label} — Semana</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {hasCarry && (
                  <div className={`text-xs rounded-md px-2 py-1 flex items-center justify-between ${carry >= 0 ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400"}`}>
                    <span className="font-medium">Transbordo semanal:</span>
                    <span className="font-bold">{carry >= 0 ? "+" : ""}{fmt(carry)}</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-muted/50 rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">Meta Sem.</p>
                    <p className="text-sm font-bold">{goal > 0 ? fmt(goal) : "—"}</p>
                    {hasCarry && baseGoal > 0 && (
                      <p className="text-[10px] text-muted-foreground">Base: {fmt(baseGoal)}</p>
                    )}
                  </div>
                  <div className={`rounded-lg p-2 ${isMet ? "bg-green-50 dark:bg-green-950" : "bg-muted/50"}`}>
                    <p className="text-xs text-muted-foreground">Realizado</p>
                    <p className={`text-sm font-bold ${goal > 0 ? getProgressColor(pct) : s.color}`}>{fmt(s.realized)}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${isMet ? "bg-green-50 dark:bg-green-950" : goal > 0 ? "bg-red-50 dark:bg-red-950" : "bg-muted/50"}`}>
                    <p className="text-xs text-muted-foreground">{isMet ? "Atingida ✅" : "Falta"}</p>
                    <p className={`text-sm font-bold ${isMet ? "text-green-600" : goal > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {goal > 0 ? (isMet ? "🎯" : fmt(remaining)) : "—"}
                    </p>
                  </div>
                </div>
                {goal > 0 && (
                  <div className="space-y-1">
                    <Progress value={Math.min(pct, 100)} className="h-2" />
                    <p className={`text-xs font-medium text-right ${getProgressColor(pct)}`}>{pct.toFixed(1)}%</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{s.count} registros na semana</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Funnel */}
      <SalesFunnelCard
        quotesValue={gd.orcamento.value}
        quotesCount={gd.orcamento.count}
        ordersValue={gd.pedido.value}
        ordersCount={gd.pedido.count}
        billingValue={gd.faturamento.value}
        billingCount={gd.faturamento.count}
        quotesGoal={weeklyGoal("quotes_value") || undefined}
        ordersGoal={weeklyGoal("orders_value") || undefined}
        billingGoal={weeklyGoal("billing_value") || undefined}
        title={`Funil de Vendas — ${activeWeek?.label || "Semana"}`}
      />

      {/* Table: all weeks summary */}
      {allWeeksData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Resumo por Semana</CardTitle>
            <CardDescription>Todas as semanas do mês de {format(new Date(selectedYear, selectedMonth, 1), "MMMM/yyyy", { locale: ptBR })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Semana</TableHead>
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
                  {allWeeksData.map((w, i) => (
                    <TableRow key={i} className={i === activeWeekIdx ? "bg-primary/5" : ""}>
                      <TableCell className="font-medium">{weeks[i]?.label || w.weekLabel}</TableCell>
                      <TableCell className="text-center text-blue-600">{w.quotes_count}</TableCell>
                      <TableCell className="text-right text-blue-600">{fmt(w.quotes_value)}</TableCell>
                      <TableCell className="text-center text-green-600">{w.orders_count}</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(w.orders_value)}</TableCell>
                      <TableCell className="text-center text-amber-600">{w.billing_count}</TableCell>
                      <TableCell className="text-right text-amber-600">{fmt(w.billing_value)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={w.quotes_count > 0 && (w.orders_count / w.quotes_count) >= 0.3 ? "default" : "secondary"}>
                          {w.quotes_count > 0 ? ((w.orders_count / w.quotes_count) * 100).toFixed(0) : 0}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total */}
                  {(() => {
                    const t = allWeeksData.reduce((acc, w) => ({
                      qv: acc.qv + w.quotes_value, qc: acc.qc + w.quotes_count,
                      ov: acc.ov + w.orders_value, oc: acc.oc + w.orders_count,
                      bv: acc.bv + w.billing_value, bc: acc.bc + w.billing_count,
                    }), { qv: 0, qc: 0, ov: 0, oc: 0, bv: 0, bc: 0 });
                    return (
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>Total Mês</TableCell>
                        <TableCell className="text-center text-blue-600">{t.qc}</TableCell>
                        <TableCell className="text-right text-blue-600">{fmt(t.qv)}</TableCell>
                        <TableCell className="text-center text-green-600">{t.oc}</TableCell>
                        <TableCell className="text-right text-green-600">{fmt(t.ov)}</TableCell>
                        <TableCell className="text-center text-amber-600">{t.bc}</TableCell>
                        <TableCell className="text-right text-amber-600">{fmt(t.bv)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{t.qc > 0 ? ((t.oc / t.qc) * 100).toFixed(0) : 0}%</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Evolução Semanal — Meta vs Realizado
            </CardTitle>
            <CardDescription>
              Barras: realizado por semana · Linhas tracejadas: <strong>meta ajustada com transbordo</strong> (saldo da semana anterior é somado/subtraído da meta da próxima)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="Orçamentos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="Pedidos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="Faturamento" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                <Line type="monotone" dataKey="Meta Orçamento" stroke="#3b82f6" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Meta Pedido" stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Meta Faturamento" stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Line Chart — evolução semanal em linha (similar ao mensal) */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Evolução Semanal — Linha do Tempo
            </CardTitle>
            <CardDescription>
              Visão fluida da evolução de orçamentos, pedidos e faturamento ao longo das semanas do mês
              {filterChannel !== "all" && ` · Canal: ${filterChannel}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Line type="monotone" dataKey="Orçamentos" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Pedidos" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Faturamento" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="Meta Orçamento" stroke="#3b82f6" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="Meta Pedido" stroke="#10b981" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="Meta Faturamento" stroke="#f59e0b" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
