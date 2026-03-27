import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FolderKanban, Clock, Calendar, AlertTriangle, CheckCircle, User, TrendingUp, Timer
} from "lucide-react";
import { Project, ProjectStage } from "@/hooks/use-projects";
import { differenceInDays, differenceInBusinessDays, parseISO } from "date-fns";

interface Props {
  projects: Project[];
  stages: ProjectStage[];
}

export function ProjectsDashboard({ projects, stages }: Props) {
  const stats = useMemo(() => {
    const now = new Date();
    const total = projects.length;

    // By priority
    const urgent = projects.filter(p => p.priority === "urgent").length;
    const high = projects.filter(p => p.priority === "high").length;

    // Completed (final stage)
    const finalStageIds = stages.filter(s => s.is_final).map(s => s.id);
    const completed = projects.filter(p => p.stage_id && finalStageIds.includes(p.stage_id));
    const completedCount = completed.length;
    const inProgress = total - completedCount;

    // Overdue (has due_date in the past and not completed)
    const overdue = projects.filter(p => {
      if (!p.due_date) return false;
      if (p.stage_id && finalStageIds.includes(p.stage_id)) return false;
      return new Date(p.due_date) < now;
    }).length;

    // Avg duration for completed projects (created_at -> updated_at)
    const durations = completed
      .map(p => differenceInDays(parseISO(p.updated_at), parseISO(p.created_at)))
      .filter(d => d >= 0);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    // Avg time to deadline for active projects
    const activeWithDeadline = projects.filter(p => {
      if (!p.due_date) return false;
      if (p.stage_id && finalStageIds.includes(p.stage_id)) return false;
      return true;
    });
    const avgDaysToDeadline = activeWithDeadline.length > 0
      ? Math.round(activeWithDeadline.map(p => differenceInDays(parseISO(p.due_date!), now)).reduce((a, b) => a + b, 0) / activeWithDeadline.length)
      : null;

    // Tasks progress
    const totalTasks = projects.reduce((s, p) => s + (p.total_tasks || 0), 0);
    const completedTasks = projects.reduce((s, p) => s + (p.completed_tasks || 0), 0);
    const taskPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // By stage
    const byStage = stages.map(s => ({
      ...s,
      count: projects.filter(p => p.stage_id === s.id).length,
    }));

    // Top sellers (most projects requested/assigned)
    const sellerMap: Record<string, { name: string; count: number }> = {};
    projects.forEach(p => {
      if (p.seller_id && p.seller_name) {
        if (!sellerMap[p.seller_id]) sellerMap[p.seller_id] = { name: p.seller_name, count: 0 };
        sellerMap[p.seller_id].count++;
      }
    });
    const topSellers = Object.values(sellerMap).sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      total, inProgress, completedCount, overdue, urgent, high,
      avgDuration, avgDaysToDeadline,
      totalTasks, completedTasks, taskPercent,
      byStage, topSellers,
    };
  }, [projects, stages]);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={FolderKanban} label="Total" value={stats.total} color="text-primary" />
        <StatCard icon={TrendingUp} label="Em andamento" value={stats.inProgress} color="text-blue-500" />
        <StatCard icon={CheckCircle} label="Concluídos" value={stats.completedCount} color="text-green-500" />
        <StatCard icon={AlertTriangle} label="Atrasados" value={stats.overdue} color="text-destructive" />
        <StatCard icon={Timer} label="Duração média" value={`${stats.avgDuration}d`} color="text-amber-500" />
        <StatCard
          icon={Clock}
          label="Média p/ prazo"
          value={stats.avgDaysToDeadline !== null ? `${stats.avgDaysToDeadline}d` : "—"}
          color="text-indigo-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* By Stage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Por Etapa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.byStage.map(s => (
              <div key={s.id} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm flex-1 truncate">{s.name}</span>
                <Badge variant="secondary" className="text-xs">{s.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Tasks Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Progresso de Tarefas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center">
              <span className="text-3xl font-bold text-foreground">{stats.taskPercent}%</span>
              <p className="text-xs text-muted-foreground mt-1">{stats.completedTasks} de {stats.totalTasks} tarefas concluídas</p>
            </div>
            <Progress value={stats.taskPercent} className="h-2" />
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div>
                <p className="font-semibold text-foreground">{stats.urgent}</p>
                <p className="text-muted-foreground">Urgentes</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">{stats.high}</p>
                <p className="text-muted-foreground">Alta prioridade</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Sellers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Vendedores que mais solicitaram</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topSellers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum vendedor vinculado</p>
            ) : (
              <div className="space-y-2">
                {stats.topSellers.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm flex-1 truncate">{s.name}</span>
                    <Badge variant="outline" className="text-xs">{s.count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex flex-col items-center text-center gap-1">
        <Icon className={`h-5 w-5 ${color}`} />
        <span className="text-xl font-bold text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
      </CardContent>
    </Card>
  );
}
