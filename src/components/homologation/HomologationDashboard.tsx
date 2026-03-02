import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Building2, ClipboardList, Users, Clock, CheckCircle2,
  AlertTriangle, TrendingUp, BarChart3, Timer
} from "lucide-react";
import { HomologationCompany, HomologationStage } from "@/hooks/use-homologation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface Props {
  companies: HomologationCompany[];
  stages: HomologationStage[];
  orgMembers: { id: string; name: string }[];
}

export function HomologationDashboard({ companies, stages, orgMembers }: Props) {
  const now = new Date();

  const stats = useMemo(() => {
    const totalCompanies = companies.length;
    const totalTasks = companies.reduce((s, c) => s + (c.task_count || 0), 0);
    const completedTasks = companies.reduce((s, c) => s + (c.completed_task_count || 0), 0);
    const pendingTasks = totalTasks - completedTasks;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Companies per stage
    const perStage = stages.map(s => ({
      name: s.name,
      color: s.color,
      count: companies.filter(c => c.stage_id === s.id).length,
    }));

    // Per user
    const userMap: Record<string, { name: string; companies: number; tasks: number; completedTasks: number }> = {};
    companies.forEach(c => {
      const uid = c.assigned_to || "unassigned";
      const uname = c.assigned_to_name || "Não atribuído";
      if (!userMap[uid]) userMap[uid] = { name: uname, companies: 0, tasks: 0, completedTasks: 0 };
      userMap[uid].companies++;
      userMap[uid].tasks += c.task_count || 0;
      userMap[uid].completedTasks += c.completed_task_count || 0;
    });
    const perUser = Object.values(userMap).sort((a, b) => b.companies - a.companies);

    // Time in stage (days since created_at for each company)
    const avgTimePerStage = stages.map(s => {
      const stageCompanies = companies.filter(c => c.stage_id === s.id);
      if (stageCompanies.length === 0) return { name: s.name, color: s.color, avgDays: 0 };
      const totalDays = stageCompanies.reduce((sum, c) => {
        const created = new Date(c.updated_at || c.created_at);
        const diff = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return sum + diff;
      }, 0);
      return { name: s.name, color: s.color, avgDays: Math.round(totalDays / stageCompanies.length) };
    });

    // Recent (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = companies.filter(c => new Date(c.created_at) >= sevenDaysAgo).length;

    // Completed (in final stage)
    const finalStageIds = stages.filter(s => s.is_final).map(s => s.id);
    const completedCompanies = companies.filter(c => c.stage_id && finalStageIds.includes(c.stage_id)).length;

    // Overdue tasks (approximation - companies with tasks where completed < total)
    const companiesWithOverdue = companies.filter(c => 
      c.task_count > 0 && c.completed_task_count < c.task_count
    ).length;

    return {
      totalCompanies, totalTasks, completedTasks, pendingTasks, completionRate,
      perStage, perUser, avgTimePerStage, newThisWeek, completedCompanies, companiesWithOverdue,
    };
  }, [companies, stages, now]);

  const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

  return (
    <div className="p-4 space-y-6 overflow-y-auto">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.totalCompanies}</p>
              <p className="text-xs text-muted-foreground">Total Empresas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10"><TrendingUp className="h-5 w-5 text-green-500" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.newThisWeek}</p>
              <p className="text-xs text-muted-foreground">Novos (7 dias)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><ClipboardList className="h-5 w-5 text-amber-500" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.completedTasks}/{stats.totalTasks}</p>
              <p className="text-xs text-muted-foreground">Tarefas Concluídas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="h-5 w-5 text-destructive" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.companiesWithOverdue}</p>
              <p className="text-xs text-muted-foreground">Com Tarefas Pendentes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-600/10"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.completedCompanies}</p>
              <p className="text-xs text-muted-foreground">Finalizados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Taxa de Conclusão</p>
            <div className="flex items-center gap-2">
              <Progress value={stats.completionRate} className="flex-1 h-2" />
              <span className="text-sm font-bold">{stats.completionRate}%</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10"><Users className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.perUser.length}</p>
              <p className="text-xs text-muted-foreground">Responsáveis Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10"><BarChart3 className="h-5 w-5 text-purple-500" /></div>
            <div>
              <p className="text-2xl font-bold">{stats.pendingTasks}</p>
              <p className="text-xs text-muted-foreground">Tarefas Pendentes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Companies per stage chart */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Empresas por Fase</CardTitle></CardHeader>
          <CardContent>
            {stats.perStage.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.perStage}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Empresas" radius={[4, 4, 0, 0]}>
                    {stats.perStage.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>

        {/* Avg time per stage */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Timer className="h-4 w-4" /> Tempo Médio por Fase (dias)</CardTitle></CardHeader>
          <CardContent>
            {stats.avgTimePerStage.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.avgTimePerStage}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avgDays" name="Dias" radius={[4, 4, 0, 0]}>
                    {stats.avgTimePerStage.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per user table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Desempenho por Responsável</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Responsável</th>
                  <th className="text-center py-2 font-medium">Empresas</th>
                  <th className="text-center py-2 font-medium">Tarefas</th>
                  <th className="text-center py-2 font-medium">Concluídas</th>
                  <th className="text-center py-2 font-medium">Pendentes</th>
                  <th className="text-center py-2 font-medium">% Conclusão</th>
                </tr>
              </thead>
              <tbody>
                {stats.perUser.map((u, i) => {
                  const pct = u.tasks > 0 ? Math.round((u.completedTasks / u.tasks) * 100) : 0;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 font-medium">{u.name}</td>
                      <td className="text-center">{u.companies}</td>
                      <td className="text-center">{u.tasks}</td>
                      <td className="text-center text-green-600">{u.completedTasks}</td>
                      <td className="text-center text-amber-600">{u.tasks - u.completedTasks}</td>
                      <td className="text-center">
                        <Badge variant={pct >= 80 ? "default" : pct >= 50 ? "secondary" : "destructive"} className="text-[10px]">
                          {pct}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {stats.perUser.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">Sem dados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
