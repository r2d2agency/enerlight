import { useState, useMemo } from "react";
import { 
  DndContext, DragOverlay, closestCorners, 
  DragStartEvent, DragEndEvent, DragOverEvent,
  PointerSensor, useSensor, useSensors, MeasuringStrategy 
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Plus, MoreVertical, Calendar, Paperclip, MessageSquare, 
  CheckSquare, AlertTriangle, Clock, GripVertical
} from "lucide-react";
import { TaskCard, TaskBoardColumn } from "@/hooks/use-task-boards";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface TaskKanbanBoardProps {
  columns: TaskBoardColumn[];
  cards: TaskCard[];
  isGlobal: boolean;
  onCardClick: (card: TaskCard) => void;
  onAddCard: (columnId: string) => void;
  onMoveCard: (cardId: string, columnId: string, position: number) => void;
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  urgent: { color: "bg-red-500", label: "Urgente" },
  high: { color: "bg-orange-500", label: "Alta" },
  medium: { color: "bg-yellow-500", label: "Média" },
  low: { color: "bg-blue-500", label: "Baixa" },
};

function SortableCard({ card, onClick }: { card: TaskCard; onClick: () => void }) {
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
          "group bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all",
          "hover:border-primary/30",
          isDragging && "shadow-xl ring-2 ring-primary/20",
          isOverdue && "border-destructive/50"
        )}
        onClick={onClick}
      >
        {/* Drag handle + Color stripe */}
        <div className="flex items-start gap-2">
          <div 
            {...listeners} 
            className="mt-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 transition-opacity"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            {/* Priority indicator */}
            <div className="flex items-center gap-2 mb-1">
              <div className={cn("w-2 h-2 rounded-full", prio.color)} />
              {card.tags && card.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {card.tags.slice(0, 3).map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Title */}
            <p className="font-medium text-sm leading-tight mb-2 line-clamp-2">{card.title}</p>

            {/* Meta row */}
            <div className="flex items-center gap-2 flex-wrap text-muted-foreground">
              {card.due_date && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex items-center gap-1 text-[11px]",
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
                <div className="flex items-center gap-1 text-[11px]">
                  <CheckSquare className="h-3 w-3" />
                  {checkProgress}
                </div>
              )}

              {card.attachment_count > 0 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <Paperclip className="h-3 w-3" />
                  {card.attachment_count}
                </div>
              )}

              {card.comment_count > 0 && (
                <div className="flex items-center gap-1 text-[11px]">
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

function KanbanColumnComponent({ 
  column, cards, onCardClick, onAddCard 
}: { 
  column: TaskBoardColumn; 
  cards: TaskCard[]; 
  onCardClick: (card: TaskCard) => void;
  onAddCard: () => void;
}) {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col max-h-full">
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
        <h3 className="font-semibold text-sm flex-1">{column.name}</h3>
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
          {cards.length}
        </Badge>
      </div>

      {/* Cards list */}
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 overflow-y-auto space-y-2 px-1 pb-2 min-h-[60px]">
          {cards.map(card => (
            <SortableCard key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
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

export function TaskKanbanBoard({ columns, cards, isGlobal, onCardClick, onAddCard, onMoveCard }: TaskKanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

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
    if (!activeId) return null;
    return cards.find(c => c.id === activeId) || null;
  }, [activeId, cards]);

  const findColumnForCard = (cardId: string) => {
    for (const [colId, colCards] of Object.entries(cardsByColumn)) {
      if (colCards.some(c => c.id === cardId)) return colId;
    }
    return null;
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const cardId = active.id as string;
    const targetId = over.id as string;
    if (cardId === targetId) return;

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <ScrollArea className="w-full h-full">
        <div className="flex gap-4 p-4 min-w-max items-start" style={{ minHeight: "calc(100vh - 200px)" }}>
          {columns.map(col => (
            <KanbanColumnComponent
              key={col.id}
              column={col}
              cards={cardsByColumn[col.id] || []}
              onCardClick={onCardClick}
              onAddCard={() => onAddCard(col.id)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}>
        {activeCard ? (
          <div className="rotate-2 scale-105 shadow-2xl w-72">
            <div className="bg-card border rounded-lg p-3">
              <p className="font-medium text-sm">{activeCard.title}</p>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
