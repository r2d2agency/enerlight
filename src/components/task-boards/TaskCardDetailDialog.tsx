import { useState, useMemo, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Calendar, CheckSquare, Clock, FileText, MessageSquare, Paperclip,
  Plus, Trash2, User, X, Send, ListChecks, Tag, Briefcase, Building2,
  Contact, FolderKanban, StickyNote, BarChart3, AlertTriangle, ArrowRightLeft
} from "lucide-react";
import {
  TaskCard, TaskBoard, TaskChecklist, TaskChecklistItem, TaskComment, TaskAttachment,
  OrgMember, ChecklistTemplate,
  useCardChecklists, useChecklistMutations,
  useCardComments, useCommentMutations,
  useCardAttachments, useAttachmentMutations,
  useChecklistTemplates,
  useCardMutations,
  useSearchDeals, useSearchProjects, useSearchContacts, useSearchCompanies,
} from "@/hooks/use-task-boards";
import { format, differenceInDays, addDays, isPast, isToday, min, max } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface TaskCardDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: TaskCard | null;
  boardId: string;
  isGlobal: boolean;
  members: OrgMember[];
  boards?: TaskBoard[];
}

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  todo: { label: "A Fazer", color: "bg-muted text-muted-foreground", icon: "⬜" },
  in_progress: { label: "Em Andamento", color: "bg-blue-500/20 text-blue-400", icon: "🔵" },
  done: { label: "Concluído", color: "bg-green-500/20 text-green-400", icon: "✅" },
};

// ============================================
// LINK SEARCH COMPONENT
// ============================================
function LinkSearchField({ 
  label, icon: Icon, currentValue, currentLabel, searchHook, 
  onSelect, onClear, displayField = "title" 
}: {
  label: string;
  icon: any;
  currentValue?: string;
  currentLabel?: string;
  searchHook: (q: string) => { data?: any[] };
  onSelect: (id: string) => void;
  onClear: () => void;
  displayField?: string;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const { data: results = [] } = searchHook(search);

  if (currentValue && currentLabel) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="flex-1 truncate">{currentLabel}</span>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onClear}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs w-full justify-start text-muted-foreground">
          <Icon className="h-3 w-3 mr-1" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-2" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar..."
          className="h-7 text-xs mb-2"
          autoFocus
        />
        <div className="max-h-32 overflow-y-auto space-y-0.5">
          {results.map((item: any) => (
            <div
              key={item.id}
              className="px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-muted truncate"
              onClick={() => { onSelect(item.id); setIsOpen(false); setSearch(""); }}
            >
              {item[displayField] || item.name || item.title}
              {item.company_name && <span className="text-muted-foreground ml-1">• {item.company_name}</span>}
            </div>
          ))}
          {search && results.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">Nenhum resultado</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================
// MINI GANTT CHART
// ============================================
function MiniGanttChart({ checklists }: { checklists: TaskChecklist[] }) {
  const items = useMemo(() => {
    const all: (TaskChecklistItem & { checklistTitle: string })[] = [];
    for (const cl of checklists) {
      for (const item of (cl.items || [])) {
        if (item.due_date) {
          all.push({ ...item, checklistTitle: cl.title });
        }
      }
    }
    return all.sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());
  }, [checklists]);

  if (items.length === 0) return null;

  const dates = items.map(i => new Date(i.due_date!));
  const startDates = items.map(i => i.start_date ? new Date(i.start_date) : addDays(new Date(i.due_date!), -3));
  const allDates = [...dates, ...startDates];
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  const totalDays = Math.max(differenceInDays(maxDate, minDate), 1);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
        <BarChart3 className="h-3 w-3" /> Gantt
      </Label>
      <div className="border rounded-lg p-3 space-y-1.5 bg-muted/20">
        {/* Timeline header */}
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>{format(minDate, "dd/MM", { locale: ptBR })}</span>
          <span>{format(maxDate, "dd/MM", { locale: ptBR })}</span>
        </div>
        {items.map((item) => {
          const start = item.start_date ? new Date(item.start_date) : addDays(new Date(item.due_date!), -3);
          const end = new Date(item.due_date!);
          const startPct = Math.max(0, (differenceInDays(start, minDate) / totalDays) * 100);
          const widthPct = Math.max(5, (differenceInDays(end, start) / totalDays) * 100);
          const overdue = isPast(end) && !item.is_checked;
          const dueToday = isToday(end);

          return (
            <div key={item.id} className="relative h-6 flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "absolute h-4 rounded-full text-[9px] flex items-center px-1.5 truncate cursor-default transition-all",
                      item.is_checked
                        ? "bg-green-500/30 text-green-400"
                        : overdue
                          ? "bg-red-500/30 text-red-400"
                          : dueToday
                            ? "bg-orange-500/30 text-orange-400"
                            : "bg-primary/20 text-primary"
                    )}
                    style={{ left: `${startPct}%`, width: `${widthPct}%`, minWidth: "20px" }}
                  >
                    {item.text.slice(0, 20)}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{item.text}</p>
                  <p className="text-xs">
                    {format(start, "dd/MM")} → {format(end, "dd/MM")}
                    {overdue && " ⚠️ Atrasado"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// MAIN DIALOG
// ============================================
export function TaskCardDetailDialog({
  open, onOpenChange, card, boardId, isGlobal, members, boards = []
}: TaskCardDetailDialogProps) {
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [newComment, setNewComment] = useState("");
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const { toast } = useToast();

  const { data: checklists = [] } = useCardChecklists(card?.id);
  const { data: comments = [] } = useCardComments(card?.id);
  const { data: attachments = [] } = useCardAttachments(card?.id);
  const { data: templates = [] } = useChecklistTemplates();

  const checklistMut = useChecklistMutations(card?.id);
  const commentMut = useCommentMutations(card?.id);
  const attachmentMut = useAttachmentMutations(card?.id);
  const { updateCard, moveCard } = useCardMutations(boardId);

  // Sync form when card changes
  useEffect(() => {
    if (card) {
      setEditTitle(card.title);
      setEditDescription(card.description || "");
      setEditNotes(card.notes || "");
    }
  }, [card?.id]);

  if (!card) return null;

  const totalItems = checklists.reduce((s, cl) => s + (cl.items?.length || 0), 0);
  const checkedItems = checklists.reduce((s, cl) => s + (cl.items?.filter(i => i.is_checked).length || 0), 0);
  const progress = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;
  const currentStatus = statusConfig[card.status || "todo"] || statusConfig.todo;

  const handleSaveDetails = () => {
    if (!card) return;
    updateCard.mutate({
      id: card.id,
      title: editTitle || card.title,
      description: editDescription,
    });
  };

  const handleSaveNotes = () => {
    if (!card) return;
    updateCard.mutate({ id: card.id, notes: editNotes } as any);
  };

  const handleAddChecklist = (templateId?: string) => {
    checklistMut.addChecklist.mutate({
      title: newChecklistTitle || "Checklist",
      template_id: templateId,
    });
    setNewChecklistTitle("");
    setShowAddChecklist(false);
  };

  const handleToggleItem = (item: TaskChecklistItem) => {
    checklistMut.updateItem.mutate({ id: item.id, is_checked: !item.is_checked });
  };

  const handleAddItem = (checklistId: string) => {
    const text = newItemTexts[checklistId];
    if (!text?.trim()) return;
    checklistMut.addItem.mutate({ checklistId, text: text.trim() });
    setNewItemTexts(prev => ({ ...prev, [checklistId]: "" }));
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    commentMut.addComment.mutate(newComment.trim());
    setNewComment("");
  };

  const handleChangePriority = (priority: string) => {
    updateCard.mutate({ id: card.id, priority });
  };

  const handleChangeAssignee = (assignedTo: string) => {
    updateCard.mutate({ id: card.id, assigned_to: assignedTo });
  };

  const handleChangeStatus = (status: string) => {
    updateCard.mutate({ id: card.id, status } as any);
    if (status === "done") toast({ title: "Tarefa concluída! 🎉" });
  };

  const handleChangeType = (type: string) => {
    updateCard.mutate({ id: card.id, type } as any);
  };

    updateCard.mutate({ id: card.id, deal_id: dealId } as any);
  };
  const handleLinkProject = (projectId: string) => {
    updateCard.mutate({ id: card.id, project_id: projectId } as any);
  };
  const handleLinkContact = (contactId: string) => {
    updateCard.mutate({ id: card.id, contact_id: contactId } as any);
  };
  const handleLinkCompany = (companyId: string) => {
    updateCard.mutate({ id: card.id, company_id: companyId } as any);
  };

  const handleItemDueDate = (itemId: string, date: string) => {
    checklistMut.updateItem.mutate({ id: itemId, due_date: date || undefined });
  };

  const handleItemStartDate = (itemId: string, date: string) => {
    checklistMut.updateItem.mutate({ id: itemId, start_date: date || undefined } as any);
  };

  // Due date warning
  const isDueWarning = card.due_date && isPast(new Date(card.due_date)) && card.status !== "done";
  const isDueToday = card.due_date && isToday(new Date(card.due_date));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-3">
            {isDueWarning && (
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="h-5 w-5 text-destructive animate-pulse" />
                </TooltipTrigger>
                <TooltipContent>Tarefa atrasada!</TooltipContent>
              </Tooltip>
            )}
            <DialogTitle className="flex-1">
              <Input
                value={editTitle || card.title}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveDetails}
                className="text-lg font-bold border-0 p-0 h-auto focus-visible:ring-0 shadow-none"
              />
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Criado por {card.creator_name} • {card.created_at ? format(new Date(card.created_at), "dd/MM/yyyy", { locale: ptBR }) : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(90vh-100px)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 pt-2">
            {/* Main content (2/3) */}
            <div className="md:col-span-2 space-y-5">
              {/* Description */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <FileText className="h-3 w-3" /> Descrição
                </Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  onBlur={handleSaveDetails}
                  placeholder="Adicione uma descrição..."
                  className="min-h-[70px] text-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <StickyNote className="h-3 w-3" /> Notas
                </Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={handleSaveNotes}
                  placeholder="Adicione notas internas..."
                  className="min-h-[60px] text-sm bg-yellow-500/5 border-yellow-500/20"
                />
              </div>

              {/* Checklists */}
              {checklists.length > 0 && (
                <div className="space-y-4">
                  {totalItems > 0 && (
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      <Progress value={progress} className="flex-1 h-2" />
                      <span className="text-xs text-muted-foreground">{checkedItems}/{totalItems}</span>
                    </div>
                  )}

                  {checklists.map(cl => (
                    <div key={cl.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold flex items-center gap-1">
                          <ListChecks className="h-4 w-4" /> {cl.title}
                        </h4>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => checklistMut.deleteChecklist.mutate(cl.id)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="space-y-1.5 pl-1">
                        {cl.items?.map(item => {
                          const itemOverdue = item.due_date && isPast(new Date(item.due_date)) && !item.is_checked;
                          return (
                            <div key={item.id} className="flex items-center gap-2 group">
                              <Checkbox
                                checked={item.is_checked}
                                onCheckedChange={() => handleToggleItem(item)}
                              />
                              <span className={cn(
                                "text-sm flex-1",
                                item.is_checked && "line-through text-muted-foreground",
                                itemOverdue && "text-destructive"
                              )}>
                                {item.text}
                              </span>
                              {/* Date inputs for Gantt */}
                              <Input
                                type="date"
                                value={item.start_date ? format(new Date(item.start_date), "yyyy-MM-dd") : ""}
                                onChange={(e) => handleItemStartDate(item.id, e.target.value)}
                                className="h-6 text-[10px] w-[100px] opacity-60 hover:opacity-100 focus:opacity-100"
                                title="Data início"
                              />
                              <Input
                                type="date"
                                value={item.due_date ? format(new Date(item.due_date), "yyyy-MM-dd") : ""}
                                onChange={(e) => handleItemDueDate(item.id, e.target.value)}
                                className={cn(
                                  "h-6 text-[10px] w-[100px]",
                                  itemOverdue ? "border-destructive text-destructive" : "opacity-60 hover:opacity-100 focus:opacity-100"
                                )}
                                title="Data prazo"
                              />
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => checklistMut.deleteItem.mutate(item.id)}
                                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add item */}
                      <div className="flex gap-2 pl-6">
                        <Input
                          value={newItemTexts[cl.id] || ""}
                          onChange={(e) => setNewItemTexts(prev => ({ ...prev, [cl.id]: e.target.value }))}
                          placeholder="Adicionar item..."
                          className="h-7 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && handleAddItem(cl.id)}
                        />
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleAddItem(cl.id)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Gantt Chart */}
              {checklists.length > 0 && <MiniGanttChart checklists={checklists} />}

              {/* Add checklist button */}
              {!showAddChecklist ? (
                <Button
                  variant="outline" size="sm"
                  onClick={() => setShowAddChecklist(true)}
                >
                  <ListChecks className="h-4 w-4 mr-1" />
                  Adicionar checklist
                </Button>
              ) : (
                <div className="space-y-2 border rounded-lg p-3">
                  <Input
                    value={newChecklistTitle}
                    onChange={(e) => setNewChecklistTitle(e.target.value)}
                    placeholder="Nome do checklist..."
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => handleAddChecklist()}>
                      Criar vazio
                    </Button>
                    {templates.map(t => (
                      <Button
                        key={t.id}
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddChecklist(t.id)}
                      >
                        📋 {t.name}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setShowAddChecklist(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              <Separator />

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" /> Anexos ({attachments.length})
                  </Label>
                  <div className="space-y-1">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2 text-sm group p-1 rounded hover:bg-muted/50">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <a href={att.file_url} target="_blank" rel="noopener" className="flex-1 truncate text-primary hover:underline">
                          {att.file_name}
                        </a>
                        <Button
                          variant="ghost" size="sm"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => attachmentMut.deleteAttachment.mutate(att.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Comments */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> Comentários ({comments.length})
                </Label>

                <div className="flex gap-2">
                  <Input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Escreva um comentário..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  />
                  <Button size="sm" onClick={handleAddComment} disabled={!newComment.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px]">
                          {c.user_name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{c.user_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(c.created_at), "dd/MM HH:mm")}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar (1/3) */}
            <div className="space-y-4">
              {/* Status */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Status</Label>
                <Select value={card.status || "todo"} onValueChange={handleChangeStatus}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">⬜ A Fazer</SelectItem>
                    <SelectItem value="in_progress">🔵 Em Andamento</SelectItem>
                    <SelectItem value="done">✅ Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Prioridade</Label>
                <Select value={card.priority} onValueChange={handleChangePriority}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟦 Baixa</SelectItem>
                    <SelectItem value="medium">🟨 Média</SelectItem>
                    <SelectItem value="high">🟧 Alta</SelectItem>
                    <SelectItem value="urgent">🟥 Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Assignee */}
              {isGlobal && (
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Responsável</Label>
                  <Select value={card.assigned_to || ""} onValueChange={handleChangeAssignee}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Due date */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Prazo</Label>
                <Input
                  type="date"
                  value={card.due_date ? format(new Date(card.due_date), "yyyy-MM-dd") : ""}
                  onChange={(e) => updateCard.mutate({ id: card.id, due_date: e.target.value || undefined })}
                  className={cn(
                    "h-8 text-xs",
                    isDueWarning && "border-destructive text-destructive",
                    isDueToday && "border-orange-500 text-orange-500"
                  )}
                />
                {isDueWarning && (
                  <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Tarefa atrasada!
                  </p>
                )}
              </div>

              {/* Tags */}
              <div>
                <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Tags</Label>
                <div className="flex gap-1 flex-wrap">
                  {card.tags?.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Links */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground block">Vínculos</Label>
                
                <LinkSearchField
                  label="Negociação"
                  icon={Briefcase}
                  currentValue={card.deal_id}
                  currentLabel={card.deal_title}
                  searchHook={useSearchDeals}
                  onSelect={handleLinkDeal}
                  onClear={() => updateCard.mutate({ id: card.id, deal_id: undefined } as any)}
                />

                <LinkSearchField
                  label="Projeto"
                  icon={FolderKanban}
                  currentValue={card.project_id}
                  currentLabel={card.project_title}
                  searchHook={useSearchProjects}
                  onSelect={handleLinkProject}
                  onClear={() => updateCard.mutate({ id: card.id, project_id: undefined } as any)}
                />

                <LinkSearchField
                  label="Contato"
                  icon={Contact}
                  currentValue={card.contact_id}
                  currentLabel={card.contact_name}
                  searchHook={useSearchContacts}
                  onSelect={handleLinkContact}
                  onClear={() => updateCard.mutate({ id: card.id, contact_id: undefined } as any)}
                  displayField="name"
                />

                <LinkSearchField
                  label="Empresa"
                  icon={Building2}
                  currentValue={card.company_id}
                  currentLabel={card.company_name}
                  searchHook={useSearchCompanies}
                  onSelect={handleLinkCompany}
                  onClear={() => updateCard.mutate({ id: card.id, company_id: undefined } as any)}
                  displayField="name"
                />
              </div>

              <Separator />

              {/* Actions */}
              <div className="space-y-1">
                {/* Move to another board */}
                {boards.filter(b => b.id !== boardId).length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground px-2">Mover para outro quadro</p>
                    {boards.filter(b => b.id !== boardId).map(b => (
                      <Button
                        key={b.id}
                        variant="ghost" size="sm" className="w-full justify-start text-xs"
                        onClick={() => {
                          moveCard.mutate({ id: card.id, board_id: b.id });
                          onOpenChange(false);
                          toast({ title: `Tarefa movida para "${b.name}"` });
                        }}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                        {b.name}
                        {b.is_global && <Badge variant="secondary" className="ml-auto text-[9px]">Global</Badge>}
                      </Button>
                    ))}
                  </div>
                )}

                <Separator />

                <Button
                  variant="ghost" size="sm" className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={() => {
                    updateCard.mutate({ id: card.id, is_archived: true } as any);
                    onOpenChange(false);
                    toast({ title: "Tarefa arquivada" });
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Arquivar tarefa
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
