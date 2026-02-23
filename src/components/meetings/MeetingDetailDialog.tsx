import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useMeeting, useMeetingMutations, useMeetingAttachmentMutations, useMeetingTaskMutations } from "@/hooks/use-meetings";
import { useUpload } from "@/hooks/use-upload";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { safeFormatDate } from "@/lib/utils";
import {
  Calendar, Clock, MapPin, Users, FileText, ClipboardList, Paperclip,
  Plus, Trash2, Download, CheckCircle2, Circle, Loader2, X, ExternalLink
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";

interface MeetingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string | null;
}

interface OrgMember { user_id: string; name: string; email: string; role: string; }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Agendada", color: "bg-blue-500" },
  in_progress: { label: "Em andamento", color: "bg-yellow-500" },
  completed: { label: "Concluída", color: "bg-green-500" },
  cancelled: { label: "Cancelada", color: "bg-red-500" },
};

const TASK_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "text-yellow-500" },
  in_progress: { label: "Em andamento", color: "text-blue-500" },
  completed: { label: "Concluída", color: "text-green-500" },
  cancelled: { label: "Cancelada", color: "text-muted-foreground" },
};

export function MeetingDetailDialog({ open, onOpenChange, meetingId }: MeetingDetailDialogProps) {
  const { user } = useAuth();
  const { data: meeting, isLoading } = useMeeting(meetingId);
  const { update } = useMeetingMutations();
  const attachmentMutations = useMeetingAttachmentMutations();
  const taskMutations = useMeetingTaskMutations();
  const { uploadFile, isUploading } = useUpload();

  const [minutes, setMinutes] = useState("");
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: ["org-members", user?.organization_id],
    queryFn: () => api(`/api/organizations/${user?.organization_id}/members`),
    enabled: !!user?.organization_id,
  });

  if (!meetingId) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !meetingId) return;
    try {
      const url = await uploadFile(file);
      if (url) {
        await attachmentMutations.create.mutateAsync({
          meetingId, name: file.name, url, mimetype: file.type, size: file.size,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Erro no upload");
    }
    e.target.value = "";
  };

  const handleSaveMinutes = async () => {
    if (!meetingId) return;
    await update.mutateAsync({ id: meetingId, minutes });
    setEditingMinutes(false);
    toast.success("Ata salva!");
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !meetingId) return;
    await taskMutations.create.mutateAsync({
      meetingId, title: newTaskTitle, assigned_to: newTaskAssignee || undefined, due_date: newTaskDueDate || undefined,
    });
    setNewTaskTitle("");
    setNewTaskAssignee("");
    setNewTaskDueDate("");
    toast.success("Tarefa criada!");
  };

  const handleToggleTask = async (task: any) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    await taskMutations.update.mutateAsync({ taskId: task.id, meetingId: meetingId!, status: newStatus });
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!meetingId) return;
    await update.mutateAsync({ id: meetingId, status: newStatus });
  };

  // Task completion chart
  const completedTasks = meeting?.tasks?.filter(t => t.status === "completed").length || 0;
  const pendingTasks = (meeting?.tasks?.length || 0) - completedTasks;
  const chartData = [
    { name: "Concluídas", value: completedTasks, color: "hsl(var(--primary))" },
    { name: "Pendentes", value: pendingTasks, color: "hsl(var(--muted))" },
  ].filter(d => d.value > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <span className="flex-1 truncate">{meeting?.title || "Carregando..."}</span>
            {meeting && (
              <Select value={meeting.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : meeting ? (
          <Tabs defaultValue="details" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="flex-shrink-0 grid grid-cols-4">
              <TabsTrigger value="details">Detalhes</TabsTrigger>
              <TabsTrigger value="minutes">Ata</TabsTrigger>
              <TabsTrigger value="tasks">Tarefas ({meeting.tasks?.length || 0})</TabsTrigger>
              <TabsTrigger value="files">Arquivos ({meeting.attachments?.length || 0})</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto min-h-0 mt-4">
              {/* DETAILS TAB */}
              <TabsContent value="details" className="space-y-4 m-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    {safeFormatDate(meeting.meeting_date ? meeting.meeting_date + "T12:00:00" : null, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {meeting.start_time?.slice(0, 5)} - {meeting.end_time?.slice(0, 5)}
                  </div>
                  {meeting.location && (
                    <div className="flex items-center gap-2 text-sm col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {meeting.location}
                    </div>
                  )}
                </div>

                {meeting.description && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{meeting.description}</p>
                  </div>
                )}

                {(meeting.deal_title || meeting.project_title) && (
                  <div className="flex flex-wrap gap-2">
                    {meeting.deal_title && <Badge variant="outline">🤝 {meeting.deal_title}</Badge>}
                    {meeting.project_title && <Badge variant="outline">📁 {meeting.project_title}</Badge>}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Users className="h-4 w-4" /> Participantes ({meeting.participants?.length || 0})</Label>
                  <div className="flex flex-wrap gap-2">
                    {meeting.participants?.map(p => (
                      <Badge key={p.user_id} variant="secondary">{p.name}</Badge>
                    ))}
                  </div>
                </div>

                {/* Tasks chart */}
                {(meeting.tasks?.length || 0) > 0 && (
                  <div className="border rounded-lg p-4">
                    <Label className="mb-2 block">Progresso das Tarefas</Label>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                            {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-center text-sm text-muted-foreground mt-2">
                      {completedTasks} de {meeting.tasks?.length} tarefas concluídas ({meeting.tasks?.length ? Math.round((completedTasks / meeting.tasks.length) * 100) : 0}%)
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* MINUTES TAB */}
              <TabsContent value="minutes" className="space-y-4 m-0">
                {editingMinutes || !meeting.minutes ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editingMinutes ? minutes : (meeting.minutes || "")}
                      onChange={e => { setMinutes(e.target.value); if (!editingMinutes) setEditingMinutes(true); }}
                      onFocus={() => { if (!editingMinutes) { setMinutes(meeting.minutes || ""); setEditingMinutes(true); } }}
                      placeholder="Escreva a ata da reunião aqui..."
                      rows={12}
                      className="font-mono text-sm"
                    />
                    {editingMinutes && (
                      <div className="flex gap-2">
                        <Button onClick={handleSaveMinutes} disabled={update.isPending}>
                          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Salvar Ata
                        </Button>
                        <Button variant="outline" onClick={() => setEditingMinutes(false)}>Cancelar</Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 bg-muted/30 rounded-lg whitespace-pre-wrap text-sm font-mono min-h-[200px]">
                      {meeting.minutes}
                    </div>
                    <Button variant="outline" onClick={() => { setMinutes(meeting.minutes || ""); setEditingMinutes(true); }}>
                      <FileText className="h-4 w-4 mr-2" /> Editar Ata
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* TASKS TAB */}
              <TabsContent value="tasks" className="space-y-4 m-0">
                <div className="flex gap-2">
                  <Input className="flex-1" placeholder="Nova tarefa..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }} />
                  <Select value={newTaskAssignee} onValueChange={setNewTaskAssignee}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Responsável" /></SelectTrigger>
                    <SelectContent>
                      {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="date" className="w-36" value={newTaskDueDate} onChange={e => setNewTaskDueDate(e.target.value)} />
                  <Button size="icon" onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  {meeting.tasks?.map(task => (
                    <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${task.status === "completed" ? "bg-muted/30 opacity-70" : "bg-card"}`}>
                      <button onClick={() => handleToggleTask(task)} className="shrink-0">
                        {task.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.status === "completed" ? "line-through" : ""}`}>{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.assigned_to_name && <span className="text-xs text-muted-foreground">👤 {task.assigned_to_name}</span>}
                          {task.due_date && <span className="text-xs text-muted-foreground">📅 {safeFormatDate(task.due_date, "dd/MM/yyyy")}</span>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => taskMutations.remove.mutateAsync({ taskId: task.id, meetingId: meetingId! })}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {!meeting.tasks?.length && <p className="text-sm text-muted-foreground text-center py-6">Nenhuma tarefa criada</p>}
                </div>
              </TabsContent>

              {/* FILES TAB */}
              <TabsContent value="files" className="space-y-4 m-0">
                <div>
                  <Label htmlFor="meeting-file-upload" className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted/50 transition-colors">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    {isUploading ? "Enviando..." : "Anexar arquivo"}
                  </Label>
                  <input id="meeting-file-upload" type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                </div>

                <div className="space-y-2">
                  {meeting.attachments?.map(att => (
                    <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{att.name}</p>
                        <p className="text-xs text-muted-foreground">{att.uploaded_by_name} • {safeFormatDate(att.created_at, "dd/MM HH:mm")}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <a href={att.url} target="_blank" rel="noopener"><Download className="h-3.5 w-3.5" /></a>
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => attachmentMutations.remove.mutateAsync({ attId: att.id, meetingId: meetingId! })}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {!meeting.attachments?.length && <p className="text-sm text-muted-foreground text-center py-6">Nenhum arquivo anexado</p>}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
