import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useUpload } from "@/hooks/use-upload";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, MapPin, Calendar as CalendarIcon, Clock, User, Users, Loader2,
  Upload, FileText, Image, Paperclip, Trash2, CheckCircle, AlertTriangle,
  MessageSquare, ChevronDown, ChevronUp, Edit2, Save, X
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Types
interface ExternalVisit {
  id: string;
  deal_id: string;
  title: string;
  description?: string;
  visit_date: string;
  start_time?: string;
  end_time?: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  address?: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  participants: VisitParticipant[];
  notes: VisitNote[];
  checklist: VisitChecklistItem[];
  attachments: VisitAttachment[];
}

interface VisitParticipant {
  id: string;
  user_id: string;
  user_name: string;
}

interface VisitNote {
  id: string;
  content: string;
  created_by_name: string;
  created_at: string;
}

interface VisitChecklistItem {
  id: string;
  text: string;
  is_checked: boolean;
}

interface VisitAttachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  created_at: string;
}

interface ConflictInfo {
  name: string;
  title: string;
  start_time: string;
  end_time: string;
  conflict_type: string;
}

interface ExternalVisitTabProps {
  dealId: string;
  dealTitle: string;
}

// Hooks
function useExternalVisits(dealId: string) {
  return useQuery({
    queryKey: ["external-visits", dealId],
    queryFn: () => api<ExternalVisit[]>(`/api/crm/deals/${dealId}/external-visits`),
    enabled: !!dealId,
  });
}

function useExternalVisitMutations(dealId: string) {
  const qc = useQueryClient();
  const key = ["external-visits", dealId];

  const create = useMutation({
    mutationFn: (data: any) => api<ExternalVisit>(`/api/crm/deals/${dealId}/external-visits`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: ({ visitId, ...data }: any) => api(`/api/crm/external-visits/${visitId}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: (visitId: string) => api(`/api/crm/external-visits/${visitId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const addNote = useMutation({
    mutationFn: ({ visitId, content }: { visitId: string; content: string }) =>
      api(`/api/crm/external-visits/${visitId}/notes`, { method: "POST", body: { content } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const addChecklist = useMutation({
    mutationFn: ({ visitId, text }: { visitId: string; text: string }) =>
      api(`/api/crm/external-visits/${visitId}/checklist`, { method: "POST", body: { text } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const toggleChecklist = useMutation({
    mutationFn: ({ itemId, is_checked }: { itemId: string; is_checked: boolean }) =>
      api(`/api/crm/external-visit-checklist/${itemId}`, { method: "PATCH", body: { is_checked } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteChecklist = useMutation({
    mutationFn: (itemId: string) => api(`/api/crm/external-visit-checklist/${itemId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const addAttachment = useMutation({
    mutationFn: ({ visitId, ...data }: { visitId: string; file_name: string; file_url: string; file_type?: string; file_size?: number }) =>
      api(`/api/crm/external-visits/${visitId}/attachments`, { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["deal-attachments"] }); // refresh central files
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api(`/api/crm/external-visit-attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { create, update, remove, addNote, addChecklist, toggleChecklist, deleteChecklist, addAttachment, deleteAttachment };
}

export function ExternalVisitTab({ dealId, dealTitle }: ExternalVisitTabProps) {
  const { user } = useAuth();
  const { data: visits = [], isLoading } = useExternalVisits(dealId);
  const mutations = useExternalVisitMutations(dealId);
  const { uploadFile, isUploading } = useUpload();

  // Team members for participant selection
  const { data: teamMembers } = useQuery({
    queryKey: ["crm-my-team"],
    queryFn: () => api<{ user_id: string; name: string; email: string }[]>("/api/crm/my-team"),
  });

  const [showNewVisit, setShowNewVisit] = useState(false);
  const [expandedVisit, setExpandedVisit] = useState<string | null>(null);
  const [newNote, setNewNote] = useState<Record<string, string>>({});
  const [newCheckItem, setNewCheckItem] = useState<Record<string, string>>({});

  // New visit form
  const [form, setForm] = useState({
    title: "",
    description: "",
    visit_date: undefined as Date | undefined,
    start_time: "09:00",
    end_time: "10:00",
    address: "",
    participant_ids: [] as string[],
  });
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const checkConflicts = async () => {
    if (!form.visit_date || form.participant_ids.length === 0) return;
    setCheckingConflicts(true);
    try {
      const allIds = [...form.participant_ids];
      if (user?.id && !allIds.includes(user.id)) allIds.push(user.id);
      const result = await api<{ conflicts: ConflictInfo[] }>("/api/meetings/check-conflicts", {
        method: "POST",
        body: {
          user_ids: allIds,
          meeting_date: format(form.visit_date, "yyyy-MM-dd"),
          start_time: form.start_time,
          end_time: form.end_time,
        },
      });
      setConflicts(result.conflicts || []);
    } catch {
      setConflicts([]);
    } finally {
      setCheckingConflicts(false);
    }
  };

  useEffect(() => {
    if (form.visit_date && form.start_time && form.end_time) {
      const timer = setTimeout(checkConflicts, 500);
      return () => clearTimeout(timer);
    }
  }, [form.visit_date, form.start_time, form.end_time, form.participant_ids]);

  const handleCreateVisit = async () => {
    if (!form.title || !form.visit_date) {
      toast.error("Título e data são obrigatórios");
      return;
    }
    try {
      await mutations.create.mutateAsync({
        title: form.title,
        description: form.description,
        visit_date: format(form.visit_date, "yyyy-MM-dd"),
        start_time: form.start_time,
        end_time: form.end_time,
        address: form.address,
        participant_ids: form.participant_ids,
      });
      toast.success("Visita agendada!");
      setShowNewVisit(false);
      setForm({ title: "", description: "", visit_date: undefined, start_time: "09:00", end_time: "10:00", address: "", participant_ids: [] });
      setConflicts([]);
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar visita");
    }
  };

  const handleUploadFile = async (visitId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      for (const file of Array.from(files)) {
        try {
          const url = await uploadFile(file);
          if (url) {
            await mutations.addAttachment.mutateAsync({
              visitId,
              file_name: file.name,
              file_url: url,
              file_type: file.type,
              file_size: file.size,
            });
          }
        } catch (err: any) {
          toast.error(`Erro ao enviar ${file.name}`);
        }
      }
      toast.success("Arquivo(s) enviado(s)!");
    };
    input.click();
  };

  const toggleParticipant = (userId: string) => {
    setForm(prev => ({
      ...prev,
      participant_ids: prev.participant_ids.includes(userId)
        ? prev.participant_ids.filter(id => id !== userId)
        : [...prev.participant_ids, userId],
    }));
  };

  const statusLabels: Record<string, string> = {
    scheduled: "Agendada",
    in_progress: "Em Andamento",
    completed: "Concluída",
    cancelled: "Cancelada",
  };

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-muted text-muted-foreground",
  };

  const getFileIcon = (type?: string) => {
    if (type?.startsWith("image/")) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Visitas Externas ({visits.length})
        </h4>
        <Button size="sm" onClick={() => setShowNewVisit(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Visita
        </Button>
      </div>

      {/* New Visit Dialog */}
      <Dialog open={showNewVisit} onOpenChange={setShowNewVisit}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Agendar Visita Externa
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                placeholder={`Visita - ${dealTitle}`}
                value={form.title}
                onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                placeholder="Objetivo da visita, observações..."
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div>
              <Label>Endereço</Label>
              <Input
                placeholder="Endereço do local da visita"
                value={form.address}
                onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data *</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.visit_date && "text-muted-foreground")}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {form.visit_date ? format(form.visit_date, "dd/MM", { locale: ptBR }) : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.visit_date}
                      onSelect={(d) => { setForm(prev => ({ ...prev, visit_date: d })); setDatePickerOpen(false); }}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Início</Label>
                <Input type="time" value={form.start_time} onChange={e => setForm(prev => ({ ...prev, start_time: e.target.value }))} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={form.end_time} onChange={e => setForm(prev => ({ ...prev, end_time: e.target.value }))} />
              </div>
            </div>

            {/* Participants */}
            <div>
              <Label className="flex items-center gap-1 mb-2">
                <Users className="h-4 w-4" /> Participantes
              </Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {teamMembers?.map(member => (
                  <label
                    key={member.user_id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors",
                      form.participant_ids.includes(member.user_id)
                        ? "bg-primary/10 border-primary text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <Checkbox
                      checked={form.participant_ids.includes(member.user_id)}
                      onCheckedChange={() => toggleParticipant(member.user_id)}
                    />
                    {member.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Conflict warnings */}
            {checkingConflicts && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando agenda...
              </div>
            )}
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-3 space-y-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Conflitos de agenda detectados:
                </p>
                {conflicts.map((c, i) => (
                  <p key={i} className="text-xs text-yellow-700 dark:text-yellow-300">
                    • {c.name}: {c.title} ({c.start_time?.slice(0, 5)} - {c.end_time?.slice(0, 5)})
                  </p>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewVisit(false)}>Cancelar</Button>
            <Button onClick={handleCreateVisit} disabled={mutations.create.isPending}>
              {mutations.create.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Agendar Visita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visit List */}
      {visits.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p>Nenhuma visita agendada</p>
          <p className="text-xs">Clique em "Nova Visita" para agendar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visits.map(visit => {
            const isExpanded = expandedVisit === visit.id;
            const isOverdue = visit.visit_date && isPast(parseISO(visit.visit_date)) && visit.status === "scheduled";
            const checkedCount = visit.checklist?.filter(c => c.is_checked).length || 0;
            const totalCheck = visit.checklist?.length || 0;

            return (
              <Card key={visit.id} className={cn("overflow-hidden", isOverdue && "border-red-300 dark:border-red-700")}>
                {/* Visit Header */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedVisit(isExpanded ? null : visit.id)}
                >
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{visit.title}</span>
                      <Badge className={cn("text-[10px] px-1.5", statusColors[visit.status])}>
                        {statusLabels[visit.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {(() => { const parts = (visit.visit_date || "").split("T")[0].split("-"); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "—"; })()}
                      </span>
                      {visit.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {visit.start_time.slice(0, 5)} - {visit.end_time?.slice(0, 5)}
                        </span>
                      )}
                      {visit.participants?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {visit.participants.length}
                        </span>
                      )}
                      {totalCheck > 0 && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {checkedCount}/{totalCheck}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t p-3 space-y-4">
                    {/* Status & Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Select
                        value={visit.status}
                        onValueChange={(val) => mutations.update.mutate({ visitId: visit.id, status: val })}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Agendada</SelectItem>
                          <SelectItem value="in_progress">Em Andamento</SelectItem>
                          <SelectItem value="completed">Concluída</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleUploadFile(visit.id)}
                        disabled={isUploading}
                      >
                        {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                        Anexar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive ml-auto"
                        onClick={() => {
                          if (confirm("Excluir esta visita?")) mutations.remove.mutate(visit.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    </div>

                    {/* Editable Date & Time */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Data</Label>
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          value={visit.visit_date?.split("T")[0] || ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              mutations.update.mutate({ visitId: visit.id, visit_date: e.target.value });
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Início</Label>
                        <Input
                          type="time"
                          className="h-8 text-xs"
                          value={visit.start_time?.slice(0, 5) || ""}
                          onChange={(e) => {
                            mutations.update.mutate({ visitId: visit.id, start_time: e.target.value });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Fim</Label>
                        <Input
                          type="time"
                          className="h-8 text-xs"
                          value={visit.end_time?.slice(0, 5) || ""}
                          onChange={(e) => {
                            mutations.update.mutate({ visitId: visit.id, end_time: e.target.value });
                          }}
                        />
                      </div>
                    </div>

                    {/* Description & Address */}
                    {visit.description && <p className="text-sm text-muted-foreground">{visit.description}</p>}
                    {visit.address && (
                      <p className="text-sm flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {visit.address}
                      </p>
                    )}

                    {/* Participants */}
                    {visit.participants?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1 flex items-center gap-1"><Users className="h-3 w-3" /> Participantes</p>
                        <div className="flex flex-wrap gap-1">
                          {visit.participants.map(p => (
                            <Badge key={p.id} variant="secondary" className="text-xs">{p.user_name}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Checklist */}
                    <div>
                      <p className="text-xs font-medium mb-1 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Checklist
                        {totalCheck > 0 && <span className="text-muted-foreground">({checkedCount}/{totalCheck})</span>}
                      </p>
                      <div className="space-y-1">
                        {visit.checklist?.map(item => (
                          <div key={item.id} className="flex items-center gap-2 group">
                            <Checkbox
                              checked={item.is_checked}
                              onCheckedChange={(checked) => mutations.toggleChecklist.mutate({ itemId: item.id, is_checked: !!checked })}
                            />
                            <span className={cn("text-sm flex-1", item.is_checked && "line-through text-muted-foreground")}>{item.text}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onClick={() => mutations.deleteChecklist.mutate(item.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Input
                          placeholder="Novo item..."
                          value={newCheckItem[visit.id] || ""}
                          onChange={e => setNewCheckItem(prev => ({ ...prev, [visit.id]: e.target.value }))}
                          className="h-8 text-sm"
                          onKeyDown={e => {
                            if (e.key === "Enter" && newCheckItem[visit.id]?.trim()) {
                              mutations.addChecklist.mutate({ visitId: visit.id, text: newCheckItem[visit.id].trim() });
                              setNewCheckItem(prev => ({ ...prev, [visit.id]: "" }));
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={!newCheckItem[visit.id]?.trim()}
                          onClick={() => {
                            if (newCheckItem[visit.id]?.trim()) {
                              mutations.addChecklist.mutate({ visitId: visit.id, text: newCheckItem[visit.id].trim() });
                              setNewCheckItem(prev => ({ ...prev, [visit.id]: "" }));
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Attachments */}
                    {visit.attachments?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1 flex items-center gap-1"><Paperclip className="h-3 w-3" /> Arquivos</p>
                        <div className="space-y-1">
                          {visit.attachments.map(att => (
                            <div key={att.id} className="flex items-center gap-2 text-sm group">
                              {getFileIcon(att.file_type)}
                              <a href={att.file_url} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">
                                {att.file_name}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                onClick={() => mutations.deleteAttachment.mutate(att.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes (history) */}
                    <div>
                      <p className="text-xs font-medium mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Anotações</p>
                      <div className="space-y-2 mb-2 max-h-40 overflow-y-auto">
                        {visit.notes?.map(note => (
                          <div key={note.id} className="bg-muted/50 rounded p-2 text-sm">
                            <p>{note.content}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {note.created_by_name} • {format(parseISO(note.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        ))}
                        {(!visit.notes || visit.notes.length === 0) && (
                          <p className="text-xs text-muted-foreground">Nenhuma anotação</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Adicionar anotação..."
                          value={newNote[visit.id] || ""}
                          onChange={e => setNewNote(prev => ({ ...prev, [visit.id]: e.target.value }))}
                          className="h-8 text-sm"
                          onKeyDown={e => {
                            if (e.key === "Enter" && newNote[visit.id]?.trim()) {
                              mutations.addNote.mutate({ visitId: visit.id, content: newNote[visit.id].trim() });
                              setNewNote(prev => ({ ...prev, [visit.id]: "" }));
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={!newNote[visit.id]?.trim()}
                          onClick={() => {
                            if (newNote[visit.id]?.trim()) {
                              mutations.addNote.mutate({ visitId: visit.id, content: newNote[visit.id].trim() });
                              setNewNote(prev => ({ ...prev, [visit.id]: "" }));
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
