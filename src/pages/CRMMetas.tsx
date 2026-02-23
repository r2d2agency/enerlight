import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { useGoals, useGoalDashboard, useGoalMutations, Goal } from "@/hooks/use-goals";
import { useCRMMyTeam } from "@/hooks/use-crm";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ComposedChart, ReferenceLine,
} from "recharts";
import {
  Target, Plus, Edit2, Trash2, Users, UserCheck, TrendingUp,
  Briefcase, DollarSign, UserPlus, RefreshCw, CalendarDays, Loader2, BarChart3,
} from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const METRICS = [
  { value: "new_deals", label: "Novos Negócios", icon: Briefcase },
  { value: "closed_deals", label: "Negócios Fechados", icon: TrendingUp },
  { value: "won_value", label: "Valor Ganho (R$)", icon: DollarSign },
  { value: "new_clients", label: "Clientes Novos", icon: UserPlus },
  { value: "recurring_clients", label: "Clientes Recorrentes", icon: RefreshCw },
];

const PERIODS = [
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
];

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

export default function CRMMetas() {
  const { user } = useAuth();
  const canManage = user?.role && ["owner", "admin", "manager"].includes(user.role);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Dashboard filters
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterUserId, setFilterUserId] = useState("all");
  const [filterGroupId, setFilterGroupId] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("monthly");

  const { data: goals, isLoading: loadingGoals } = useGoals();
  const { data: dashboard, isLoading: loadingDash } = useGoalDashboard({
    startDate,
    endDate,
    userId: filterUserId !== "all" ? filterUserId : undefined,
    groupId: filterGroupId !== "all" ? filterGroupId : undefined,
    period: filterPeriod,
  });
  const { data: teamMembers } = useCRMMyTeam();
  const { createGoal, updateGoal, deleteGoal } = useGoalMutations();

  // Form state
  const [form, setForm] = useState({
    name: "", type: "individual" as "individual" | "group",
    target_user_id: "", target_group_id: "",
    metric: "new_deals", target_value: "",
    period: "monthly", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "",
  });

  const openCreate = () => {
    setEditingGoal(null);
    setForm({ name: "", type: "individual", target_user_id: "", target_group_id: "", metric: "new_deals", target_value: "", period: "monthly", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "" });
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
    const data = {
      ...form,
      target_value: Number(form.target_value),
      period: form.period as "daily" | "weekly" | "monthly",
    };
    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, ...data }, { onSuccess: () => setFormOpen(false) });
    } else {
      createGoal.mutate(data as any, { onSuccess: () => setFormOpen(false) });
    }
  };

  const metricLabel = (m: string) => METRICS.find(x => x.value === m)?.label || m;

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return "text-green-600";
    if (pct >= 70) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6" />
              Metas de Vendas
            </h1>
            <p className="text-muted-foreground">Defina e acompanhe metas individuais e de grupo</p>
          </div>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Meta
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-2">
              <Target className="h-4 w-4" />
              Metas Cadastradas
            </TabsTrigger>
          </TabsList>

          {/* ========== DASHBOARD TAB ========== */}
          <TabsContent value="dashboard" className="mt-6 space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
              <span className="text-sm text-muted-foreground">até</span>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />

              <Select value={filterUserId} onValueChange={setFilterUserId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos usuários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos usuários</SelectItem>
                  {user && <SelectItem value={user.id}>{user.name} (Eu)</SelectItem>}
                  {teamMembers?.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loadingDash ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
            ) : dashboard ? (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Briefcase className="h-4 w-4" /> Novos Negócios
                      </div>
                      <p className="text-2xl font-bold">{dashboard.kpis.new_deals}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <TrendingUp className="h-4 w-4 text-green-500" /> Fechados
                      </div>
                      <p className="text-2xl font-bold text-green-600">{dashboard.kpis.closed_deals}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <DollarSign className="h-4 w-4 text-primary" /> Valor Ganho
                      </div>
                      <p className="text-2xl font-bold text-primary">{formatCurrency(dashboard.kpis.won_value)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <UserPlus className="h-4 w-4 text-blue-500" /> Clientes Novos
                      </div>
                      <p className="text-2xl font-bold text-blue-600">{dashboard.kpis.new_clients}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <RefreshCw className="h-4 w-4 text-purple-500" /> Recorrentes
                      </div>
                      <p className="text-2xl font-bold text-purple-600">{dashboard.kpis.recurring_clients}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Goal Progress Cards */}
                {dashboard.progress.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-lg font-semibold">Progresso das Metas</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {dashboard.progress.map(p => (
                        <Card key={p.goal_id}>
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
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className={getProgressColor(p.percentage)}>
                                  {p.metric === "won_value" ? formatCurrency(p.current_value) : p.current_value}
                                </span>
                                <span className="text-muted-foreground">
                                  / {p.metric === "won_value" ? formatCurrency(p.target_value) : p.target_value}
                                </span>
                              </div>
                              <Progress value={p.percentage} className="h-2" />
                              <p className={`text-xs font-medium text-right ${getProgressColor(p.percentage)}`}>
                                {p.percentage}%
                                {p.percentage >= 100 && " 🎯"}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline Chart */}
                {dashboard.timeline.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Evolução no Período</CardTitle>
                      <CardDescription>Novos negócios e fechamentos por período</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart data={dashboard.timeline}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="period" tick={{ fontSize: 12 }}
                            tickFormatter={v => {
                              try {
                                const d = new Date(v);
                                return format(d, filterPeriod === "daily" ? "dd/MM" : filterPeriod === "weekly" ? "dd/MM" : "MMM/yy", { locale: ptBR });
                              } catch { return v; }
                            }}
                          />
                          <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={v => formatCurrency(v)} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                            formatter={(value: number, name: string) => {
                              if (name === "won_value") return [formatCurrency(value), "Valor Ganho"];
                              return [value, name === "new_deals" ? "Novos" : "Fechados"];
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
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Nenhum dado disponível para o período selecionado</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ========== GOALS LIST TAB ========== */}
          <TabsContent value="goals" className="mt-6 space-y-4">
            {loadingGoals ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : !goals?.length ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">Nenhuma meta cadastrada</p>
                  <p className="text-sm mt-1">Crie metas para acompanhar o desempenho da equipe.</p>
                </CardContent>
              </Card>
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
                            <span>Meta: {g.metric === "won_value" ? formatCurrency(g.target_value) : g.target_value}</span>
                            {g.target_user_name && <span>👤 {g.target_user_name}</span>}
                            {g.target_group_name && <span>👥 {g.target_group_name}</span>}
                          </div>
                        </div>
                        {canManage && (
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
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Meta mensal de vendas" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="group">Grupo</SelectItem>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor da Meta *</Label>
                <Input type="number" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} placeholder="Ex: 10" />
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
          <DialogHeader>
            <DialogTitle>Excluir Meta</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta meta?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { deleteGoal.mutate(deleteConfirm!); setDeleteConfirm(null); }}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
