import { useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/utils";
import {
  Plus, Building2, User, Phone, Mail, FileText, ClipboardList,
  Calendar, Trash2, Edit, GripVertical, CheckCircle2, Circle,
  Clock, AlertTriangle, ChevronRight, History, Settings, MoreVertical,
  Presentation, Search, MessageSquare, Send, Upload, Paperclip, StickyNote, MapPin, Loader2,
  BarChart3, LayoutDashboard
} from "lucide-react";
import {
  useHomologationBoards, useCreateBoard, useDeleteBoard,
  useHomologationStages, useCreateStage, useUpdateStage, useDeleteStage,
  useHomologationCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany,
  useHomologationTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useHomologationMeetings, useCreateHomologationMeeting, useLinkMeeting,
  useHomologationDocuments, useCreateDocument, useDeleteDocument,
  useHomologationNotes, useCreateNote, useDeleteNote,
  useHomologationHistory, useHomologationOrgMembers,
  HomologationCompany, HomologationStage,
} from "@/hooks/use-homologation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useUpload } from "@/hooks/use-upload";
import { useAuth } from "@/contexts/AuthContext";
import { HomologationKanban } from "@/components/homologation/HomologationKanban";
import { HomologationDashboard } from "@/components/homologation/HomologationDashboard";

export default function Homologacao() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const [viewMode, setViewMode] = useState<"kanban" | "dashboard">("kanban");
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showNewBoardDialog, setShowNewBoardDialog] = useState(false);
  const [showNewCompanyDialog, setShowNewCompanyDialog] = useState(false);
  const [showCompanyDetailDialog, setShowCompanyDetailDialog] = useState(false);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showStageSettings, setShowStageSettings] = useState(false);
  const [showNewStageDialog, setShowNewStageDialog] = useState(false);
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Form states
  const [boardName, setBoardName] = useState("");
  const [companyForm, setCompanyForm] = useState({ name: "", cnpj: "", contact_name: "", contact_email: "", contact_phone: "", notes: "", assigned_to: "", address: "", city: "", state: "", zip_code: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium", due_date: "", assigned_to: "" });
  const [meetingForm, setMeetingForm] = useState({ title: "", description: "", meeting_date: "", start_time: "", end_time: "", location: "" });
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#6366f1");
  const [whatsappForm, setWhatsappForm] = useState({ content: "", scheduled_at: "", scheduled_time: "" });
  const [noteContent, setNoteContent] = useState("");
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const taskCreatingRef = useRef(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", cnpj: "", contact_name: "", contact_email: "", contact_phone: "", notes: "", assigned_to: "", address: "", city: "", state: "", zip_code: "" });

  const queryClient = useQueryClient();

  // Data
  const { data: boards = [], isLoading: loadingBoards } = useHomologationBoards();
  // Auto-select first board
  const activeBoardId = selectedBoardId || boards[0]?.id || null;
  const { data: stages = [] } = useHomologationStages(activeBoardId);
  const { data: companies = [] } = useHomologationCompanies(activeBoardId);
  const { data: tasks = [] } = useHomologationTasks(selectedCompanyId);
  const { data: meetings = [] } = useHomologationMeetings(selectedCompanyId);
  const { data: documents = [] } = useHomologationDocuments(selectedCompanyId);
  const { data: notes = [] } = useHomologationNotes(selectedCompanyId);
  const { data: history = [] } = useHomologationHistory(selectedCompanyId);
  const { data: orgMembers = [], isLoading: loadingMembers } = useHomologationOrgMembers();
  const { uploadFile, isUploading } = useUpload();

  // WhatsApp scheduled messages for selected company
  const contactPhone = useMemo(() => {
    const comp = companies.find(c => c.id === selectedCompanyId);
    return comp?.contact_phone || "";
  }, [companies, selectedCompanyId]);
  const { data: scheduledMessages = [] } = useQuery({
    queryKey: ["homologation-scheduled-messages", contactPhone],
    queryFn: () => api<any[]>(`/api/chat/scheduled-messages-by-phone?phone=${encodeURIComponent(contactPhone)}`),
    enabled: !!contactPhone,
  });

  const scheduleWhatsapp = useMutation({
    mutationFn: (data: { phone: string; content: string; scheduled_at: string }) =>
      api("/api/chat/schedule-message-by-phone", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homologation-scheduled-messages"] });
      toast({ title: "Mensagem agendada com sucesso!" });
      setWhatsappForm({ content: "", scheduled_at: "", scheduled_time: "" });
    },
    onError: (e: any) => toast({ title: "Erro ao agendar", description: e.message, variant: "destructive" }),
  });

  const cancelScheduled = useMutation({
    mutationFn: (id: string) => api(`/api/chat/scheduled/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["homologation-scheduled-messages"] }),
  });

  // Mutations
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const createMeeting = useCreateHomologationMeeting();
  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();

  // activeBoardId already defined above near hooks

  const selectedCompany = useMemo(() => 
    companies.find(c => c.id === selectedCompanyId), [companies, selectedCompanyId]
  );

  // Group companies by stage
  const companiesByStage = useMemo(() => {
    const map: Record<string, HomologationCompany[]> = {};
    stages.forEach(s => { map[s.id] = []; });
    companies
      .filter(c => !searchTerm || c.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .forEach(c => {
        if (c.stage_id && map[c.stage_id]) {
          map[c.stage_id].push(c);
        }
      });
    return map;
  }, [companies, stages, searchTerm]);

  // Handlers
  const handleCreateBoard = async () => {
    if (!boardName.trim()) return;
    try {
      const result = await createBoard.mutateAsync({ name: boardName });
      setSelectedBoardId(result.id);
      setBoardName("");
      setShowNewBoardDialog(false);
      toast({ title: "Quadro criado com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao criar quadro", description: e.message, variant: "destructive" });
    }
  };

  const handleCNPJLookup = async () => {
    const digits = companyForm.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast({ title: "CNPJ deve ter 14 dígitos", variant: "destructive" });
      return;
    }
    setLoadingCNPJ(true);
    try {
      const data = await api<any>(`/api/cnpj/lookup/${digits}`);
      setCompanyForm(p => ({
        ...p,
        name: p.name || data.razao_social || data.nome_fantasia || p.name,
        contact_email: p.contact_email || data.email || p.contact_email,
        contact_phone: p.contact_phone || data.telefone || p.contact_phone,
        address: [data.logradouro, data.numero, data.complemento].filter(Boolean).join(", ") || p.address,
        city: data.municipio || p.city,
        state: data.uf || p.state,
        zip_code: data.cep || p.zip_code,
        notes: p.notes || [
          data.razao_social && `Razão Social: ${data.razao_social}`,
          data.nome_fantasia && `Nome Fantasia: ${data.nome_fantasia}`,
          data.capital_social && `Capital Social: R$ ${Number(data.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
          data.socios?.length && `Sócios: ${data.socios.map((s: any) => s.nome).join(", ")}`,
        ].filter(Boolean).join("\n"),
      }));
      toast({ title: "Dados do CNPJ preenchidos!" });
    } catch {
      toast({ title: "Erro ao consultar CNPJ", variant: "destructive" });
    } finally {
      setLoadingCNPJ(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!companyForm.name.trim() || !activeBoardId) return;
    try {
      await createCompany.mutateAsync({
        boardId: activeBoardId,
        ...companyForm,
        assigned_to: companyForm.assigned_to || undefined,
      });
      setCompanyForm({ name: "", cnpj: "", contact_name: "", contact_email: "", contact_phone: "", notes: "", assigned_to: "", address: "", city: "", state: "", zip_code: "" });
      setShowNewCompanyDialog(false);
      toast({ title: "Empresa adicionada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleMoveCompany = async (companyId: string, newStageId: string) => {
    try {
      await updateCompany.mutateAsync({ id: companyId, stage_id: newStageId });
    } catch (e: any) {
      toast({ title: "Erro ao mover", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim() || !selectedCompanyId || taskCreatingRef.current) return;
    taskCreatingRef.current = true;
    try {
      await createTask.mutateAsync({
        companyId: selectedCompanyId,
        ...taskForm,
        assigned_to: taskForm.assigned_to || undefined,
        due_date: taskForm.due_date || undefined,
      });
      setTaskForm({ title: "", description: "", priority: "medium", due_date: "", assigned_to: "" });
      setShowNewTaskDialog(false);
      toast({ title: "Tarefa criada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      taskCreatingRef.current = false;
    }
  };

  const handleCreateMeeting = async () => {
    if (!meetingForm.title.trim() || !meetingForm.meeting_date || !meetingForm.start_time || !selectedCompanyId) return;
    try {
      await createMeeting.mutateAsync({
        companyId: selectedCompanyId,
        ...meetingForm,
      });
      setMeetingForm({ title: "", description: "", meeting_date: "", start_time: "", end_time: "", location: "" });
      setShowNewMeetingDialog(false);
      toast({ title: "Reunião agendada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleUploadDocument = async (file: File) => {
    if (!selectedCompanyId) return;
    try {
      const url = await uploadFile(file);
      if (url) {
        await createDocument.mutateAsync({
          companyId: selectedCompanyId,
          name: file.name,
          url,
          mimetype: file.type,
          size: file.size,
        });
        toast({ title: "Documento enviado!" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim() || !selectedCompanyId) return;
    try {
      await createNote.mutateAsync({ companyId: selectedCompanyId, content: noteContent });
      setNoteContent("");
      toast({ title: "Nota adicionada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    await updateTask.mutateAsync({ id: taskId, status: newStatus });
  };

  const handleStartEdit = () => {
    if (!selectedCompany) return;
    setEditForm({
      name: selectedCompany.name || "",
      cnpj: selectedCompany.cnpj || "",
      contact_name: selectedCompany.contact_name || "",
      contact_email: selectedCompany.contact_email || "",
      contact_phone: selectedCompany.contact_phone || "",
      notes: selectedCompany.notes || "",
      assigned_to: selectedCompany.assigned_to || "",
      address: (selectedCompany as any).address || "",
      city: (selectedCompany as any).city || "",
      state: (selectedCompany as any).state || "",
      zip_code: (selectedCompany as any).zip_code || "",
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCompanyId || !editForm.name.trim()) return;
    try {
      await updateCompany.mutateAsync({
        id: selectedCompanyId,
        ...editForm,
        assigned_to: editForm.assigned_to && editForm.assigned_to !== "__none__" ? editForm.assigned_to : undefined,
      });
      setEditMode(false);
      toast({ title: "Empresa atualizada!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === "board") await deleteBoard.mutateAsync(deleteConfirm.id);
      if (deleteConfirm.type === "company") { await deleteCompany.mutateAsync(deleteConfirm.id); setShowCompanyDetailDialog(false); }
      if (deleteConfirm.type === "task") await deleteTask.mutateAsync(deleteConfirm.id);
      if (deleteConfirm.type === "stage") await deleteStage.mutateAsync(deleteConfirm.id);
      toast({ title: "Removido com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setDeleteConfirm(null);
  };

  const handleAddStage = async () => {
    if (!newStageName.trim() || !activeBoardId) return;
    try {
      await createStage.mutateAsync({ boardId: activeBoardId, name: newStageName, color: newStageColor });
      setNewStageName("");
      setShowNewStageDialog(false);
      toast({ title: "Fase adicionada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleScheduleWhatsapp = async () => {
    if (!whatsappForm.content.trim() || !whatsappForm.scheduled_at || !contactPhone) return;
    const scheduledAt = whatsappForm.scheduled_time
      ? `${whatsappForm.scheduled_at}T${whatsappForm.scheduled_time}:00`
      : `${whatsappForm.scheduled_at}T09:00:00`;
    scheduleWhatsapp.mutate({ phone: contactPhone, content: whatsappForm.content, scheduled_at: scheduledAt });
  };

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    high: "bg-destructive/10 text-destructive",
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
         {/* Top bar */}
         <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
           <div className="flex items-center gap-2 flex-1 min-w-0">
             {boards.length > 0 && (
               <Select value={activeBoardId || ""} onValueChange={setSelectedBoardId}>
                 <SelectTrigger className="w-[220px]">
                   <SelectValue placeholder="Selecionar quadro" />
                 </SelectTrigger>
                 <SelectContent>
                   {boards.map(b => (
                     <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             )}
             {isAdmin && (
               <Button variant="outline" size="sm" onClick={() => setShowNewBoardDialog(true)}>
                 <Plus className="h-4 w-4 mr-1" /> Novo Quadro
               </Button>
             )}
             {isAdmin && activeBoardId && (
               <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                 const board = boards.find(b => b.id === activeBoardId);
                 if (board) setDeleteConfirm({ type: "board", id: board.id, name: board.name });
               }}>
                 <Trash2 className="h-4 w-4 mr-1" /> Apagar Quadro
               </Button>
             )}
           </div>
           <div className="flex items-center gap-2">
             <div className="flex items-center border rounded-md overflow-hidden">
               <Button
                 variant={viewMode === "kanban" ? "default" : "ghost"}
                 size="sm"
                 className="rounded-none"
                 onClick={() => setViewMode("kanban")}
               >
                 <Building2 className="h-4 w-4 mr-1" /> Kanban
               </Button>
               <Button
                 variant={viewMode === "dashboard" ? "default" : "ghost"}
                 size="sm"
                 className="rounded-none"
                 onClick={() => setViewMode("dashboard")}
               >
                 <LayoutDashboard className="h-4 w-4 mr-1" /> Dashboard
               </Button>
             </div>
             {viewMode === "kanban" && (
               <>
                 <div className="relative">
                   <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                   <Input
                     placeholder="Buscar empresa..."
                     value={searchTerm}
                     onChange={e => setSearchTerm(e.target.value)}
                     className="pl-9 w-[200px]"
                   />
                 </div>
                 {activeBoardId && (
                   <>
                     <Button size="sm" onClick={() => setShowNewCompanyDialog(true)}>
                       <Plus className="h-4 w-4 mr-1" /> Nova Empresa
                     </Button>
                     <Button variant="ghost" size="icon" onClick={() => setShowStageSettings(true)}>
                       <Settings className="h-4 w-4" />
                     </Button>
                   </>
                 )}
               </>
             )}
           </div>
         </div>

         {/* Content */}
         {!activeBoardId ? (
           <div className="flex-1 flex items-center justify-center text-muted-foreground">
             <div className="text-center space-y-3">
               <Building2 className="h-12 w-12 mx-auto opacity-40" />
               <p>Crie seu primeiro quadro de homologação</p>
               {isAdmin && (
                 <Button onClick={() => setShowNewBoardDialog(true)}>
                   <Plus className="h-4 w-4 mr-1" /> Criar Quadro
                 </Button>
               )}
             </div>
           </div>
         ) : viewMode === "dashboard" ? (
           <HomologationDashboard companies={companies} stages={stages} orgMembers={orgMembers} />
         ) : (
           <div className="flex-1 overflow-x-auto">
             <HomologationKanban
               stages={stages}
               companiesByStage={companiesByStage}
               onCompanyClick={(company) => { setSelectedCompanyId(company.id); setShowCompanyDetailDialog(true); }}
               onMoveCompany={handleMoveCompany}
               onDeleteCompany={(company) => setDeleteConfirm({ type: "company", id: company.id, name: company.name })}
             />
           </div>
         )}
       </div>

      {/* New Board Dialog */}
      <Dialog open={showNewBoardDialog} onOpenChange={setShowNewBoardDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Quadro de Homologação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Quadro</Label>
              <Input value={boardName} onChange={e => setBoardName(e.target.value)} placeholder="Ex: Homologação Fornecedores" />
            </div>
            <p className="text-xs text-muted-foreground">Fases padrão serão criadas automaticamente. Você pode personalizá-las depois.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBoardDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateBoard} disabled={createBoard.isPending}>Criar Quadro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Company Dialog */}
      <Dialog open={showNewCompanyDialog} onOpenChange={setShowNewCompanyDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>Nova Empresa</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 overflow-y-auto max-h-[calc(85vh-130px)] pr-2">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome da Empresa *</Label>
                <Input value={companyForm.name} onChange={e => setCompanyForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label>CNPJ</Label>
                <div className="flex gap-2">
                  <Input value={companyForm.cnpj} onChange={e => setCompanyForm(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" className="flex-1" />
                  <Button variant="outline" size="icon" onClick={handleCNPJLookup} disabled={loadingCNPJ || !companyForm.cnpj.replace(/\D/g, "").length} title="Buscar dados do CNPJ">
                    {loadingCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label>Responsável</Label>
                <Select value={companyForm.assigned_to} onValueChange={v => setCompanyForm(p => ({ ...p, assigned_to: v === "__none__" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder={loadingMembers ? "Carregando..." : "Selecionar"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {orgMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Endereço</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Logradouro</Label>
                  <Input value={companyForm.address} onChange={e => setCompanyForm(p => ({ ...p, address: e.target.value }))} placeholder="Rua, nº, complemento" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={companyForm.city} onChange={e => setCompanyForm(p => ({ ...p, city: e.target.value }))} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={companyForm.state} onChange={e => setCompanyForm(p => ({ ...p, state: e.target.value }))} maxLength={2} />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input value={companyForm.zip_code} onChange={e => setCompanyForm(p => ({ ...p, zip_code: e.target.value }))} placeholder="00000-000" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium">Contato</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={companyForm.contact_name} onChange={e => setCompanyForm(p => ({ ...p, contact_name: e.target.value }))} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={companyForm.contact_phone} onChange={e => setCompanyForm(p => ({ ...p, contact_phone: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label>Email</Label>
                  <Input value={companyForm.contact_email} onChange={e => setCompanyForm(p => ({ ...p, contact_email: e.target.value }))} />
                </div>
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={companyForm.notes} onChange={e => setCompanyForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCompanyDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateCompany} disabled={createCompany.isPending}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Company Detail Dialog */}
      <Dialog open={showCompanyDetailDialog} onOpenChange={v => { setShowCompanyDetailDialog(v); if (!v) { setSelectedCompanyId(null); setEditMode(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedCompany?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <Tabs defaultValue="info" className="mt-2">
              <TabsList className="w-full flex flex-wrap h-auto gap-1">
                <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs">Tarefas ({tasks.length})</TabsTrigger>
                <TabsTrigger value="documents" className="text-xs">
                  <Paperclip className="h-3 w-3 mr-1" /> Docs ({documents.length})
                </TabsTrigger>
                <TabsTrigger value="notes" className="text-xs">
                  <StickyNote className="h-3 w-3 mr-1" /> Notas ({notes.length})
                </TabsTrigger>
                <TabsTrigger value="whatsapp" className="text-xs">
                  <MessageSquare className="h-3 w-3 mr-1" /> WhatsApp
                </TabsTrigger>
                <TabsTrigger value="meetings" className="text-xs">Reuniões ({meetings.length})</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                {editMode ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label>Nome *</Label>
                        <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div>
                        <Label>CNPJ</Label>
                        <Input value={editForm.cnpj} onChange={e => setEditForm(p => ({ ...p, cnpj: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Responsável</Label>
                        <Select value={editForm.assigned_to} onValueChange={v => setEditForm(p => ({ ...p, assigned_to: v }))}>
                          <SelectTrigger><SelectValue placeholder={loadingMembers ? "Carregando..." : "Selecionar"} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhum</SelectItem>
                            {orgMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="border-t pt-3 space-y-3">
                      <p className="text-sm font-medium flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Endereço</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <Label>Logradouro</Label>
                          <Input value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} />
                        </div>
                        <div><Label>Cidade</Label><Input value={editForm.city} onChange={e => setEditForm(p => ({ ...p, city: e.target.value }))} /></div>
                        <div><Label>UF</Label><Input value={editForm.state} onChange={e => setEditForm(p => ({ ...p, state: e.target.value }))} maxLength={2} /></div>
                        <div><Label>CEP</Label><Input value={editForm.zip_code} onChange={e => setEditForm(p => ({ ...p, zip_code: e.target.value }))} /></div>
                      </div>
                    </div>
                    <div className="border-t pt-3 space-y-3">
                      <p className="text-sm font-medium">Contato</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Nome</Label><Input value={editForm.contact_name} onChange={e => setEditForm(p => ({ ...p, contact_name: e.target.value }))} /></div>
                        <div><Label>Telefone</Label><Input value={editForm.contact_phone} onChange={e => setEditForm(p => ({ ...p, contact_phone: e.target.value }))} /></div>
                        <div className="col-span-2"><Label>Email</Label><Input value={editForm.contact_email} onChange={e => setEditForm(p => ({ ...p, contact_email: e.target.value }))} /></div>
                      </div>
                    </div>
                    <div>
                      <Label>Observações</Label>
                      <Textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={handleSaveEdit} disabled={updateCompany.isPending || !editForm.name.trim()}>Salvar</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedCompany.cnpj && (
                        <div>
                          <Label className="text-xs text-muted-foreground">CNPJ</Label>
                          <p className="text-sm">{selectedCompany.cnpj}</p>
                        </div>
                      )}
                      {selectedCompany.assigned_to_name && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Responsável</Label>
                          <p className="text-sm">{selectedCompany.assigned_to_name}</p>
                        </div>
                      )}
                    </div>
                    {((selectedCompany as any).address || (selectedCompany as any).city) && (
                      <div className="border rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Endereço</p>
                        {(selectedCompany as any).address && <p className="text-sm">{(selectedCompany as any).address}</p>}
                        <p className="text-sm text-muted-foreground">
                          {[(selectedCompany as any).city, (selectedCompany as any).state].filter(Boolean).join(" / ")}
                          {(selectedCompany as any).zip_code && ` — CEP ${(selectedCompany as any).zip_code}`}
                        </p>
                      </div>
                    )}
                    {(selectedCompany.contact_name || selectedCompany.contact_phone || selectedCompany.contact_email) && (
                      <div className="border rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium">Contato</p>
                        {selectedCompany.contact_name && (
                          <div className="flex items-center gap-2 text-sm"><User className="h-3.5 w-3.5 text-muted-foreground" /> {selectedCompany.contact_name}</div>
                        )}
                        {selectedCompany.contact_phone && (
                          <div className="flex items-center gap-2 text-sm"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {selectedCompany.contact_phone}</div>
                        )}
                        {selectedCompany.contact_email && (
                          <div className="flex items-center gap-2 text-sm"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {selectedCompany.contact_email}</div>
                        )}
                      </div>
                    )}
                    {selectedCompany.notes && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Observações</Label>
                        <p className="text-sm whitespace-pre-wrap">{selectedCompany.notes}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={handleStartEdit}>
                        <Edit className="h-4 w-4 mr-1" /> Editar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm({ type: "company", id: selectedCompany.id, name: selectedCompany.name })}>
                        <Trash2 className="h-4 w-4 mr-1" /> Excluir
                      </Button>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="space-y-3 mt-4">
                <Button size="sm" onClick={() => setShowNewTaskDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Nova Tarefa
                </Button>
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                      <Checkbox
                        checked={task.status === "completed"}
                        onCheckedChange={() => handleToggleTask(task.id, task.status)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm", task.status === "completed" && "line-through text-muted-foreground")}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className={cn("text-[10px] h-4", priorityColors[task.priority])}>
                            {task.priority}
                          </Badge>
                          {task.due_date && <span>{safeFormatDate(task.due_date, "dd/MM/yyyy")}</span>}
                          {task.assigned_to_name && <span>{task.assigned_to_name}</span>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setDeleteConfirm({ type: "task", id: task.id, name: task.title })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {tasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa</p>}
                </div>
              </TabsContent>

              <TabsContent value="whatsapp" className="space-y-4 mt-4">
                {!selectedCompany.contact_phone ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Adicione um telefone de contato para agendar mensagens WhatsApp
                  </p>
                ) : (
                  <>
                    {/* Schedule form */}
                    <div className="border rounded-lg p-3 space-y-3">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Send className="h-4 w-4" /> Agendar Mensagem
                      </p>
                      <Textarea
                        placeholder="Digite a mensagem..."
                        value={whatsappForm.content}
                        onChange={e => setWhatsappForm(p => ({ ...p, content: e.target.value }))}
                        rows={3}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Data</Label>
                          <Input type="date" value={whatsappForm.scheduled_at} onChange={e => setWhatsappForm(p => ({ ...p, scheduled_at: e.target.value }))} />
                        </div>
                        <div>
                          <Label className="text-xs">Hora</Label>
                          <Input type="time" value={whatsappForm.scheduled_time} onChange={e => setWhatsappForm(p => ({ ...p, scheduled_time: e.target.value }))} />
                        </div>
                      </div>
                      <Button size="sm" onClick={handleScheduleWhatsapp} disabled={scheduleWhatsapp.isPending || !whatsappForm.content || !whatsappForm.scheduled_at}>
                        <Send className="h-4 w-4 mr-1" /> Agendar Envio
                      </Button>
                    </div>

                    {/* Scheduled list */}
                    {scheduledMessages.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Agendamentos pendentes</p>
                        {scheduledMessages.map((sm: any) => (
                          <div key={sm.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                            <Clock className="h-4 w-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate">{sm.content}</p>
                              <p className="text-xs text-muted-foreground">{safeFormatDate(sm.scheduled_at, "dd/MM/yyyy HH:mm")}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => cancelScheduled.mutate(sm.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="space-y-3 mt-4">
                <div>
                  <input
                    type="file"
                    id="homolog-doc-upload"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadDocument(file);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" onClick={() => document.getElementById("homolog-doc-upload")?.click()} disabled={isUploading}>
                    <Upload className="h-4 w-4 mr-1" /> {isUploading ? "Enviando..." : "Enviar Documento"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate block">
                          {doc.name}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          {doc.uploaded_by_name && <span>{doc.uploaded_by_name} • </span>}
                          {safeFormatDate(doc.created_at, "dd/MM/yyyy HH:mm")}
                          {doc.size && <span> • {(doc.size / 1024).toFixed(0)}KB</span>}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                        onClick={() => deleteDocument.mutate(doc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {documents.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento</p>}
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="space-y-3 mt-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Adicionar nota..."
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <Button size="sm" className="self-end" onClick={handleAddNote} disabled={createNote.isPending || !noteContent.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {notes.map((note: any) => (
                    <div key={note.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground font-medium">{note.user_name} • {safeFormatDate(note.created_at, "dd/MM/yyyy HH:mm")}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => deleteNote.mutate(note.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma nota</p>}
                </div>
              </TabsContent>

              <TabsContent value="meetings" className="space-y-3 mt-4">
                <Button size="sm" onClick={() => setShowNewMeetingDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Nova Reunião
                </Button>
                <div className="space-y-2">
                  {meetings.map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                      <Presentation className="h-4 w-4 text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {safeFormatDate(m.meeting_date, "dd/MM/yyyy")} {m.start_time?.substring(0,5)}
                          {m.location && <span> • {m.location}</span>}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{m.status}</Badge>
                    </div>
                  ))}
                  {meetings.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma reunião</p>}
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-3 mt-4">
                <div className="space-y-3">
                  {history.map(h => (
                    <div key={h.id} className="flex gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <p><span className="font-medium">{h.user_name}</span> — {h.details}</p>
                        <p className="text-xs text-muted-foreground">{safeFormatDate(h.created_at, "dd/MM/yyyy HH:mm")}</p>
                      </div>
                    </div>
                  ))}
                  {history.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem histórico</p>}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* New Task Dialog */}
      <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prioridade</Label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prazo</Label>
                <Input type="date" value={taskForm.due_date} onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={taskForm.assigned_to} onValueChange={v => setTaskForm(p => ({ ...p, assigned_to: v === "__none__" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder={loadingMembers ? "Carregando..." : "Selecionar"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {orgMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTaskDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateTask} disabled={createTask.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Meeting Dialog */}
      <Dialog open={showNewMeetingDialog} onOpenChange={setShowNewMeetingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Reunião</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input value={meetingForm.title} onChange={e => setMeetingForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Kickoff de homologação" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={meetingForm.description} onChange={e => setMeetingForm(p => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={meetingForm.meeting_date} onChange={e => setMeetingForm(p => ({ ...p, meeting_date: e.target.value }))} />
              </div>
              <div>
                <Label>Início *</Label>
                <Input type="time" value={meetingForm.start_time} onChange={e => setMeetingForm(p => ({ ...p, start_time: e.target.value }))} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={meetingForm.end_time} onChange={e => setMeetingForm(p => ({ ...p, end_time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Local</Label>
              <Input value={meetingForm.location} onChange={e => setMeetingForm(p => ({ ...p, location: e.target.value }))} placeholder="Sala, endereço ou link" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewMeetingDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateMeeting} disabled={createMeeting.isPending}>Agendar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showStageSettings} onOpenChange={setShowStageSettings}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerenciar Fases</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {stages.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-2 rounded border">
                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="flex-1 text-sm">{s.name}</span>
                {s.is_final && <Badge variant="default" className="text-[10px] bg-green-600">Final</Badge>}
                <span className="text-xs text-muted-foreground">{s.company_count} empresas</span>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setDeleteConfirm({ type: "stage", id: s.id, name: s.name })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowNewStageDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Fase
          </Button>
        </DialogContent>
      </Dialog>

      {/* New Stage Dialog */}
      <Dialog open={showNewStageDialog} onOpenChange={setShowNewStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Fase</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={newStageName} onChange={e => setNewStageName(e.target.value)} />
            </div>
            <div>
              <Label>Cor</Label>
              <Input type="color" value={newStageColor} onChange={e => setNewStageColor(e.target.value)} className="h-10 w-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewStageDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddStage}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir "{deleteConfirm?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
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
