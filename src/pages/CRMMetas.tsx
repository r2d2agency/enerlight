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
  { value: "quotes_count", label: "Orçamentos (Qtd)", icon: FileText, group: "orcamento" },
  { value: "quotes_value", label: "Orçamentos (R$)", icon: FileText, group: "orcamento" },
  { value: "orders_count", label: "Pedidos (Qtd)", icon: ShoppingCart, group: "pedido" },
  { value: "orders_value", label: "Pedidos (R$)", icon: ShoppingCart, group: "pedido" },
  { value: "billing_count", label: "Faturamento (Qtd)", icon: Receipt, group: "faturamento" },
  { value: "billing_value", label: "Faturamento (R$)", icon: Receipt, group: "faturamento" },
  { value: "conversion_rate", label: "Taxa de Conversão (%)", icon: Target, group: "outros" },
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
  const [filterChannel, setFilterChannel] = useState("all");
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
    queryKey: ["crm-goals-data", startDate, endDate, filterUserId, filterChannel, filterGroupId],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("start_date", startDate);
      sp.set("end_date", endDate);
      if (filterUserId !== "all") sp.set("user_id", filterUserId);
      if (filterChannel !== "all") sp.set("channel", filterChannel);
      if (filterGroupId !== "all") sp.set("group_id", filterGroupId);
      return api<any>(`/api/crm/goals/data-summary?${sp.toString()}`);
    },
  });

  // Get available channels for filter
  const { data: availableChannels } = useQuery({
    queryKey: ["crm-goals-channels"],
    queryFn: () => api<string[]>("/api/crm/goals/channels"),
  });

  const invalidateData = () => {
    qc.invalidateQueries({ queryKey: ["crm-goals-data"] });
    qc.invalidateQueries({ queryKey: ["crm-goals-dashboard"] });
  };

  const [form, setForm] = useState({
    name: "", type: "individual" as "individual" | "group",
    target_user_id: "", target_group_id: "",
    metric: "quotes_count", target_value: "",
    period: "monthly", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "",
  });

  const openCreate = () => {
    setEditingGoal(null);
    setForm({ name: "", type: "individual", target_user_id: "", target_group_id: "", metric: "quotes_count", target_value: "", period: "monthly", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "" });
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
    const { start_date, end_date, ...rest } = form;
    const data = { ...rest, target_value: Number(rest.target_value), period: rest.period as any, start_date: format(new Date(), "yyyy-MM-dd") };
    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, ...data }, { onSuccess: () => setFormOpen(false) });
    } else {
      createGoal.mutate(data as any, { onSuccess: () => setFormOpen(false) });
    }
  };

  const metricLabel = (m: string) => METRICS.find(x => x.value === m)?.label || m;
  const isMoneyMetric = (m: string) => m.includes("_value") || m.includes("billing");
  const getProgressColor = (pct: number) => pct >= 100 ? "text-green-600" : pct >= 70 ? "text-amber-600" : "text-red-600";

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
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (!confirm("Tem certeza que deseja apagar TODOS os dados importados (Orçamentos, Pedidos e Faturamento)?")) return;
                  try {
                    await api("/api/crm/goals/import/clear-all", { method: "DELETE" });
                    invalidateData();
                    alert("Todos os dados importados foram apagados!");
                  } catch (e: any) { alert(e.message); }
                }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Limpar Tudo
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
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos canais" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos canais</SelectItem>
                {availableChannels?.map(ch => (
                  <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groups && groups.length > 0 && (
              <Select value={filterGroupId} onValueChange={setFilterGroupId}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos grupos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos grupos</SelectItem>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
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
            {!goalsData ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {/* KPI Summary Cards - ONLY from imported data */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><FileText className="h-4 w-4" /> Orçamentos</div>
                      <p className="text-2xl font-bold text-blue-600">{fmt(gd.orcamento.value)}</p>
                      <p className="text-xs text-muted-foreground">{gd.orcamento.count} orçamentos</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><ShoppingCart className="h-4 w-4" /> Pedidos</div>
                      <p className="text-2xl font-bold text-green-600">{fmt(gd.pedido.value)}</p>
                      <p className="text-xs text-muted-foreground">{gd.pedido.count} pedidos</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Receipt className="h-4 w-4" /> Faturamento</div>
                      <p className="text-2xl font-bold text-amber-600">{fmt(gd.faturamento.value)}</p>
                      <p className="text-xs text-muted-foreground">{gd.faturamento.count} notas</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-purple-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Target className="h-4 w-4" /> Conversão</div>
                      <p className="text-2xl font-bold text-purple-600">
                        {gd.orcamento.count > 0 ? ((gd.pedido.count / gd.orcamento.count) * 100).toFixed(0) : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">Pedidos / Orçamentos</p>
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
            )}
          </TabsContent>

          {/* ========== BY CHANNEL/GROUP ========== */}
          <TabsContent value="by-channel" className="mt-4 space-y-6">
            {(() => {
              const gdByChannel = goalsData?.byChannel || [];
              const channelMap: Record<string, { channel: string; quotes: number; quotes_value: number; orders: number; orders_value: number; billing_value: number }> = {};
              for (const row of gdByChannel) {
                const key = row.channel;
                if (!channelMap[key]) channelMap[key] = { channel: key, quotes: 0, quotes_value: 0, orders: 0, orders_value: 0, billing_value: 0 };
                if (row.data_type === 'orcamento') { channelMap[key].quotes += row.count; channelMap[key].quotes_value += row.total_value; }
                if (row.data_type === 'pedido') { channelMap[key].orders += row.count; channelMap[key].orders_value += row.total_value; }
                if (row.data_type === 'faturamento') { channelMap[key].billing_value += row.total_value; }
              }
              const channels = Object.values(channelMap).filter(c => c.quotes > 0 || c.orders > 0 || c.billing_value > 0);
              channels.sort((a, b) => b.billing_value - a.billing_value);

              return channels.length > 0 ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Resultados por Canal/Grupo</CardTitle>
                      <CardDescription>Dados das planilhas importadas por canal</CardDescription>
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
                            {channels.map(ch => (
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
                              <TableCell className="text-center text-blue-600">{channels.reduce((s, c) => s + c.quotes, 0)}</TableCell>
                              <TableCell className="text-right">{fmt(channels.reduce((s, c) => s + c.quotes_value, 0))}</TableCell>
                              <TableCell className="text-center text-green-600">{channels.reduce((s, c) => s + c.orders, 0)}</TableCell>
                              <TableCell className="text-right">{fmt(channels.reduce((s, c) => s + c.orders_value, 0))}</TableCell>
                              <TableCell className="text-right text-amber-600">{fmt(channels.reduce((s, c) => s + c.billing_value, 0))}</TableCell>
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
                        <BarChart data={channels} layout="vertical">
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
                  <p>Importe as planilhas de Orçamentos, Pedidos e Faturamento para visualizar.</p>
                </CardContent></Card>
              );
            })()}
          </TabsContent>

          {/* ========== INDIVIDUAL ========== */}
          <TabsContent value="individual" className="mt-4 space-y-6">
            {(() => {
              const gdBySeller = goalsData?.bySeller || [];
              const sellerMap: Record<string, { seller: string; quotes: number; quotes_value: number; orders: number; orders_value: number; billing_value: number }> = {};
              for (const row of gdBySeller) {
                const key = row.seller_name;
                if (!sellerMap[key]) sellerMap[key] = { seller: key, quotes: 0, quotes_value: 0, orders: 0, orders_value: 0, billing_value: 0 };
                if (row.data_type === 'orcamento') { sellerMap[key].quotes += row.count; sellerMap[key].quotes_value += row.total_value; }
                if (row.data_type === 'pedido') { sellerMap[key].orders += row.count; sellerMap[key].orders_value += row.total_value; }
                if (row.data_type === 'faturamento') { sellerMap[key].billing_value += row.total_value; }
              }
              const sellers = Object.values(sellerMap).filter(s => s.quotes > 0 || s.orders > 0 || s.billing_value > 0);
              sellers.sort((a, b) => b.billing_value - a.billing_value);

              return sellers.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> Ranking Individual</CardTitle>
                    <CardDescription>Orçamentos, Pedidos e Faturamento por vendedor (dados importados)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Vendedor</TableHead>
                            <TableHead className="text-center">Orçamentos</TableHead>
                            <TableHead className="text-right">Valor Orç.</TableHead>
                            <TableHead className="text-center">Pedidos</TableHead>
                            <TableHead className="text-right">Valor Ped.</TableHead>
                            <TableHead className="text-right">Faturamento</TableHead>
                            <TableHead className="text-center">Conversão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sellers.map((r, i) => (
                            <TableRow key={r.seller}>
                              <TableCell>
                                {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> :
                                 i === 1 ? <Medal className="h-4 w-4 text-gray-400" /> :
                                 i === 2 ? <Award className="h-4 w-4 text-amber-700" /> :
                                 <span className="text-muted-foreground">{i + 1}</span>}
                              </TableCell>
                              <TableCell className="font-medium">{r.seller}</TableCell>
                              <TableCell className="text-center text-blue-600 font-medium">{r.quotes}</TableCell>
                              <TableCell className="text-right text-sm">{fmt(r.quotes_value)}</TableCell>
                              <TableCell className="text-center text-green-600 font-medium">{r.orders}</TableCell>
                              <TableCell className="text-right text-sm">{fmt(r.orders_value)}</TableCell>
                              <TableCell className="text-right text-amber-600 font-medium">{fmt(r.billing_value)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant={r.quotes > 0 && (r.orders / r.quotes) >= 0.3 ? "default" : "secondary"}>
                                  {r.quotes > 0 ? ((r.orders / r.quotes) * 100).toFixed(0) : 0}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell />
                            <TableCell>Total</TableCell>
                            <TableCell className="text-center text-blue-600">{sellers.reduce((s, r) => s + r.quotes, 0)}</TableCell>
                            <TableCell className="text-right">{fmt(sellers.reduce((s, r) => s + r.quotes_value, 0))}</TableCell>
                            <TableCell className="text-center text-green-600">{sellers.reduce((s, r) => s + r.orders, 0)}</TableCell>
                            <TableCell className="text-right">{fmt(sellers.reduce((s, r) => s + r.orders_value, 0))}</TableCell>
                            <TableCell className="text-right text-amber-600">{fmt(sellers.reduce((s, r) => s + r.billing_value, 0))}</TableCell>
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
                  <p>Importe as planilhas para ver o ranking individual.</p>
                </CardContent></Card>
              );
            })()}
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
                    <div className="px-2 py-1 text-xs font-semibold text-blue-600">📄 Orçamentos</div>
                    {METRICS.filter(m => m.group === "orcamento").map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    <div className="px-2 py-1 text-xs font-semibold text-green-600 mt-1">🛒 Pedidos</div>
                    {METRICS.filter(m => m.group === "pedido").map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    <div className="px-2 py-1 text-xs font-semibold text-amber-600 mt-1">💰 Faturamento</div>
                    {METRICS.filter(m => m.group === "faturamento").map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-1">📊 Outros</div>
                    {METRICS.filter(m => m.group === "outros").map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
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
            <div className="space-y-2">
              <Label>Período da Meta</Label>
              <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diária</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
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
