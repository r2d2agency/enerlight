import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Circle, Clock, ArrowRight, AlertTriangle } from "lucide-react";
import { useCRMTasks, CRMTask } from "@/hooks/use-crm";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function TasksWidget() {
  const { data: tasks = [] } = useCRMTasks({ period: "week", status: "pending" });

  const sorted = [...tasks].sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return (
    <Card className="animate-fade-in shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            Tarefas Pendentes
          </CardTitle>
          {tasks.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{tasks.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {sorted.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma tarefa pendente</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[240px]">
            <div className="space-y-2 pr-2">
              {sorted.slice(0, 8).map((task) => {
                const overdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));
                const today = task.due_date && isToday(new Date(task.due_date));
                return (
                  <a
                    key={task.id}
                    href="/crm/tarefas"
                    className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors"
                  >
                    <Circle className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      overdue ? "text-destructive" : today ? "text-amber-500" : "text-muted-foreground"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.deal_title && (
                        <p className="text-xs text-muted-foreground truncate">{task.deal_title}</p>
                      )}
                    </div>
                    {task.due_date && (
                      <div className={cn(
                        "flex items-center gap-1 text-[10px] whitespace-nowrap mt-0.5",
                        overdue ? "text-destructive font-medium" : today ? "text-amber-500" : "text-muted-foreground"
                      )}>
                        {overdue && <AlertTriangle className="h-3 w-3" />}
                        {today ? <Clock className="h-3 w-3" /> : null}
                        {format(new Date(task.due_date), "dd/MM", { locale: ptBR })}
                      </div>
                    )}
                  </a>
                );
              })}
            </div>
          </ScrollArea>
        )}
        {tasks.length > 0 && (
          <a href="/crm/tarefas" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline mt-3 pt-2 border-t border-border">
            Ver todas <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
