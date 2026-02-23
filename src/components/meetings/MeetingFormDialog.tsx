import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useMeetingMutations, useCheckConflicts } from "@/hooks/use-meetings";
import { useCRMDealsSearch } from "@/hooks/use-crm";
import { useProjects } from "@/hooks/use-projects";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Calendar, MapPin, Users, Search } from "lucide-react";

interface OrgMember { user_id: string; name: string; email: string; role: string; }

interface MeetingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: any;
}

export function MeetingFormDialog({ open, onOpenChange, meeting }: MeetingFormDialogProps) {
  const { user } = useAuth();
  const { create, update } = useMeetingMutations();
  const checkConflicts = useCheckConflicts();
  const isEdit = !!meeting;

  const [title, setTitle] = useState(meeting?.title || "");
  const [description, setDescription] = useState(meeting?.description || "");
  const [meetingDate, setMeetingDate] = useState(meeting?.meeting_date?.split("T")[0] || new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(meeting?.start_time?.slice(0, 5) || "09:00");
  const [endTime, setEndTime] = useState(meeting?.end_time?.slice(0, 5) || "10:00");
  const [location, setLocation] = useState(meeting?.location || "");
  const [selectedMembers, setSelectedMembers] = useState<string[]>(meeting?.participants?.map((p: any) => p.user_id) || []);
  const [dealId, setDealId] = useState<string | null>(meeting?.deal_id || null);
  const [projectId, setProjectId] = useState<string | null>(meeting?.project_id || null);
  const [dealSearch, setDealSearch] = useState("");
  const [conflicts, setConflicts] = useState<any[]>([]);

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: ["org-members", user?.organization_id],
    queryFn: () => api(`/api/organizations/${user?.organization_id}/members`),
    enabled: !!user?.organization_id,
  });

  const { data: deals = [] } = useCRMDealsSearch(dealSearch);
  const { data: projects = [] } = useProjects();

  const toggleMember = (uid: string) => {
    setSelectedMembers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleCheckConflicts = async () => {
    if (!selectedMembers.length) return;
    try {
      const result = await checkConflicts.mutateAsync({
        user_ids: selectedMembers,
        meeting_date: meetingDate,
        start_time: startTime,
        end_time: endTime,
        exclude_meeting_id: meeting?.id,
      });
      setConflicts(result.conflicts || []);
      if (!result.conflicts?.length) toast.success("Sem conflitos de agenda!");
    } catch {
      toast.error("Erro ao verificar conflitos");
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !meetingDate || !startTime || !endTime) {
      toast.error("Preencha título, data e horários");
      return;
    }

    const data: any = {
      title, description, meeting_date: meetingDate, start_time: startTime, end_time: endTime,
      location, deal_id: dealId, project_id: projectId, participant_ids: selectedMembers,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: meeting.id, ...data });
      } else {
        await create.mutateAsync(data);
      }
      onOpenChange(false);
    } catch (error: any) {
      if (error.message?.includes("Conflito")) {
        toast.error("Conflito de agenda detectado", { description: error.message });
      } else {
        toast.error(error.message || "Erro ao salvar reunião");
      }
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {isEdit ? "Editar Reunião" : "Nova Reunião"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 min-h-0 space-y-4 pb-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da reunião" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Início *</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim *</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Local</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Sala de reunião, endereço..." />
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2"><Users className="h-4 w-4" /> Participantes</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleCheckConflicts} disabled={!selectedMembers.length}>
                Verificar conflitos
              </Button>
            </div>
            {conflicts.length > 0 && (
              <div className="p-2 bg-destructive/10 border border-destructive/30 rounded-md text-xs space-y-1">
                <p className="font-medium flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> Conflitos encontrados:</p>
                {conflicts.map((c, i) => (
                  <p key={i}>{c.name}: {c.title} ({c.start_time?.slice(0,5)}-{c.end_time?.slice(0,5)})</p>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto border rounded-md p-2">
              {members.map(m => (
                <div key={m.user_id} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${selectedMembers.includes(m.user_id) ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"}`} onClick={() => toggleMember(m.user_id)}>
                  <Checkbox checked={selectedMembers.includes(m.user_id)} onCheckedChange={() => toggleMember(m.user_id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Link Deal */}
          <div className="space-y-2">
            <Label>Vincular Negociação</Label>
            <div className="space-y-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar negociação..." value={dealSearch} onChange={e => setDealSearch(e.target.value)} />
              </div>
              {deals.length > 0 && dealSearch.length >= 2 && (
                <div className="border rounded-md max-h-24 overflow-y-auto">
                  {deals.map(d => (
                    <button key={d.id} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${dealId === d.id ? "bg-primary/10" : ""}`} onClick={() => { setDealId(d.id); setDealSearch(d.title); }}>
                      {d.title} - {d.company_name}
                    </button>
                  ))}
                </div>
              )}
              {dealId && <Badge variant="secondary" className="cursor-pointer" onClick={() => { setDealId(null); setDealSearch(""); }}>Negociação vinculada ✕</Badge>}
            </div>
          </div>

          {/* Link Project */}
          <div className="space-y-2">
            <Label>Vincular Projeto</Label>
            <Select value={projectId || "none"} onValueChange={v => setProjectId(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Descrição / Pauta</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Pauta da reunião..." rows={3} />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim() || !meetingDate}>
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : <><Calendar className="h-4 w-4 mr-2" /> {isEdit ? "Salvar" : "Agendar"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
