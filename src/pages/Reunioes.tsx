import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMeetings, useMeetingMutations } from "@/hooks/use-meetings";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { MeetingFormDialog } from "@/components/meetings/MeetingFormDialog";
import { MeetingDetailDialog } from "@/components/meetings/MeetingDetailDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { safeFormatDate } from "@/lib/utils";
import {
  Calendar, Clock, MapPin, Users, Plus, Search, Filter, ClipboardList,
  CheckCircle2, XCircle, Loader2, Trash2, Edit, MoreHorizontal, FileText, Briefcase, FolderKanban
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

interface OrgMember { user_id: string; name: string; email: string; role: string; }

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Agendada", variant: "outline" },
  in_progress: { label: "Em andamento", variant: "default" },
  completed: { label: "Concluída", variant: "secondary" },
  cancelled: { label: "Cancelada", variant: "destructive" },
};

export default function Reunioes() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [participantFilter, setParticipantFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filters = {
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    participant: participantFilter !== "all" ? participantFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data: meetings = [], isLoading } = useMeetings(filters);
  const { remove } = useMeetingMutations();

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: ["org-members", user?.organization_id],
    queryFn: () => api(`/api/organizations/${user?.organization_id}/members`),
    enabled: !!user?.organization_id,
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    await remove.mutateAsync(deleteId);
    setDeleteId(null);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Reuniões
            </h1>
            <p className="text-muted-foreground">Gerencie reuniões, atas, tarefas e participantes</p>
          </div>
          <Button onClick={() => { setEditingMeeting(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova Reunião
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar por título ou descrição..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={participantFilter} onValueChange={setParticipantFilter}>
                <SelectTrigger><SelectValue placeholder="Participante" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="flex-1" />
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="flex-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Meetings List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : meetings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Nenhuma reunião encontrada</h3>
              <p className="text-muted-foreground mt-1">Crie sua primeira reunião clicando no botão acima</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetings.map(meeting => {
              const statusConf = STATUS_CONFIG[meeting.status] || STATUS_CONFIG.scheduled;
              const taskProgress = meeting.total_tasks > 0 ? Math.round((meeting.completed_tasks / meeting.total_tasks) * 100) : 0;

              return (
                <Card
                  key={meeting.id}
                  className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
                  style={{
                    borderLeftColor: meeting.status === "completed" ? "hsl(var(--primary))" :
                      meeting.status === "cancelled" ? "hsl(var(--destructive))" :
                      meeting.status === "in_progress" ? "hsl(45 93% 47%)" : "hsl(var(--border))"
                  }}
                  onClick={() => setSelectedMeetingId(meeting.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base line-clamp-2 flex-1">{meeting.title}</CardTitle>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={e => { e.stopPropagation(); setEditingMeeting(meeting); setShowForm(true); }}>
                            <Edit className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(meeting.id); }}>
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Badge variant={statusConf.variant} className="w-fit text-xs">{statusConf.label}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {safeFormatDate(meeting.meeting_date ? meeting.meeting_date + "T12:00:00" : null, "dd/MM/yyyy")}
                      <Clock className="h-3.5 w-3.5 ml-2" />
                      {meeting.start_time?.slice(0, 5)} - {meeting.end_time?.slice(0, 5)}
                    </div>

                    {meeting.location && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="truncate">{meeting.location}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {meeting.participant_count}</span>
                      <span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {meeting.completed_tasks}/{meeting.total_tasks}</span>
                      <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {meeting.attachment_count}</span>
                    </div>

                    {meeting.total_tasks > 0 && (
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${taskProgress}%` }} />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {meeting.deal_title && <Badge variant="outline" className="text-xs">🤝 {meeting.deal_title}</Badge>}
                      {meeting.project_title && <Badge variant="outline" className="text-xs">📁 {meeting.project_title}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <MeetingFormDialog
        open={showForm}
        onOpenChange={open => { setShowForm(open); if (!open) setEditingMeeting(null); }}
        meeting={editingMeeting}
      />

      <MeetingDetailDialog
        open={!!selectedMeetingId}
        onOpenChange={open => { if (!open) setSelectedMeetingId(null); }}
        meetingId={selectedMeetingId}
      />

      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir reunião?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os dados da reunião serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
