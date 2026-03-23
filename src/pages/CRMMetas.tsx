import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useGoals, useGoalDashboard, useGoalMutations, Goal } from "@/hooks/use-goals";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCRMMyTeam, useCRMGroups } from "@/hooks/use-crm";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { GoalsImportDialog } from "@/components/crm/GoalsImportDialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ComposedChart, Line,
} from "recharts";
import {
  Target, Plus, Edit2, Trash2, Users, TrendingUp, Upload,
  Briefcase, DollarSign, CalendarDays, Loader2, BarChart3,
  Trophy, Medal, Award, FileText, ShoppingCart, Receipt,
} from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const METRICS = [
  { value: "new_deals", label: "Novos Negócios", icon: Briefcase },
  { value: "closed_deals", label: "Negócios Fechados", icon: TrendingUp },
  { value: "won_value", label: "Valor Ganho (R$)", icon: DollarSign },
  { value: "quotes_total", label: "Orçamentos (Total)", icon: FileText },
  { value: "quotes_by_channel", label: "Orçamentos por Canal", icon: FileText },
  { value: "orders_total", label: "Pedidos (Total)", icon: ShoppingCart },
  { value: "orders_by_channel", label: "Pedidos por Canal", icon: ShoppingCart },
  { value: "billing_total", label: "Faturamento (Total R$)", icon: Receipt },
  { value: "billing_by_channel", label: "Faturamento por Canal (R$)", icon: Receipt },
  { value: "conversion_rate", label: "Taxa de Conversão (%)", icon: Target },
];

const PERIODS = [
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

export default function CRMMetas() {
  const { user } = useAuth();
  const isAdmin = user?.role && ["owner", "admin", "manager"].includes(user.role);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [importType, setImportType] = useState<"orcamento" | "pedido" | "faturamento" | null>(null);

  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterUserId, setFilterUserId] = useState("all");
  const [filterGroupId, setFilterGroupId] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("monthly");
  const [rankingGroupId, setRankingGroupId] = useState("all");

  const qc = useQueryClient();
  const { data: goals, isLoading: loadingGoals } = useGoals();
  const { data: dashboard, isLoading: loadingDash } = useGoalDashboard({
    startDate, endDate,
    userId: filterUserId !== "all" ? filterUserId : undefined,
    groupId: filterGroupId !== "all" ? filterGroupId : undefined,
    period: filterPeriod,
    rankingGroupId: rankingGroupId !== "all" ? rankingGroupId : undefined,
  });
  const { data: teamMembers } = useCRMMyTeam();
  const { data: groups } = useCRMGroups();
  const { createGoal, updateGoal, deleteGoal } = useGoalMutations();

  // Goals data summary from imported spreadsheets
  const { data: goalsData } = useQuery({
    queryKey: ["crm-goals-data", startDate, endDate, filterUserId],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("start_date", startDate);
      sp.set("end_date", endDate);
      if (filterUserId !== "all") sp.set("user_id", filterUserId);
      return api<any>(`/api/crm/goals/data-summary?${sp.toString()}`);
    },
  });

  const invalidateData = () => {
    qc.invalidateQueries({ queryKey: ["crm-goals-data"] });
    qc.invalidateQueries({ queryKey: ["crm-goals-dashboard"] });
  };

  const [form, setForm] = useState({
    name: "", type: "individual" as "individual" | "group",
    target_user_id: "", target_group_id: "",
    metric: "quotes_total", target_value: "",
    period: "monthly", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "",
  });

  const openCreate = () => {
    setEditingGoal(null);
    setForm({ name: "", type: "individual", target_user_id: "", target_group_id: "", metric: "quotes_total", target_value: "", period: "monthly", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "" });
    setFormOpen(true);
  };

  const openEdit = (g: Goal) => {
    setEditingGoal(g);
    setForm({
      name: g.name, type: g.type, target_user_id: g.target_user_id || "",
      target_group_id: g.target_group_id || "", metric: g.metric,
      target_value: String(g.target_value), period: g.period,
      start_date: g.start_date?.split("T")[0] || "", end_date: g.end_date?.split("T")[0] || "",
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.target_value) return;
    const data = { ...form, target_value: Number(form.target_value), period: form.period as any };
    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, ...data }, { onSuccess: () => setFormOpen(false) });
    } else {
      createGoal.mutate(data as any, { onSuccess: () => setFormOpen(false) });
    }
  };

  const metricLabel = (m: string) => METRICS.find(x => x.value === m)?.label || m;
  const isMoneyMetric = (m: string) => m.includes("value") || m.includes("billing");
  const getProgressColor = (pct: number) => pct >= 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600";

  const kpis = dashboard?.kpis as any;
  const byChannel = (dashboard as any)?.byChannel || [];
  const gd = goalsData?.summary || { orcamento: { count: 0, value: 0 }, pedido: { count: 0, value: 0 }, faturamento: { count: 0, value: 0 } };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6" /> Metas & Relatórios de Vendas
            </h1>
            <p className="text-muted-foreground">Orçamentos, Pedidos e Faturamento — Meta vs Realizado</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportType("orcamento")}>
                  <Upload className="h-4 w-4 mr-1" /><FileText className="h-4 w-4 mr-1 text-blue-500" /> Orçamentos
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportType("pedido")}>
                  <Upload className="h-4 w-4 mr-1" /><ShoppingCart className="h-4 w-4 mr-1 text-green-500" /> Pedidos
                </Button>
                <Button variant="outline" size="sm" onClick={() => setImportType("faturamento")}>
                  <Upload className="h-4 w-4 mr-1" /><Receipt className="h-4 w-4 mr-1 text-amber-500" /> Faturamento
                </Button>
                <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Meta</Button>
              </>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-2"><BarChart3 className="h-4 w-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="by-channel" className="gap-2"><Users className="h-4 w-4" /> Por Canal/Grupo</TabsTrigger>
            <TabsTrigger value="individual" className="gap-2"><Trophy className="h-4 w-4" /> Individual</TabsTrigger>
            <TabsTrigger value="goals" className="gap-2"><Target className="h-4 w-4" /> Metas</TabsTrigger>
          </TabsList>

          {/* Filters - shared */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
            <span className="text-sm text-muted-foreground">até</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos usuários</SelectItem>
                {user && <SelectItem value={user.id}>{user.name} (Eu)</SelectItem>}
                {teamMembers?.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ========== DASHBOARD ========== */}
          <TabsContent value="dashboard" className="mt-4 space-y-6">
            {loadingDash ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : kpis ? (
              <>
                {/* KPI Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><FileText className="h-4 w-4" /> Orçamentos</div>
                      <p className="text-2xl font-bold text-blue-600">{gd.orcamento.count || kpis.quotes || 0}</p>
                      <p className="text-xs text-muted-foreground">{fmt(gd.orcamento.value || kpis.quotes_value || 0)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><ShoppingCart className="h-4 w-4" /> Pedidos</div>
                      <p className="text-2xl font-bold text-green-600">{gd.pedido.count || kpis.orders || 0}</p>
                      <p className="text-xs text-muted-foreground">{fmt(gd.pedido.value || kpis.orders_value || 0)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Receipt className="h-4 w-4" /> Faturamento</div>
                      <p className="text-2xl font-bold text-amber-600">{fmt(gd.faturamento.value || kpis.billing_total || 0)}</p>
                      <p className="text-xs text-muted-foreground">{gd.faturamento.count || kpis.billing_orders || 0} notas</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-purple-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Target className="h-4 w-4" /> Conversão</div>
                      <p className="text-2xl font-bold text-purple-600">
                        {(gd.orcamento.count || kpis.quotes) > 0 
                          ? (((gd.pedido.count || kpis.orders) / (gd.orcamento.count || kpis.quotes)) * 100).toFixed(0) 
                          : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">Pedidos / Orçamentos</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Briefcase className="h-4 w-4" /> Negócios</div>
                      <p className="text-2xl font-bold">{kpis.new_deals}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><DollarSign className="h-4 w-4" /> Valor Ganho</div>
                      <p className="text-2xl font-bold">{fmt(kpis.won_value)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Goal Progress: Meta vs Realizado */}
                {dashboard?.progress && dashboard.progress.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2"><Target className="h-5 w-5" /> Meta vs Realizado</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {dashboard.progress.map(p => (
                        <Card key={p.goal_id} className={p.percentage >= 100 ? "ring-2 ring-green-500/30" : ""}>
                          <CardContent className="pt-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">{p.goal_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {metricLabel(p.metric)} • {p.type === "individual" ? p.target_user_name : p.target_group_name}
                                </p>
                              </div>
                              <Badge variant={p.percentage >= 100 ? "default" : "secondary"}>
                                {p.period === "daily" ? "Diária" : p.period === "weekly" ? "Semanal" : "Mensal"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-center">
                              <div className="bg-muted/50 rounded-lg p-2">
                                <p className="text-xs text-muted-foreground">Meta</p>
                                <p className="text-sm font-bold">{isMoneyMetric(p.metric) ? fmt(p.target_value) : p.target_value}</p>
                              </div>
                              <div className={`rounded-lg p-2 ${p.percentage >= 100 ? "bg-green-50 dark:bg-green-950" : "bg-muted/50"}`}>
                                <p className="text-xs text-muted-foreground">Realizado</p>
                                <p className={`text-sm font-bold ${getProgressColor(p.percentage)}`}>
                                  {isMoneyMetric(p.metric) ? fmt(p.current_value) : p.current_value}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Progress value={Math.min(p.percentage, 100)} className="h-2" />
                              <p className={`text-xs font-medium text-right ${getProgressColor(p.percentage)}`}>
                                {p.percentage}% {p.percentage >= 100 && "🎯"}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline Chart */}
                {dashboard?.timeline && dashboard.timeline.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Evolução no Período</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={dashboard.timeline}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="period" tick={{ fontSize: 12 }}
                            tickFormatter={v => {
                              try { return format(new Date(v), filterPeriod === "monthly" ? "MMM/yy" : "dd/MM", { locale: ptBR }); }
                              catch { return v; }
                            }}
                          />
                          <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => fmt(v)} />
                          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                            formatter={(value: number, name: string) => {
                              if (name === "Valor Ganho") return [fmt(value), name];
                              return [value, name];
                            }}
                          />
                          <Legend />
                          <Bar yAxisId="left" dataKey="new_deals" name="Novos" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                          <Bar yAxisId="left" dataKey="closed_deals" name="Fechados" fill="#22c55e" radius={[4,4,0,0]} />
                          <Line yAxisId="right" type="monotone" dataKey="won_value" name="Valor Ganho" stroke="#f59e0b" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nenhum dado disponível para o período selecionado</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ========== BY CHANNEL/GROUP ========== */}
          <TabsContent value="by-channel" className="mt-4 space-y-6">
            {loadingDash ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (() => {
              // Merge imported data by channel
              const gdByChannel = goalsData?.byChannel || [];
              const channelMap: Record<string, { channel: string; quotes: number; quotes_value: number; orders: number; orders_value: number; billing_value: number }> = {};
              
              // Add CRM data
              for (const ch of byChannel) {
                channelMap[ch.channel] = { ...ch };
              }
              
              // Add/merge imported data
              for (const row of gdByChannel) {
                const key = row.channel;
                if (!channelMap[key]) channelMap[key] = { channel: key, quotes: 0, quotes_value: 0, orders: 0, orders_value: 0, billing_value: 0 };
                if (row.data_type === 'orcamento') { channelMap[key].quotes += row.count; channelMap[key].quotes_value += row.total_value; }
                if (row.data_type === 'pedido') { channelMap[key].orders += row.count; channelMap[key].orders_value += row.total_value; }
                if (row.data_type === 'faturamento') { channelMap[key].billing_value += row.total_value; }
              }
              
              const mergedChannels = Object.values(channelMap).filter(c => c.quotes > 0 || c.orders > 0 || c.billing_value > 0);
              mergedChannels.sort((a, b) => b.billing_value - a.billing_value);
              
              return mergedChannels.length > 0 ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Resultados por Canal/Grupo</CardTitle>
                    <CardDescription>Orçamentos, Pedidos e Faturamento por canal de venda</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Canal</TableHead>
                            <TableHead className="text-center">Orçamentos</TableHead>
                            <TableHead className="text-right">Valor Orç.</TableHead>
                            <TableHead className="text-center">Pedidos</TableHead>
                            <TableHead className="text-right">Valor Ped.</TableHead>
                            <TableHead className="text-right">Faturamento</TableHead>
                            <TableHead className="text-center">Conversão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mergedChannels.map(ch => (
                            <TableRow key={ch.channel}>
                              <TableCell className="font-medium">{ch.channel}</TableCell>
                              <TableCell className="text-center text-blue-600 font-medium">{ch.quotes}</TableCell>
                              <TableCell className="text-right text-sm">{fmt(ch.quotes_value)}</TableCell>
                              <TableCell className="text-center text-green-600 font-medium">{ch.orders}</TableCell>
                              <TableCell className="text-right text-sm">{fmt(ch.orders_value)}</TableCell>
                              <TableCell className="text-right text-amber-600 font-medium">{fmt(ch.billing_value)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={ch.quotes > 0 && (ch.orders / ch.quotes) >= 0.3 ? "default" : "secondary"}>
                                  {ch.quotes > 0 ? ((ch.orders / ch.quotes) * 100).toFixed(0) : 0}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-center text-blue-600">{mergedChannels.reduce((s, c) => s + c.quotes, 0)}</TableCell>
                            <TableCell className="text-right">{fmt(mergedChannels.reduce((s, c) => s + c.quotes_value, 0))}</TableCell>
                            <TableCell className="text-center text-green-600">{mergedChannels.reduce((s, c) => s + c.orders, 0)}</TableCell>
                            <TableCell className="text-right">{fmt(mergedChannels.reduce((s, c) => s + c.orders_value, 0))}</TableCell>
                            <TableCell className="text-right text-amber-600">{fmt(mergedChannels.reduce((s, c) => s + c.billing_value, 0))}</TableCell>
                            <TableCell className="text-center">—</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Comparativo por Canal</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={mergedChannels} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tickFormatter={v => fmt(v)} />
                        <YAxis dataKey="channel" type="category" width={120} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Legend />
                        <Bar dataKey="quotes_value" name="Orçamentos" fill="#3b82f6" radius={[0,4,4,0]} />
                        <Bar dataKey="orders_value" name="Pedidos" fill="#22c55e" radius={[0,4,4,0]} />
                        <Bar dataKey="billing_value" name="Faturamento" fill="#f59e0b" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nenhum dado por canal disponível</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ========== INDIVIDUAL ========== */}
          <TabsContent value="individual" className="mt-4 space-y-6">
            {loadingDash ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : dashboard?.ranking && dashboard.ranking.length > 0 ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> Ranking Individual</CardTitle>
                      <CardDescription>Desempenho de Orçamentos, Pedidos e Faturamento por vendedor</CardDescription>
                    </div>
                    <Select value={rankingGroupId} onValueChange={setRankingGroupId}>
                      <SelectTrigger className="w-[200px]"><Users className="h-4 w-4 mr-2" /><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os grupos</SelectItem>
                        {groups?.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-center">Orçamentos</TableHead>
                          <TableHead className="text-center">Pedidos</TableHead>
                          <TableHead className="text-right">Valor Pedidos</TableHead>
                          <TableHead className="text-right">Faturamento</TableHead>
                          <TableHead className="text-center">Conversão</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(dashboard.ranking as any[]).map((r: any, i) => (
                          <TableRow key={r.user_id}>
                            <TableCell>
                              {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> :
                               i === 1 ? <Medal className="h-4 w-4 text-gray-400" /> :
                               i === 2 ? <Award className="h-4 w-4 text-amber-700" /> :
                               <span className="text-muted-foreground">{i + 1}</span>}
                            </TableCell>
                            <TableCell className="font-medium">{r.user_name}</TableCell>
                            <TableCell className="text-center text-blue-600 font-medium">{r.quote_count || 0}</TableCell>
                            <TableCell className="text-center text-green-600 font-medium">{r.order_count || 0}</TableCell>
                            <TableCell className="text-right text-sm">{fmt(r.order_value || 0)}</TableCell>
                            <TableCell className="text-right text-amber-600 font-medium">{fmt(r.billing_value || 0)}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={(r.quote_count || 0) > 0 && ((r.order_count || 0) / (r.quote_count || 1)) >= 0.3 ? "default" : "secondary"}>
                                {(r.quote_count || 0) > 0 ? (((r.order_count || 0) / (r.quote_count || 1)) * 100).toFixed(0) : 0}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell />
                          <TableCell>Total</TableCell>
                          <TableCell className="text-center text-blue-600">{(dashboard.ranking as any[]).reduce((s, r: any) => s + (r.quote_count || 0), 0)}</TableCell>
                          <TableCell className="text-center text-green-600">{(dashboard.ranking as any[]).reduce((s, r: any) => s + (r.order_count || 0), 0)}</TableCell>
                          <TableCell className="text-right">{fmt((dashboard.ranking as any[]).reduce((s, r: any) => s + (r.order_value || 0), 0))}</TableCell>
                          <TableCell className="text-right text-amber-600">{fmt((dashboard.ranking as any[]).reduce((s, r: any) => s + (r.billing_value || 0), 0))}</TableCell>
                          <TableCell className="text-center">—</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nenhum dado individual disponível</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ========== GOALS LIST ========== */}
          <TabsContent value="goals" className="mt-4 space-y-4">
            {loadingGoals ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : !goals?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">Nenhuma meta cadastrada</p>
                <p className="text-sm mt-1">Crie metas de Orçamentos, Pedidos e Faturamento para a equipe.</p>
              </CardContent></Card>
            ) : (
              <div className="grid gap-3">
                {goals.map(g => (
                  <Card key={g.id} className={!g.is_active ? "opacity-60" : ""}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{g.name}</p>
                            <Badge variant={g.type === "individual" ? "default" : "secondary"}>
                              {g.type === "individual" ? "Individual" : "Grupo"}
                            </Badge>
                            <Badge variant="outline">{metricLabel(g.metric)}</Badge>
                            <Badge variant="outline">
                              {g.period === "daily" ? "Diária" : g.period === "weekly" ? "Semanal" : "Mensal"}
                            </Badge>
                            {!g.is_active && <Badge variant="destructive">Inativa</Badge>}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span>Meta: {isMoneyMetric(g.metric) ? fmt(g.target_value) : g.target_value}</span>
                            {g.target_user_name && <span>👤 {g.target_user_name}</span>}
                            {g.target_group_name && <span>👥 {g.target_group_name}</span>}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1 ml-4">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(g)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteConfirm(g.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Editar Meta" : "Nova Meta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Meta *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Meta de Orçamentos Março" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="group">Grupo/Canal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Métrica</Label>
                <Select value={form.metric} onValueChange={v => setForm(f => ({ ...f, metric: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRICS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type === "individual" && (
              <div className="space-y-2">
                <Label>Usuário</Label>
                <Select value={form.target_user_id} onValueChange={v => setForm(f => ({ ...f, target_user_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {user && <SelectItem value={user.id}>{user.name} (Eu)</SelectItem>}
                    {teamMembers?.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.type === "group" && (
              <div className="space-y-2">
                <Label>Grupo/Canal *</Label>
                <Select value={form.target_group_id} onValueChange={v => setForm(f => ({ ...f, target_group_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o grupo..." /></SelectTrigger>
                  <SelectContent>
                    {groups?.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor da Meta *</Label>
                <Input type="number" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} placeholder="Ex: 50" />
              </div>
              <div className="space-y-2">
                <Label>Período</Label>
                <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Início</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Data Fim (opcional)</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createGoal.isPending || updateGoal.isPending}>
              {(createGoal.isPending || updateGoal.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingGoal ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Excluir Meta</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta meta?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { deleteGoal.mutate(deleteConfirm!); setDeleteConfirm(null); }}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialogs */}
      {importType && (
        <GoalsImportDialog
          open={!!importType}
          onOpenChange={v => { if (!v) setImportType(null); }}
          dataType={importType}
          onSuccess={invalidateData}
        />
      )}
    </MainLayout>
  );
}
