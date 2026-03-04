import { useState, useMemo, useRef } from "react";
import { 
  DndContext, DragOverlay, closestCorners, 
  DragStartEvent, DragEndEvent,
  PointerSensor, useSensor, useSensors, MeasuringStrategy,
  useDroppable
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { 
  Plus, Calendar, Paperclip, MessageSquare, 
  CheckSquare, AlertTriangle, GripVertical, Pencil, Trash2, Check, X, GripHorizontal
} from "lucide-react";
import { TaskCard, TaskBoardColumn } from "@/hooks/use-task-boards";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface TaskKanbanBoardProps {
  columns: TaskBoardColumn[];
  cards: TaskCard[];
  isGlobal: boolean;
  canEditColumns: boolean;
  onCardClick: (card: TaskCard) => void;
  onAddCard: (columnId: string) => void;
  onMoveCard: (cardId: string, columnId: string, position: number) => void;
  onDeleteCard?: (cardId: string) => void;
  onUpdateColumn?: (id: string, data: { name?: string; color?: string }) => void;
  onDeleteColumn?: (id: string) => void;
  onReorderColumns?: (columnIds: string[]) => void;
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  urgent: { color: "bg-red-500", label: "Urgente" },
  high: { color: "bg-orange-500", label: "Alta" },
  medium: { color: "bg-yellow-500", label: "Média" },
  low: { color: "bg-blue-500", label: "Baixa" },
};

function SortableCard({ card, onClick, onDelete }: { card: TaskCard; onClick: () => void; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isOverdue = card.due_date && isPast(new Date(card.due_date)) && !card.completed_at;
  const isDueToday = card.due_date && isToday(new Date(card.due_date));
  const prio = priorityConfig[card.priority] || priorityConfig.medium;
  const checkProgress = card.total_checklist_items > 0 
    ? `${card.completed_checklist_items}/${card.total_checklist_items}` 
    : null;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div
        className={cn(
          "group bg-card border rounded-lg p-2.5 cursor-pointer hover:shadow-md transition-all",
          "hover:border-primary/30",
          isDragging && "shadow-xl ring-2 ring-primary/20",
          isOverdue && "border-destructive/50"
        )}
        onClick={onClick}
      >
        <div className="flex items-start gap-1.5">
          <div 
            {...listeners} 
            className="mt-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              <div className={cn("w-2 h-2 rounded-full flex-shrink-0", prio.color)} />
              {card.status === "done" && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-green-500/20 text-green-400">✅</Badge>
              )}
              {card.status === "in_progress" && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-blue-500/20 text-blue-400">🔵</Badge>
              )}
              {card.tags && card.tags.length > 0 && (
                <div className="flex gap-0.5 flex-wrap">
                  {card.tags.slice(0, 2).map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[9px] px-1 py-0 h-4 truncate max-w-[60px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex-1" />
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>

            <p className={cn(
              "font-medium text-xs leading-tight mb-1.5 line-clamp-2 break-words",
              card.status === "done" && "line-through text-muted-foreground"
            )}>{card.title}</p>

            <div className="flex items-center gap-1.5 flex-wrap text-muted-foreground">
              {card.due_date && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-0.5 text-[10px]",
                      isOverdue && "text-destructive font-medium",
                      isDueToday && "text-orange-500 font-medium"
                    )}>
                      {isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                      {format(new Date(card.due_date), "dd MMM", { locale: ptBR })}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isOverdue ? "Atrasada!" : isDueToday ? "Vence hoje" : "Prazo"}
                  </TooltipContent>
                </Tooltip>
              )}

              {checkProgress && (
                <div className="flex items-center gap-0.5 text-[10px]">
                  <CheckSquare className="h-3 w-3" />
                  {checkProgress}
                </div>
              )}

              {card.attachment_count > 0 && (
                <div className="flex items-center gap-0.5 text-[10px]">
                  <Paperclip className="h-3 w-3" />
                  {card.attachment_count}
                </div>
              )}

              {card.comment_count > 0 && (
                <div className="flex items-center gap-0.5 text-[10px]">
                  <MessageSquare className="h-3 w-3" />
                  {card.comment_count}
                </div>
              )}

              <div className="flex-1" />

              {card.assigned_name && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[9px] bg-primary/10">
                        {card.assigned_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>{card.assigned_name}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableColumn({ 
  column, cards, onCardClick, onAddCard, canEdit, onUpdate, onDelete, onDeleteCard 
}: { 
  column: TaskBoardColumn; 
  cards: TaskCard[]; 
  onCardClick: (card: TaskCard) => void;
  onAddCard: () => void;
  canEdit: boolean;
  onUpdate?: (id: string, data: { name?: string }) => void;
  onDelete?: (id: string) => void;
  onDeleteCard?: (cardId: string) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: `col-${column.id}`,
    disabled: !canEdit,
  });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== column.name) {
      onUpdate?.(column.id, { name: editName.trim() });
    }
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={cn(
      "min-w-[240px] w-72 flex-shrink-0 flex flex-col max-h-full rounded-lg transition-colors",
      isOver && "bg-primary/5 ring-2 ring-primary/20",
      isDragging && "ring-2 ring-primary/30"
    )}>
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 mb-2 group/header">
        {canEdit && (
          <div {...listeners} className="cursor-grab active:cursor-grabbing opacity-0 group-hover/header:opacity-60 transition-opacity">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
        
        {editing ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-6 text-sm px-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSaveName}><Check className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
          </div>
        ) : (
          <>
            <h3 className="font-semibold text-sm flex-1">{column.name}</h3>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              {cards.length}
            </Badge>
            {canEdit && !column.is_default && (
              <div className="flex items-center opacity-0 group-hover/header:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditName(column.name); setEditing(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => onDelete?.(column.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cards list - droppable area */}
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div 
          ref={setDropRef}
          className="flex-1 overflow-y-auto space-y-2 px-1 pb-2 min-h-[80px]"
        >
          {cards.map(card => (
            <SortableCard key={card.id} card={card} onClick={() => onCardClick(card)} onDelete={onDeleteCard ? () => onDeleteCard(card.id) : undefined} />
          ))}
          {cards.length === 0 && (
            <div className="text-center text-muted-foreground text-xs py-4 border border-dashed rounded-md">
              Arraste cards aqui
            </div>
          )}
        </div>
      </SortableContext>

      {/* Add card button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-1 text-muted-foreground hover:text-foreground"
        onClick={onAddCard}
      >
        <Plus className="h-4 w-4 mr-1" />
        Adicionar tarefa
      </Button>
    </div>
  );
}

export function TaskKanbanBoard({ columns, cards, isGlobal, canEditColumns, onCardClick, onAddCard, onMoveCard, onDeleteCard, onUpdateColumn, onDeleteColumn, onReorderColumns }: TaskKanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"card" | "column" | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const cardsByColumn = useMemo(() => {
    const map: Record<string, TaskCard[]> = {};
    for (const col of columns) {
      map[col.id] = cards.filter(c => c.column_id === col.id).sort((a, b) => a.position - b.position);
    }
    return map;
  }, [columns, cards]);

  const activeCard = useMemo(() => {
    if (!activeId || activeType !== "card") return null;
    return cards.find(c => c.id === activeId) || null;
  }, [activeId, activeType, cards]);

  const activeColumn = useMemo(() => {
    if (!activeId || activeType !== "column") return null;
    return columns.find(c => `col-${c.id}` === activeId) || null;
  }, [activeId, activeType, columns]);

  const findColumnForCard = (cardId: string) => {
    for (const [colId, colCards] of Object.entries(cardsByColumn)) {
      if (colCards.some(c => c.id === cardId)) return colId;
    }
    return null;
  };

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    if (id.startsWith("col-")) {
      setActiveId(id);
      setActiveType("column");
    } else {
      setActiveId(id);
      setActiveType("card");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);
    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Column reorder
    if (activeIdStr.startsWith("col-") && overIdStr.startsWith("col-")) {
      const fromColId = activeIdStr.replace("col-", "");
      const toColId = overIdStr.replace("col-", "");
      if (fromColId === toColId) return;

      const currentOrder = columns.map(c => c.id);
      const fromIdx = currentOrder.indexOf(fromColId);
      const toIdx = currentOrder.indexOf(toColId);
      if (fromIdx === -1 || toIdx === -1) return;

      const newOrder = [...currentOrder];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, fromColId);
      onReorderColumns?.(newOrder);
      return;
    }

    // Card move
    if (!activeIdStr.startsWith("col-")) {
      const cardId = activeIdStr;
      const targetId = overIdStr;
      if (cardId === targetId) return;

      // Check if dropping on a column
      const isColumn = columns.some(c => c.id === targetId);
      let targetColumnId: string;
      let position = 0;

      if (isColumn) {
        targetColumnId = targetId;
        position = (cardsByColumn[targetId]?.length || 0);
      } else {
        const col = findColumnForCard(targetId);
        if (!col) return;
        targetColumnId = col;
        const idx = cardsByColumn[col]?.findIndex(c => c.id === targetId) || 0;
        position = idx;
      }

      onMoveCard(cardId, targetColumnId, position);
    }
  }

  const columnSortableIds = columns.map(c => `col-${c.id}`);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <ScrollArea className="w-full h-full">
        <SortableContext items={columnSortableIds} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-4 p-4 min-w-max items-start" style={{ minHeight: "calc(100vh - 200px)" }}>
            {columns.map(col => (
              <SortableColumn
                key={col.id}
                column={col}
                cards={cardsByColumn[col.id] || []}
                onCardClick={onCardClick}
                onAddCard={() => onAddCard(col.id)}
                canEdit={canEditColumns}
                onUpdate={onUpdateColumn}
                onDelete={onDeleteColumn}
                onDeleteCard={onDeleteCard}
              />
            ))}
          </div>
        </SortableContext>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}>
        {activeCard ? (
          <div className="rotate-2 scale-105 shadow-2xl w-72">
            <div className="bg-card border rounded-lg p-3">
              <p className="font-medium text-sm">{activeCard.title}</p>
            </div>
          </div>
        ) : activeColumn ? (
          <div className="rotate-1 scale-105 shadow-2xl w-72 bg-muted/80 border rounded-lg p-3">
            <p className="font-semibold text-sm">{activeColumn.name}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
