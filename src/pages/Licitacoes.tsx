import { useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn, safeFormatDate } from "@/lib/utils";
import {
  Plus, Search, Settings, Trash2, Edit, FileText, Calendar,
  ClipboardList, User, Phone, Mail, Upload, StickyNote,
  History, CheckSquare, ExternalLink, Loader2, Gavel, GripVertical, ArrowUp, ArrowDown, Check, X, MessageCircle, UserPlus, Trophy, XCircle, Briefcase, Link2
} from "lucide-react";
import {
  useLicitacaoBoards, useCreateLicitacaoBoard, useDeleteLicitacaoBoard,
  useLicitacaoStages, useCreateLicitacaoStage, useDeleteLicitacaoStage, useUpdateLicitacaoStage, useReorderLicitacaoStages,
  useLicitacoes, useCreateLicitacao, useUpdateLicitacao, useDeleteLicitacao,
  useLicitacaoTasks, useCreateLicitacaoTask, useUpdateLicitacaoTask, useDeleteLicitacaoTask,
  useLicitacaoChecklist, useCreateLicitacaoChecklistItem, useUpdateLicitacaoChecklistItem, useDeleteLicitacaoChecklistItem,
  useLicitacaoDocuments, useCreateLicitacaoDocument, useDeleteLicitacaoDocument,
  useLicitacaoNotes, useCreateLicitacaoNote, useDeleteLicitacaoNote,
  useLicitacaoHistory, useLicitacaoOrgMembers, useSearchLicitacaoContacts, useCreateDealFromLicitacao,
  Licitacao, LicitacaoStage, LicitacaoContact,
} from "@/hooks/use-licitacao";
import { useCRMFunnels, useCRMCompanies, useCRMDeal, useCRMFunnel, useCRMDealMutations } from "@/hooks/use-crm";
import { useUpload } from "@/hooks/use-upload";
import { useAuth } from "@/contexts/AuthContext";
import { LicitacaoKanban } from "@/components/licitacao/LicitacaoKanban";

const MODALITIES = [
  "Pregão Eletrônico", "Pregão Presencial", "Concorrência", "Tomada de Preços",
  "Convite", "Leilão", "Concurso", "Dispensa", "Inexigibilidade", "RDC", "Outro"
];

function ContactSelector({ value, contactName, contactPhone, onSelect, onClear, searchResults, onSearch }: {
  value: string; contactName: string; contactPhone: string;
  onSelect: (c: LicitacaoContact) => void; onClear: () => void;
  searchResults: LicitacaoContact[]; onSearch: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  if (value && contactName) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
        <User className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contactName}</p>
          {contactPhone && <p className="text-xs text-muted-foreground">{contactPhone}</p>}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}><X className="h-3 w-3" /></Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Buscar contato pelo nome ou telefone..."
        value={q}
        onChange={e => { setQ(e.target.value); onSearch(e.target.value); setOpen(true); }}
        onFocus={() => { if (q.length >= 1) setOpen(true); }}
      />
      {open && q.length >= 1 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Nenhum contato encontrado</p>
          ) : (
            searchResults.map(c => (
              <button key={c.id} className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left"
                onClick={() => { onSelect(c); setQ(""); setOpen(false); }}>
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StageSettingsRow({ stage, index, total, onUpdate, onMoveUp, onMoveDown, onDelete }: {
  stage: LicitacaoStage; index: number; total: number;
  onUpdate: (data: { name?: string; color?: string }) => Promise<void>;
  onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);

  const handleSave = async () => {
    if (!name.trim()) return;
    await onUpdate({ name: name.trim(), color });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded border border-primary/30 bg-muted/30">
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 p-0" />
        <Input value={name} onChange={e => setName(e.target.value)} className="h-8 flex-1 text-sm" onKeyDown={e => e.key === "Enter" && handleSave()} />
        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={handleSave}><Check className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setName(stage.name); setColor(stage.color); setEditing(false); }}><X className="h-3.5 w-3.5" /></Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded border group hover:bg-muted/30">
      <div className="flex flex-col gap-0.5">
        <Button variant="ghost" size="icon" className="h-5 w-5" disabled={index === 0} onClick={onMoveUp}><ArrowUp className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-5 w-5" disabled={index === total - 1} onClick={onMoveDown}><ArrowDown className="h-3 w-3" /></Button>
      </div>
      <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
      <span className="flex-1 text-sm">{stage.name}</span>
      {stage.is_final && <Badge variant="default" className="text-[10px] bg-green-600">Final</Badge>}
      <span className="text-xs text-muted-foreground">{stage.item_count}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => setEditing(true)}><Edit className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  );
}

export default function Licitacoes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showNewBoardDialog, setShowNewBoardDialog] = useState(false);
  const [showNewItemDialog, setShowNewItemDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [showStageSettings, setShowStageSettings] = useState(false);
  const [showNewStageDialog, setShowNewStageDialog] = useState(false);
  const [showCreateDealDialog, setShowCreateDealDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Form states
  const [boardName, setBoardName] = useState("");
  const [itemForm, setItemForm] = useState({
    title: "", description: "", edital_number: "", edital_url: "", modality: "",
    opening_date: "", deadline_date: "", result_date: "", estimated_value: "",
    entity_name: "", entity_cnpj: "", entity_contact: "", entity_phone: "", entity_email: "",
    assigned_to: "", notes: "", contact_id: "", contact_name: "", contact_phone: ""
  });
  const [editForm, setEditForm] = useState({ ...itemForm });
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [taskForm, setTaskForm] = useState({ title: "", description: "", priority: "medium", due_date: "", assigned_to: "" });
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#6366f1");
  const [noteContent, setNoteContent] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [dealForm, setDealForm] = useState({ funnel_id: "", company_id: "", title: "", value: "" });
  const [companySearch, setCompanySearch] = useState("");
  const taskCreatingRef = useRef(false);

  // Data
  const { data: boards = [] } = useLicitacaoBoards();
  const activeBoardId = selectedBoardId || boards[0]?.id || null;
  const { data: stages = [] } = useLicitacaoStages(activeBoardId);
  const { data: items = [] } = useLicitacoes(activeBoardId);
  const { data: tasks = [] } = useLicitacaoTasks(selectedItemId);
  const { data: checklist = [] } = useLicitacaoChecklist(selectedItemId);
  const { data: documents = [] } = useLicitacaoDocuments(selectedItemId);
  const { data: notes = [] } = useLicitacaoNotes(selectedItemId);
  const { data: history = [] } = useLicitacaoHistory(selectedItemId);
  const { data: orgMembers = [], isLoading: loadingMembers } = useLicitacaoOrgMembers();
  const { uploadFile, isUploading } = useUpload();
  const { data: contactResults = [] } = useSearchLicitacaoContacts(contactSearchTerm);
  const { data: crmFunnels = [] } = useCRMFunnels();
  const { data: crmCompanies = [] } = useCRMCompanies(companySearch);
  const selectedItem = useMemo(() => items.find(i => i.id === selectedItemId), [items, selectedItemId]);
  const linkedDealId = selectedItem?.linked_deal_id || null;
  const { data: linkedDeal } = useCRMDeal(linkedDealId);
  const linkedFunnelId = linkedDeal?.funnel_id || null;
  const { data: linkedFunnel } = useCRMFunnel(linkedFunnelId);
  const { moveDeal: moveCrmDeal, updateDeal: updateCrmDeal } = useCRMDealMutations();
  // Mutations
  const createBoard = useCreateLicitacaoBoard();
  const deleteBoard = useDeleteLicitacaoBoard();
  const createStage = useCreateLicitacaoStage();
  const deleteStage = useDeleteLicitacaoStage();
  const updateStage = useUpdateLicitacaoStage();
  const reorderStages = useReorderLicitacaoStages();
  const createItem = useCreateLicitacao();
  const updateItem = useUpdateLicitacao();
  const deleteItem = useDeleteLicitacao();
  const createTask = useCreateLicitacaoTask();
  const updateTask = useUpdateLicitacaoTask();
  const deleteTask = useDeleteLicitacaoTask();
  const createChecklistItem = useCreateLicitacaoChecklistItem();
  const updateChecklistItem = useUpdateLicitacaoChecklistItem();
  const deleteChecklistItem = useDeleteLicitacaoChecklistItem();
  const createDocument = useCreateLicitacaoDocument();
  const deleteDocument = useDeleteLicitacaoDocument();
  const createNote = useCreateLicitacaoNote();
  const deleteNote = useDeleteLicitacaoNote();
  const createDealFromLicitacao = useCreateDealFromLicitacao();

  const itemsByStage = useMemo(() => {
    const map: Record<string, Licitacao[]> = {};
    stages.forEach(s => { map[s.id] = []; });
    items
      .filter(i => !searchTerm || i.title.toLowerCase().includes(searchTerm.toLowerCase()) || i.edital_number?.toLowerCase().includes(searchTerm.toLowerCase()))
      .forEach(i => { if (i.stage_id && map[i.stage_id]) map[i.stage_id].push(i); });
    return map;
  }, [items, stages, searchTerm]);

  const resetItemForm = () => setItemForm({ title: "", description: "", edital_number: "", edital_url: "", modality: "", opening_date: "", deadline_date: "", result_date: "", estimated_value: "", entity_name: "", entity_cnpj: "", entity_contact: "", entity_phone: "", entity_email: "", assigned_to: "", notes: "", contact_id: "", contact_name: "", contact_phone: "" });

  const handleCreateBoard = async () => {
    if (!boardName.trim()) return;
    try {
      const result = await createBoard.mutateAsync({ name: boardName });
      setSelectedBoardId(result.id);
      setBoardName("");
      setShowNewBoardDialog(false);
      toast({ title: "Quadro criado!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleCreateItem = async () => {
    if (!itemForm.title.trim() || !activeBoardId) return;
    try {
      await createItem.mutateAsync({
        boardId: activeBoardId, ...itemForm,
        assigned_to: itemForm.assigned_to && itemForm.assigned_to !== "__none__" ? itemForm.assigned_to : undefined,
        estimated_value: itemForm.estimated_value ? Number(itemForm.estimated_value) : undefined,
      });
      resetItemForm();
      setShowNewItemDialog(false);
      toast({ title: "Licitação adicionada!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleStartEdit = () => {
    if (!selectedItem) return;
    setEditForm({
      title: selectedItem.title || "", description: selectedItem.description || "",
      edital_number: selectedItem.edital_number || "", edital_url: selectedItem.edital_url || "",
      modality: selectedItem.modality || "",
      opening_date: selectedItem.opening_date?.split("T")[0] || "",
      deadline_date: selectedItem.deadline_date?.split("T")[0] || "",
      result_date: selectedItem.result_date?.split("T")[0] || "",
      estimated_value: String(selectedItem.estimated_value || ""),
      entity_name: selectedItem.entity_name || "", entity_cnpj: selectedItem.entity_cnpj || "",
      entity_contact: selectedItem.entity_contact || "", entity_phone: selectedItem.entity_phone || "",
      entity_email: selectedItem.entity_email || "",
      assigned_to: selectedItem.assigned_to || "", notes: selectedItem.notes || "",
      contact_id: selectedItem.contact_id || "", contact_name: selectedItem.contact_name || "", contact_phone: selectedItem.contact_phone || "",
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedItemId || !editForm.title.trim()) return;
    try {
      await updateItem.mutateAsync({
        id: selectedItemId, ...editForm,
        assigned_to: editForm.assigned_to && editForm.assigned_to !== "__none__" ? editForm.assigned_to : null,
        estimated_value: editForm.estimated_value ? Number(editForm.estimated_value) : 0,
      });
      setEditMode(false);
      toast({ title: "Licitação atualizada!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleMoveItem = async (itemId: string, newStageId: string) => {
    try { await updateItem.mutateAsync({ id: itemId, stage_id: newStageId }); }
    catch (e: any) { toast({ title: "Erro ao mover", description: e.message, variant: "destructive" }); }
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim() || !selectedItemId || taskCreatingRef.current) return;
    taskCreatingRef.current = true;
    try {
      await createTask.mutateAsync({
        licitacaoId: selectedItemId, ...taskForm,
        assigned_to: taskForm.assigned_to && taskForm.assigned_to !== "__none__" ? taskForm.assigned_to : undefined,
        due_date: taskForm.due_date || undefined,
      });
      setTaskForm({ title: "", description: "", priority: "medium", due_date: "", assigned_to: "" });
      setShowNewTaskDialog(false);
      toast({ title: "Tarefa criada!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    finally { taskCreatingRef.current = false; }
  };

  const handleAddChecklistItem = async () => {
    if (!checklistTitle.trim() || !selectedItemId) return;
    try {
      await createChecklistItem.mutateAsync({ licitacaoId: selectedItemId, title: checklistTitle });
      setChecklistTitle("");
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleUploadDocument = async (file: File) => {
    if (!selectedItemId) return;
    try {
      const url = await uploadFile(file);
      if (url) {
        await createDocument.mutateAsync({ licitacaoId: selectedItemId, name: file.name, url, mimetype: file.type, size: file.size });
        toast({ title: "Documento enviado!" });
      }
    } catch (e: any) { toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" }); }
  };

  const handleUploadEdital = async (file: File, target: "create" | "edit") => {
    try {
      const url = await uploadFile(file);
      if (url) {
        if (target === "create") {
          setItemForm(p => ({ ...p, edital_url: url }));
        } else {
          setEditForm(p => ({ ...p, edital_url: url }));
        }
        toast({ title: "Edital enviado!" });
      }
    } catch (e: any) { toast({ title: "Erro ao enviar edital", description: e.message, variant: "destructive" }); }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim() || !selectedItemId) return;
    try {
      await createNote.mutateAsync({ licitacaoId: selectedItemId, content: noteContent });
      setNoteContent("");
      toast({ title: "Nota adicionada!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleChangeStatus = async (status: string) => {
    if (!selectedItemId) return;
    try {
      await updateItem.mutateAsync({ id: selectedItemId, status });
      toast({ title: status === "won" ? "Licitação ganha! 🎉" : status === "lost" ? "Licitação perdida" : "Status atualizado" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const handleCreateDeal = async () => {
    if (!selectedItemId || !dealForm.funnel_id || !dealForm.company_id) return;
    try {
      await createDealFromLicitacao.mutateAsync({
        licitacaoId: selectedItemId,
        funnel_id: dealForm.funnel_id,
        company_id: dealForm.company_id,
        title: dealForm.title || undefined,
        value: dealForm.value ? Number(dealForm.value) : undefined,
      });
      setDealForm({ funnel_id: "", company_id: "", title: "", value: "" });
      setShowCreateDealDialog(false);
      toast({ title: "Negociação CRM criada e vinculada!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const openCreateDealDialog = () => {
    if (selectedItem) {
      setDealForm({
        funnel_id: "",
        company_id: "",
        title: selectedItem.title,
        value: String(selectedItem.estimated_value || ""),
      });
    }
    setShowCreateDealDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === "board") await deleteBoard.mutateAsync(deleteConfirm.id);
      if (deleteConfirm.type === "item") { await deleteItem.mutateAsync(deleteConfirm.id); setShowDetailDialog(false); }
      if (deleteConfirm.type === "task") await deleteTask.mutateAsync(deleteConfirm.id);
      if (deleteConfirm.type === "stage") await deleteStage.mutateAsync(deleteConfirm.id);
      toast({ title: "Removido!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
    setDeleteConfirm(null);
  };

  const handleAddStage = async () => {
    if (!newStageName.trim() || !activeBoardId) return;
    try {
      await createStage.mutateAsync({ boardId: activeBoardId, name: newStageName, color: newStageColor });
      setNewStageName("");
      setShowNewStageDialog(false);
      toast({ title: "Fase adicionada!" });
    } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
  };

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    high: "bg-destructive/10 text-destructive",
  };

  const ResponsavelSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={v => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder={loadingMembers ? "Carregando..." : "Selecionar"} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Nenhum</SelectItem>
        {orgMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Top bar */}
        <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {boards.length > 0 && (
              <Select value={activeBoardId || ""} onValueChange={setSelectedBoardId}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecionar quadro" /></SelectTrigger>
                <SelectContent>
                  {boards.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
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
                <Trash2 className="h-4 w-4 mr-1" /> Apagar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar licitação..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 w-[200px]" />
            </div>
            {activeBoardId && (
              <>
                <Button size="sm" onClick={() => setShowNewItemDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Nova Licitação
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowStageSettings(true)}>
                  <Settings className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        {!activeBoardId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <Gavel className="h-12 w-12 mx-auto opacity-40" />
              <p>Crie seu primeiro quadro de licitação</p>
              {isAdmin && <Button onClick={() => setShowNewBoardDialog(true)}><Plus className="h-4 w-4 mr-1" /> Criar Quadro</Button>}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto">
            <LicitacaoKanban
              stages={stages}
              itemsByStage={itemsByStage}
              onItemClick={item => { setSelectedItemId(item.id); setShowDetailDialog(true); }}
              onMoveItem={handleMoveItem}
              onDeleteItem={item => setDeleteConfirm({ type: "item", id: item.id, name: item.title })}
            />
          </div>
        )}
      </div>

      {/* New Board Dialog */}
      <Dialog open={showNewBoardDialog} onOpenChange={setShowNewBoardDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Quadro de Licitação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Quadro</Label>
              <Input value={boardName} onChange={e => setBoardName(e.target.value)} placeholder="Ex: Licitações 2025" />
            </div>
            <p className="text-xs text-muted-foreground">Fases padrão serão criadas automaticamente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBoardDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateBoard} disabled={createBoard.isPending}>Criar Quadro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Item Dialog */}
      <Dialog open={showNewItemDialog} onOpenChange={setShowNewItemDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>Nova Licitação</DialogTitle></DialogHeader>
          <ScrollArea className="flex-1 overflow-y-auto max-h-[calc(85vh-130px)] pr-2">
            <div className="space-y-4">
              <div>
                <Label>Título *</Label>
                <Input value={itemForm.title} onChange={e => setItemForm(p => ({ ...p, title: e.target.value }))} placeholder="Ex: Pregão Eletrônico nº 001/2025" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nº do Edital</Label>
                  <Input value={itemForm.edital_number} onChange={e => setItemForm(p => ({ ...p, edital_number: e.target.value }))} placeholder="001/2025" />
                </div>
                <div>
                  <Label>Modalidade</Label>
                  <Select value={itemForm.modality} onValueChange={v => setItemForm(p => ({ ...p, modality: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {MODALITIES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor Estimado</Label>
                  <Input type="number" value={itemForm.estimated_value} onChange={e => setItemForm(p => ({ ...p, estimated_value: e.target.value }))} placeholder="0,00" />
                </div>
                <div>
                  <Label>Responsável</Label>
                  <ResponsavelSelect value={itemForm.assigned_to} onChange={v => setItemForm(p => ({ ...p, assigned_to: v }))} />
                </div>
              </div>
              <div>
                <Label>Contato Vinculado</Label>
                <ContactSelector
                  value={itemForm.contact_id} contactName={itemForm.contact_name} contactPhone={itemForm.contact_phone}
                  onSelect={c => setItemForm(p => ({ ...p, contact_id: c.id, contact_name: c.name, contact_phone: c.phone }))}
                  onClear={() => setItemForm(p => ({ ...p, contact_id: "", contact_name: "", contact_phone: "" }))}
                  searchResults={contactResults} onSearch={setContactSearchTerm}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Abertura</Label><Input type="date" value={itemForm.opening_date} onChange={e => setItemForm(p => ({ ...p, opening_date: e.target.value }))} /></div>
                <div><Label>Prazo</Label><Input type="date" value={itemForm.deadline_date} onChange={e => setItemForm(p => ({ ...p, deadline_date: e.target.value }))} /></div>
                <div><Label>Resultado</Label><Input type="date" value={itemForm.result_date} onChange={e => setItemForm(p => ({ ...p, result_date: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Arquivo do Edital</Label>
                <div className="space-y-2">
                  <input type="file" id="edital-create-upload" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadEdital(f, "create"); e.target.value = ""; }} />
                  {itemForm.edital_url ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <a href={itemForm.edital_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                        Edital enviado
                      </a>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setItemForm(p => ({ ...p, edital_url: "" }))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => document.getElementById("edital-create-upload")?.click()} disabled={isUploading}>
                      <Upload className="h-4 w-4 mr-1" /> {isUploading ? "Enviando..." : "Enviar Edital"}
                    </Button>
                  )}
                </div>
              </div>
              <div className="border-t pt-3 space-y-3">
                <p className="text-sm font-medium">Órgão / Entidade</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Nome</Label><Input value={itemForm.entity_name} onChange={e => setItemForm(p => ({ ...p, entity_name: e.target.value }))} /></div>
                  <div><Label>CNPJ</Label><Input value={itemForm.entity_cnpj} onChange={e => setItemForm(p => ({ ...p, entity_cnpj: e.target.value }))} /></div>
                  <div><Label>Contato</Label><Input value={itemForm.entity_contact} onChange={e => setItemForm(p => ({ ...p, entity_contact: e.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={itemForm.entity_phone} onChange={e => setItemForm(p => ({ ...p, entity_phone: e.target.value }))} /></div>
                  <div><Label>Email</Label><Input value={itemForm.entity_email} onChange={e => setItemForm(p => ({ ...p, entity_email: e.target.value }))} /></div>
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={itemForm.notes} onChange={e => setItemForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewItemDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateItem} disabled={createItem.isPending}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={v => { setShowDetailDialog(v); if (!v) { setSelectedItemId(null); setEditMode(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              {selectedItem?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <Tabs defaultValue="info" className="mt-2">
              <TabsList className="w-full flex flex-wrap h-auto gap-1">
                <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs">Tarefas ({tasks.length})</TabsTrigger>
                <TabsTrigger value="checklist" className="text-xs"><CheckSquare className="h-3 w-3 mr-1" /> Checklist ({checklist.length})</TabsTrigger>
                <TabsTrigger value="documents" className="text-xs">Docs ({documents.length})</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs">Notas ({notes.length})</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">Histórico</TabsTrigger>
              </TabsList>

              {/* INFO TAB */}
              <TabsContent value="info" className="space-y-4 mt-4">
                {editMode ? (
                  <div className="space-y-4">
                    <div><Label>Título *</Label><Input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Nº Edital</Label><Input value={editForm.edital_number} onChange={e => setEditForm(p => ({ ...p, edital_number: e.target.value }))} /></div>
                      <div><Label>Modalidade</Label>
                        <Select value={editForm.modality} onValueChange={v => setEditForm(p => ({ ...p, modality: v }))}>
                          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>{MODALITIES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>Valor Estimado</Label><Input type="number" value={editForm.estimated_value} onChange={e => setEditForm(p => ({ ...p, estimated_value: e.target.value }))} /></div>
                      <div><Label>Responsável</Label><ResponsavelSelect value={editForm.assigned_to} onChange={v => setEditForm(p => ({ ...p, assigned_to: v }))} /></div>
                    </div>
                    <div>
                      <Label>Contato Vinculado</Label>
                      <ContactSelector
                        value={editForm.contact_id} contactName={editForm.contact_name} contactPhone={editForm.contact_phone}
                        onSelect={c => setEditForm(p => ({ ...p, contact_id: c.id, contact_name: c.name, contact_phone: c.phone }))}
                        onClear={() => setEditForm(p => ({ ...p, contact_id: "", contact_name: "", contact_phone: "" }))}
                        searchResults={contactResults} onSearch={setContactSearchTerm}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><Label>Abertura</Label><Input type="date" value={editForm.opening_date} onChange={e => setEditForm(p => ({ ...p, opening_date: e.target.value }))} /></div>
                      <div><Label>Prazo</Label><Input type="date" value={editForm.deadline_date} onChange={e => setEditForm(p => ({ ...p, deadline_date: e.target.value }))} /></div>
                      <div><Label>Resultado</Label><Input type="date" value={editForm.result_date} onChange={e => setEditForm(p => ({ ...p, result_date: e.target.value }))} /></div>
                    </div>
                    <div>
                      <Label>Arquivo do Edital</Label>
                      <div className="space-y-2">
                        <input type="file" id="edital-edit-upload" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadEdital(f, "edit"); e.target.value = ""; }} />
                        {editForm.edital_url ? (
                          <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <a href={editForm.edital_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate flex-1">
                              Edital enviado
                            </a>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditForm(p => ({ ...p, edital_url: "" }))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" className="w-full" onClick={() => document.getElementById("edital-edit-upload")?.click()} disabled={isUploading}>
                            <Upload className="h-4 w-4 mr-1" /> {isUploading ? "Enviando..." : "Enviar Edital"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="border-t pt-3 space-y-3">
                      <p className="text-sm font-medium">Órgão / Entidade</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2"><Label>Nome</Label><Input value={editForm.entity_name} onChange={e => setEditForm(p => ({ ...p, entity_name: e.target.value }))} /></div>
                        <div><Label>CNPJ</Label><Input value={editForm.entity_cnpj} onChange={e => setEditForm(p => ({ ...p, entity_cnpj: e.target.value }))} /></div>
                        <div><Label>Contato</Label><Input value={editForm.entity_contact} onChange={e => setEditForm(p => ({ ...p, entity_contact: e.target.value }))} /></div>
                        <div><Label>Telefone</Label><Input value={editForm.entity_phone} onChange={e => setEditForm(p => ({ ...p, entity_phone: e.target.value }))} /></div>
                        <div><Label>Email</Label><Input value={editForm.entity_email} onChange={e => setEditForm(p => ({ ...p, entity_email: e.target.value }))} /></div>
                      </div>
                    </div>
                    <div><Label>Descrição</Label><Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
                    <div><Label>Observações</Label><Textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={handleSaveEdit} disabled={updateItem.isPending}>Salvar</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedItem.edital_number && <div><Label className="text-xs text-muted-foreground">Nº Edital</Label><p className="text-sm">{selectedItem.edital_number}</p></div>}
                      {selectedItem.modality && <div><Label className="text-xs text-muted-foreground">Modalidade</Label><p className="text-sm">{selectedItem.modality}</p></div>}
                      {Number(selectedItem.estimated_value) > 0 && <div><Label className="text-xs text-muted-foreground">Valor Estimado</Label><p className="text-sm font-medium">R$ {Number(selectedItem.estimated_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>}
                      {selectedItem.assigned_to_name && <div><Label className="text-xs text-muted-foreground">Responsável</Label><p className="text-sm">{selectedItem.assigned_to_name}</p></div>}
                    </div>
                    {selectedItem.contact_name && (
                      <div className="border rounded-lg p-3 space-y-2 bg-primary/5">
                        <p className="text-sm font-medium flex items-center gap-1.5"><UserPlus className="h-4 w-4 text-primary" /> Contato Vinculado</p>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{selectedItem.contact_name}</p>
                            {selectedItem.contact_phone && <p className="text-xs text-muted-foreground">{selectedItem.contact_phone}</p>}
                          </div>
                          {selectedItem.contact_phone && (
                            <Button size="sm" variant="outline" onClick={() => {
                              setShowDetailDialog(false);
                              navigate(`/chat?phone=${selectedItem.contact_phone}`);
                            }}>
                              <MessageCircle className="h-4 w-4 mr-1" /> Ir para Conversa
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4">
                      {selectedItem.opening_date && <div><Label className="text-xs text-muted-foreground">Abertura</Label><p className="text-sm">{safeFormatDate(selectedItem.opening_date, "dd/MM/yyyy")}</p></div>}
                      {selectedItem.deadline_date && <div><Label className="text-xs text-muted-foreground">Prazo</Label><p className={cn("text-sm", new Date(selectedItem.deadline_date) < new Date() && "text-destructive font-medium")}>{safeFormatDate(selectedItem.deadline_date, "dd/MM/yyyy")}</p></div>}
                      {selectedItem.result_date && <div><Label className="text-xs text-muted-foreground">Resultado</Label><p className="text-sm">{safeFormatDate(selectedItem.result_date, "dd/MM/yyyy")}</p></div>}
                    </div>
                    {selectedItem.edital_url && (
                      <div className="border rounded-lg p-3 space-y-2 bg-primary/5">
                        <p className="text-sm font-medium flex items-center gap-1.5"><FileText className="h-4 w-4 text-primary" /> Edital</p>
                        <a href={selectedItem.edital_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir Arquivo do Edital
                        </a>
                      </div>
                    )}
                    {selectedItem.entity_name && (
                      <div className="border rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium">Órgão / Entidade</p>
                        <p className="text-sm">{selectedItem.entity_name}</p>
                        {selectedItem.entity_cnpj && <p className="text-xs text-muted-foreground">CNPJ: {selectedItem.entity_cnpj}</p>}
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          {selectedItem.entity_contact && <span className="flex items-center gap-1"><User className="h-3 w-3" />{selectedItem.entity_contact}</span>}
                          {selectedItem.entity_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selectedItem.entity_phone}</span>}
                          {selectedItem.entity_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedItem.entity_email}</span>}
                        </div>
                      </div>
                    )}
                    {selectedItem.description && <div><Label className="text-xs text-muted-foreground">Descrição</Label><p className="text-sm whitespace-pre-wrap">{selectedItem.description}</p></div>}
                    {selectedItem.notes && <div><Label className="text-xs text-muted-foreground">Observações</Label><p className="text-sm whitespace-pre-wrap">{selectedItem.notes}</p></div>}
                    {/* Deal Link Section */}
                    <div className="border rounded-lg p-3 space-y-3">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Link2 className="h-4 w-4" /> Negociação CRM
                      </p>
                      {selectedItem.linked_deal_id && linkedDeal ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">Vinculada</Badge>
                            {linkedDeal.stage_name && (
                              <Badge variant="secondary" className="text-xs" style={{ borderColor: linkedDeal.stage_color || undefined }}>
                                {linkedDeal.stage_name}
                              </Badge>
                            )}
                            <Badge variant={linkedDeal.status === "won" ? "default" : linkedDeal.status === "lost" ? "destructive" : "secondary"} className={cn("text-xs", linkedDeal.status === "won" && "bg-green-600 hover:bg-green-700")}>
                              {linkedDeal.status === "won" ? "Ganha" : linkedDeal.status === "lost" ? "Perdida" : linkedDeal.status === "paused" ? "Pausada" : "Aberta"}
                            </Badge>
                            {Number(linkedDeal.value) > 0 && (
                              <span className="text-xs font-medium text-foreground ml-auto">
                                R$ {Number(linkedDeal.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                          {linkedFunnel?.stages && linkedFunnel.stages.length > 0 && linkedDeal.status === "open" && (
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">Mover para etapa:</Label>
                              <div className="flex flex-wrap gap-1.5">
                                {linkedFunnel.stages
                                  .sort((a, b) => a.position - b.position)
                                  .map(s => (
                                    <Button
                                      key={s.id}
                                      size="sm"
                                      variant={s.id === linkedDeal.stage_id ? "default" : "outline"}
                                      className="text-xs h-7 px-2"
                                      disabled={s.id === linkedDeal.stage_id}
                                      onClick={async () => {
                                        if (!s.id) return;
                                        try {
                                          await moveCrmDeal.mutateAsync({ id: linkedDeal.id, stage_id: s.id });
                                          toast({ title: `Negociação movida para ${s.name}` });
                                        } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
                                      }}
                                    >
                                      <div className="w-2 h-2 rounded-full mr-1 shrink-0" style={{ backgroundColor: s.color }} />
                                      {s.name}
                                    </Button>
                                  ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => {
                              setShowDetailDialog(false);
                              navigate(`/crm/negociacoes?deal=${selectedItem.linked_deal_id}`);
                            }}>
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir Negociação
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={openCreateDealDialog}>
                          <Plus className="h-4 w-4 mr-1" /> Criar Negociação
                        </Button>
                      )}
                    </div>

                    {/* Status Section */}
                    <div className="border rounded-lg p-3 space-y-3">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Briefcase className="h-4 w-4" /> Status da Licitação
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={selectedItem.status === "won" ? "default" : selectedItem.status === "lost" ? "destructive" : "secondary"} className={cn(
                          "text-xs",
                          selectedItem.status === "won" && "bg-green-600 hover:bg-green-700",
                        )}>
                          {selectedItem.status === "won" ? "Ganha" : selectedItem.status === "lost" ? "Perdida" : selectedItem.status === "canceled" ? "Cancelada" : "Aberta"}
                        </Badge>
                        {selectedItem.status === "open" && selectedItem.linked_deal_id && (
                          <div className="flex gap-1.5 ml-auto">
                            <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-950" onClick={() => handleChangeStatus("won")}>
                              <Trophy className="h-4 w-4 mr-1" /> Ganhou
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => handleChangeStatus("lost")}>
                              <XCircle className="h-4 w-4 mr-1" /> Perdeu
                            </Button>
                          </div>
                        )}
                        {selectedItem.status === "open" && !selectedItem.linked_deal_id && (
                          <p className="text-xs text-muted-foreground ml-auto">Crie uma negociação CRM para definir resultado</p>
                        )}
                        {(selectedItem.status === "won" || selectedItem.status === "lost") && (
                          <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => handleChangeStatus("open")}>
                            Reabrir
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={handleStartEdit}><Edit className="h-4 w-4 mr-1" /> Editar</Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm({ type: "item", id: selectedItem.id, name: selectedItem.title })}><Trash2 className="h-4 w-4 mr-1" /> Excluir</Button>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* TASKS TAB */}
              <TabsContent value="tasks" className="space-y-3 mt-4">
                <Button size="sm" onClick={() => setShowNewTaskDialog(true)}><Plus className="h-4 w-4 mr-1" /> Nova Tarefa</Button>
                <div className="space-y-2">
                  {tasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                      <Checkbox checked={task.status === "completed"} onCheckedChange={() => updateTask.mutate({ id: task.id, status: task.status === "completed" ? "pending" : "completed" })} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm", task.status === "completed" && "line-through text-muted-foreground")}>{task.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className={cn("text-[10px] h-4", priorityColors[task.priority])}>{task.priority}</Badge>
                          {task.due_date && <span>{safeFormatDate(task.due_date, "dd/MM/yyyy")}</span>}
                          {task.assigned_to_name && <span>{task.assigned_to_name}</span>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirm({ type: "task", id: task.id, name: task.title })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  {tasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tarefa</p>}
                </div>
              </TabsContent>

              {/* CHECKLIST TAB */}
              <TabsContent value="checklist" className="space-y-3 mt-4">
                <div className="flex gap-2">
                  <Input placeholder="Novo item..." value={checklistTitle} onChange={e => setChecklistTitle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddChecklistItem()} className="flex-1" />
                  <Button size="sm" onClick={handleAddChecklistItem} disabled={!checklistTitle.trim()}><Plus className="h-4 w-4" /></Button>
                </div>
                {checklist.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {checklist.filter(c => c.is_checked).length}/{checklist.length} concluídos
                  </div>
                )}
                <div className="space-y-1">
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border">
                      <Checkbox checked={item.is_checked} onCheckedChange={checked => updateChecklistItem.mutate({ id: item.id, is_checked: !!checked })} />
                      <span className={cn("text-sm flex-1", item.is_checked && "line-through text-muted-foreground")}>{item.title}</span>
                      {item.checked_by_name && <span className="text-xs text-muted-foreground">{item.checked_by_name}</span>}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteChecklistItem.mutate(item.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* DOCUMENTS TAB */}
              <TabsContent value="documents" className="space-y-3 mt-4">
                <div>
                  <input type="file" id="licitacao-doc-upload" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadDocument(f); e.target.value = ""; }} />
                  <Button size="sm" onClick={() => document.getElementById("licitacao-doc-upload")?.click()} disabled={isUploading}>
                    <Upload className="h-4 w-4 mr-1" /> {isUploading ? "Enviando..." : "Enviar Documento"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate block">{doc.name}</a>
                        <p className="text-xs text-muted-foreground">
                          {doc.uploaded_by_name && <span>{doc.uploaded_by_name} • </span>}
                          {safeFormatDate(doc.created_at, "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteDocument.mutate(doc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                  {documents.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento</p>}
                </div>
              </TabsContent>

              {/* NOTES TAB */}
              <TabsContent value="notes" className="space-y-3 mt-4">
                <div className="flex gap-2">
                  <Textarea placeholder="Adicionar nota ou retorno..." value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={2} className="flex-1" />
                  <Button size="sm" className="self-end" onClick={handleAddNote} disabled={createNote.isPending || !noteContent.trim()}><Plus className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-2">
                  {notes.map((note: any) => (
                    <div key={note.id} className="p-3 rounded-lg border space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground font-medium">{note.user_name} • {safeFormatDate(note.created_at, "dd/MM/yyyy HH:mm")}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteNote.mutate(note.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma nota</p>}
                </div>
              </TabsContent>

              {/* HISTORY TAB */}
              <TabsContent value="history" className="space-y-3 mt-4">
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
            <div><Label>Título *</Label><Input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
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
              <div><Label>Prazo</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Responsável</Label>
              <ResponsavelSelect value={taskForm.assigned_to} onChange={v => setTaskForm(p => ({ ...p, assigned_to: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTaskDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateTask} disabled={createTask.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage Settings */}
      <Dialog open={showStageSettings} onOpenChange={setShowStageSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Gerenciar Fases</DialogTitle></DialogHeader>
          <div className="space-y-1">
            {stages.map((s, idx) => (
              <StageSettingsRow
                key={s.id}
                stage={s}
                index={idx}
                total={stages.length}
                onUpdate={async (data) => {
                  try {
                    await updateStage.mutateAsync({ id: s.id, ...data });
                    toast({ title: "Fase atualizada!" });
                  } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
                }}
                onMoveUp={async () => {
                  if (idx === 0 || !activeBoardId) return;
                  const prev = stages[idx - 1];
                  const order = stages.map((st, i) => {
                    if (st.id === s.id) return { id: st.id, sort_order: i - 1 };
                    if (st.id === prev.id) return { id: st.id, sort_order: i + 1 };
                    return { id: st.id, sort_order: i };
                  });
                  await reorderStages.mutateAsync({ boardId: activeBoardId, order });
                }}
                onMoveDown={async () => {
                  if (idx === stages.length - 1 || !activeBoardId) return;
                  const next = stages[idx + 1];
                  const order = stages.map((st, i) => {
                    if (st.id === s.id) return { id: st.id, sort_order: i + 1 };
                    if (st.id === next.id) return { id: st.id, sort_order: i - 1 };
                    return { id: st.id, sort_order: i };
                  });
                  await reorderStages.mutateAsync({ boardId: activeBoardId, order });
                }}
                onDelete={() => setDeleteConfirm({ type: "stage", id: s.id, name: s.name })}
              />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowNewStageDialog(true)}><Plus className="h-4 w-4 mr-1" /> Adicionar Fase</Button>
        </DialogContent>
      </Dialog>

      {/* New Stage Dialog */}
      <Dialog open={showNewStageDialog} onOpenChange={setShowNewStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Fase</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={newStageName} onChange={e => setNewStageName(e.target.value)} /></div>
            <div><Label>Cor</Label><Input type="color" value={newStageColor} onChange={e => setNewStageColor(e.target.value)} className="h-10 w-20" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewStageDialog(false)}>Cancelar</Button>
            <Button onClick={handleAddStage}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Deal Dialog */}
      <Dialog open={showCreateDealDialog} onOpenChange={setShowCreateDealDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Negociação CRM</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={dealForm.title} onChange={e => setDealForm(p => ({ ...p, title: e.target.value }))} placeholder="Título da negociação" />
            </div>
            <div>
              <Label>Valor</Label>
              <Input type="number" value={dealForm.value} onChange={e => setDealForm(p => ({ ...p, value: e.target.value }))} placeholder="0,00" />
            </div>
            <div>
              <Label>Funil *</Label>
              <Select value={dealForm.funnel_id} onValueChange={v => setDealForm(p => ({ ...p, funnel_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar funil" /></SelectTrigger>
                <SelectContent>
                  {crmFunnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa *</Label>
              <div className="space-y-2">
                <Input placeholder="Buscar empresa..." value={companySearch} onChange={e => setCompanySearch(e.target.value)} />
                {companySearch && (
                  <div className="border rounded-lg max-h-32 overflow-y-auto">
                    {crmCompanies.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2 text-center">Nenhuma empresa encontrada</p>
                    ) : (
                      crmCompanies.slice(0, 10).map(c => (
                        <button key={c.id} className={cn("w-full text-left p-2 text-sm hover:bg-muted/50", dealForm.company_id === c.id && "bg-primary/10")}
                          onClick={() => { setDealForm(p => ({ ...p, company_id: c.id })); setCompanySearch(c.name); }}>
                          {c.name} {c.cnpj && <span className="text-xs text-muted-foreground ml-1">({c.cnpj})</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDealDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateDeal} disabled={createDealFromLicitacao.isPending || !dealForm.funnel_id || !dealForm.company_id}>
              {createDealFromLicitacao.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar Negociação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Deseja excluir "{deleteConfirm?.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
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
