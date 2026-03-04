import { useState, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Calendar, CheckSquare, Clock, FileText, MessageSquare, Paperclip,
  Plus, Trash2, User, X, Send, ListChecks, Tag
} from "lucide-react";
import {
  TaskCard, TaskChecklist, TaskChecklistItem, TaskComment, TaskAttachment,
  OrgMember, ChecklistTemplate,
  useCardChecklists, useChecklistMutations,
  useCardComments, useCommentMutations,
  useCardAttachments, useAttachmentMutations,
  useChecklistTemplates,
  useCardMutations,
} from "@/hooks/use-task-boards";
import { format } from "date-fns";
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
}

export function TaskCardDetailDialog({
  open, onOpenChange, card, boardId, isGlobal, members
}: TaskCardDetailDialogProps) {
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
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
  const { updateCard } = useCardMutations(boardId);

  // Sync form when card changes
  const cardId = card?.id;
  useState(() => {
    if (card) {
      setEditTitle(card.title);
      setEditDescription(card.description || "");
    }
  });

  if (!card) return null;

  const totalItems = checklists.reduce((s, cl) => s + (cl.items?.length || 0), 0);
  const checkedItems = checklists.reduce((s, cl) => s + (cl.items?.filter(i => i.is_checked).length || 0), 0);
  const progress = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;

  const handleSaveDetails = () => {
    if (!card) return;
    updateCard.mutate({
      id: card.id,
      title: editTitle || card.title,
      description: editDescription,
    });
    toast({ title: "Tarefa atualizada" });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>
            <Input
              value={editTitle || card.title}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveDetails}
              className="text-lg font-bold border-0 p-0 h-auto focus-visible:ring-0 shadow-none"
            />
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Criado por {card.creator_name} • {card.created_at ? format(new Date(card.created_at), "dd/MM/yyyy", { locale: ptBR }) : ""}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(90vh-100px)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 pt-2">
            {/* Main content (2/3) */}
            <div className="md:col-span-2 space-y-6">
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
                  className="min-h-[80px] text-sm"
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

                      <div className="space-y-1 pl-1">
                        {cl.items?.map(item => (
                          <div key={item.id} className="flex items-center gap-2 group">
                            <Checkbox
                              checked={item.is_checked}
                              onCheckedChange={() => handleToggleItem(item)}
                            />
                            <span className={cn(
                              "text-sm flex-1",
                              item.is_checked && "line-through text-muted-foreground"
                            )}>
                              {item.text}
                            </span>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => checklistMut.deleteItem.mutate(item.id)}
                              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
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
                  className="h-8 text-xs"
                />
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

              {/* Actions */}
              <div className="space-y-1">
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
