import { useState, useMemo } from "react";
import {
  DndContext, DragOverlay, closestCorners,
  DragStartEvent, DragEndEvent, DragOverEvent,
  PointerSensor, useSensor, useSensors, MeasuringStrategy
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, User, ClipboardList, Calendar, Trash2, FileText, CheckSquare } from "lucide-react";
import { Licitacao, LicitacaoStage } from "@/hooks/use-licitacao";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/utils";

interface Props {
  stages: LicitacaoStage[];
  itemsByStage: Record<string, Licitacao[]>;
  onItemClick: (item: Licitacao) => void;
  onMoveItem: (itemId: string, newStageId: string) => void;
  onDeleteItem: (item: Licitacao) => void;
}

function SortableLicitacaoCard({ item, stage, stages, onItemClick, onMoveItem, onDeleteItem }: {
  item: Licitacao; stage: LicitacaoStage; stages: LicitacaoStage[];
  onItemClick: (i: Licitacao) => void; onMoveItem: (id: string, stageId: string) => void; onDeleteItem: (i: Licitacao) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LicitacaoCardContent item={item} stage={stage} stages={stages} onItemClick={onItemClick} onMoveItem={onMoveItem} onDeleteItem={onDeleteItem} />
    </div>
  );
}

function LicitacaoCardContent({ item, stage, stages, onItemClick, onMoveItem, onDeleteItem }: {
  item: Licitacao; stage: LicitacaoStage; stages: LicitacaoStage[];
  onItemClick: (i: Licitacao) => void; onMoveItem: (id: string, stageId: string) => void; onDeleteItem: (i: Licitacao) => void;
}) {
  const isOverdue = item.deadline_date && new Date(item.deadline_date) < new Date();
  return (
    <Card
      className={cn("cursor-grab hover:shadow-md transition-shadow border-l-4 active:cursor-grabbing", isOverdue && "ring-1 ring-destructive/40")}
      style={{ borderLeftColor: stage.color }}
      onClick={() => onItemClick(item)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <h4 className="font-medium text-sm leading-tight line-clamp-2">{item.title}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
              {stages.filter(s => s.id !== stage.id).map(s => (
                <DropdownMenuItem key={s.id} onClick={() => onMoveItem(item.id, s.id)}>
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                  Mover para {s.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-destructive" onClick={() => onDeleteItem(item)}>
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {item.edital_number && <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> {item.edital_number}</p>}
        {item.entity_name && <p className="text-xs text-muted-foreground truncate">{item.entity_name}</p>}
        {item.assigned_to_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" /> {item.assigned_to_name}
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {item.deadline_date && (
            <span className={cn("flex items-center gap-1", isOverdue && "text-destructive font-medium")}>
              <Calendar className="h-3 w-3" /> {safeFormatDate(item.deadline_date, "dd/MM/yyyy")}
            </span>
          )}
          {item.task_count > 0 && (
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3 w-3" /> {item.completed_task_count}/{item.task_count}
            </span>
          )}
          {item.checklist_count > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3 w-3" /> {item.checked_count}/{item.checklist_count}
            </span>
          )}
          {Number(item.estimated_value) > 0 && (
            <span className="font-medium text-foreground">
              R$ {Number(item.estimated_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DroppableColumn({ stage, items, stages, onItemClick, onMoveItem, onDeleteItem }: {
  stage: LicitacaoStage; items: Licitacao[]; stages: LicitacaoStage[];
  onItemClick: (i: Licitacao) => void; onMoveItem: (id: string, stageId: string) => void; onDeleteItem: (i: Licitacao) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalValue = items.reduce((sum, i) => sum + Number(i.estimated_value || 0), 0);

  return (
    <div className="flex flex-col w-[280px] min-w-[280px] shrink-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
        <h3 className="font-semibold text-sm truncate">{stage.name}</h3>
        <Badge variant="secondary" className="text-[10px] h-5 shrink-0">{items.length}</Badge>
      </div>
      {totalValue > 0 && (
        <p className="text-xs text-muted-foreground px-1 mb-2">
          R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </p>
      )}
      <div
        ref={setNodeRef}
        className={cn("flex-1 space-y-2 p-1 rounded-lg min-h-[100px] transition-colors", isOver && "bg-accent/50")}
      >
        {items.map(item => (
          <SortableLicitacaoCard key={item.id} item={item} stage={stage} stages={stages} onItemClick={onItemClick} onMoveItem={onMoveItem} onDeleteItem={onDeleteItem} />
        ))}
      </div>
    </div>
  );
}

export function LicitacaoKanban({ stages, itemsByStage, onItemClick, onMoveItem, onDeleteItem }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    for (const items of Object.values(itemsByStage)) {
      const item = items.find(i => i.id === activeId);
      if (item) return item;
    }
    return null;
  }, [activeId, itemsByStage]);

  const activeStage = useMemo(() => {
    if (!activeItem) return null;
    return stages.find(s => s.id === activeItem.stage_id) || null;
  }, [activeItem, stages]);

  function handleDragStart(event: DragStartEvent) { setActiveId(event.active.id as string); }
  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = active.id as string;
    const targetId = over.id as string;
    if (itemId === targetId) return;
    const isStage = stages.some(s => s.id === targetId);
    const targetStageId = isStage ? targetId : (() => {
      for (const [sid, items] of Object.entries(itemsByStage)) {
        if (items.some(i => i.id === targetId)) return sid;
      }
      return null;
    })();
    if (!targetStageId) return;
    const currentStageId = (() => {
      for (const [sid, items] of Object.entries(itemsByStage)) {
        if (items.some(i => i.id === itemId)) return sid;
      }
      return null;
    })();
    if (currentStageId !== targetStageId) onMoveItem(itemId, targetStageId);
  }
  function handleDragCancel() { setActiveId(null); }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}>
      <ScrollArea className="w-full h-full">
        <div className="flex gap-4 p-4 min-w-max">
          {stages.map(stage => {
            const items = itemsByStage[stage.id] || [];
            return (
              <SortableContext key={stage.id} items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <DroppableColumn stage={stage} items={items} stages={stages} onItemClick={onItemClick} onMoveItem={onMoveItem} onDeleteItem={onDeleteItem} />
              </SortableContext>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {activeItem && activeStage ? (
          <div className="rotate-2 scale-105 shadow-2xl">
            <LicitacaoCardContent item={activeItem} stage={activeStage} stages={stages} onItemClick={() => {}} onMoveItem={() => {}} onDeleteItem={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
