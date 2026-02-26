import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Plus, Circle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { useTopicTasks, useCreateTopicTask, type TopicTask } from "@/hooks/use-internal-chat";
import { useOrgMembers } from "@/hooks/use-internal-chat";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  topicId: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Circle className="h-3 w-3 text-muted-foreground" />,
  in_progress: <Clock className="h-3 w-3 text-amber-500" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-500" />,
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em progresso",
  completed: "Concluída",
};

export function TopicTasksPanel({ topicId }: Props) {
  const { data: tasks = [], isLoading } = useTopicTasks(topicId);
  const createTask = useCreateTopicTask();
  const { data: orgMembers = [] } = useOrgMembers();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("medium");

  const completedCount = tasks.filter(t => t.status === "completed").length;

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      await createTask.mutateAsync({
        topicId,
        title,
        assigned_to: assignedTo || undefined,
        priority,
      });
      setShowCreate(false);
      setTitle("");
      setAssignedTo("");
      setPriority("medium");
      toast.success("Tarefa criada e vinculada!");
    } catch {
      toast.error("Erro ao criar tarefa");
    }
  };

  if (isLoading) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {tasks.length > 0 && (
          <Badge variant="outline" className="gap-1 text-xs bg-blue-500/10 text-blue-600 border-blue-200">
            <CheckSquare className="h-3 w-3" />
            {completedCount}/{tasks.length} tarefas
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-3 w-3" />
          Tarefa
        </Button>
      </div>

      {/* Expanded task list (show inline when tasks exist) */}
      {tasks.length > 0 && (
        <div className="mt-2 space-y-1">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-muted/50">
              {statusIcons[task.status] || statusIcons.pending}
              <span className={cn(
                "flex-1 truncate",
                task.status === "completed" && "line-through text-muted-foreground"
              )}>
                {task.title}
              </span>
              {task.assigned_to_name && (
                <span className="text-muted-foreground shrink-0">{task.assigned_to_name}</span>
              )}
              <Badge variant="outline" className="text-[10px] px-1">
                {statusLabels[task.status] || task.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Nova Tarefa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Descreva a tarefa..."
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Responsável</label>
                <Select value={assignedTo || "none"} onValueChange={v => setAssignedTo(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Eu mesmo</SelectItem>
                    {orgMembers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Prioridade</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || createTask.isPending}>
              {createTask.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
