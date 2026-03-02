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
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, User, ClipboardList, Presentation, Trash2 } from "lucide-react";
import { HomologationCompany, HomologationStage } from "@/hooks/use-homologation";

interface Props {
  stages: HomologationStage[];
  companiesByStage: Record<string, HomologationCompany[]>;
  onCompanyClick: (company: HomologationCompany) => void;
  onMoveCompany: (companyId: string, newStageId: string) => void;
  onDeleteCompany: (company: HomologationCompany) => void;
}

function SortableCompanyCard({ company, stage, stages, onCompanyClick, onMoveCompany, onDeleteCompany }: {
  company: HomologationCompany;
  stage: HomologationStage;
  stages: HomologationStage[];
  onCompanyClick: (c: HomologationCompany) => void;
  onMoveCompany: (id: string, stageId: string) => void;
  onDeleteCompany: (c: HomologationCompany) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: company.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CompanyCardContent
        company={company}
        stage={stage}
        stages={stages}
        onCompanyClick={onCompanyClick}
        onMoveCompany={onMoveCompany}
        onDeleteCompany={onDeleteCompany}
      />
    </div>
  );
}

function CompanyCardContent({ company, stage, stages, onCompanyClick, onMoveCompany, onDeleteCompany }: {
  company: HomologationCompany;
  stage: HomologationStage;
  stages: HomologationStage[];
  onCompanyClick: (c: HomologationCompany) => void;
  onMoveCompany: (id: string, stageId: string) => void;
  onDeleteCompany: (c: HomologationCompany) => void;
}) {
  return (
    <Card
      className="cursor-grab hover:shadow-md transition-shadow border-l-4 active:cursor-grabbing"
      style={{ borderLeftColor: stage.color }}
      onClick={() => onCompanyClick(company)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <h4 className="font-medium text-sm leading-tight">{company.name}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
              {stages.filter(s => s.id !== stage.id).map(s => (
                <DropdownMenuItem key={s.id} onClick={() => onMoveCompany(company.id, s.id)}>
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                  Mover para {s.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-destructive" onClick={() => onDeleteCompany(company)}>
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {company.cnpj && <p className="text-xs text-muted-foreground">{company.cnpj}</p>}
        {company.contact_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" /> {company.contact_name}
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {company.task_count > 0 && (
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3 w-3" />
              {company.completed_task_count}/{company.task_count}
            </span>
          )}
          {company.meeting_count > 0 && (
            <span className="flex items-center gap-1">
              <Presentation className="h-3 w-3" />
              {company.meeting_count}
            </span>
          )}
          {company.assigned_to_name && (
            <span className="flex items-center gap-1 ml-auto">
              <User className="h-3 w-3" /> {company.assigned_to_name.split(' ')[0]}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DroppableColumn({ stage, children }: { stage: HomologationStage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[300px] shrink-0 transition-colors rounded-lg ${isOver ? "bg-primary/5" : ""}`}
    >
      {children}
    </div>
  );
}

export function HomologationKanban({ stages, companiesByStage, onCompanyClick, onMoveCompany, onDeleteCompany }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeDeal = useMemo(() => {
    if (!activeId) return null;
    for (const items of Object.values(companiesByStage)) {
      const found = items.find(c => c.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, companiesByStage]);

  const activeStage = useMemo(() => {
    if (!activeDeal) return null;
    return stages.find(s => s.id === activeDeal.stage_id) || null;
  }, [activeDeal, stages]);

  const findStageForCompany = (companyId: string): string | null => {
    for (const [stageId, items] of Object.entries(companiesByStage)) {
      if (items.some(c => c.id === companyId)) return stageId;
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

    const companyId = active.id as string;
    const targetId = over.id as string;
    if (companyId === targetId) return;

    const currentStageId = findStageForCompany(companyId);
    if (!currentStageId) return;

    const isStageColumn = stages.some(s => s.id === targetId);
    let targetStageId = isStageColumn ? targetId : findStageForCompany(targetId);

    if (targetStageId && targetStageId !== currentStageId) {
      onMoveCompany(companyId, targetStageId);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <div className="flex gap-4 p-4 h-full min-w-max">
        {stages.map(stage => {
          const items = companiesByStage[stage.id] || [];
          return (
            <DroppableColumn key={stage.id} stage={stage}>
              <div className="flex items-center gap-2 mb-3 px-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-semibold">{stage.name}</span>
                <Badge variant="secondary" className="text-[10px] h-5 ml-auto">
                  {items.length}
                </Badge>
                {stage.is_final && (
                  <Badge variant="default" className="text-[10px] h-5 bg-green-600">Final</Badge>
                )}
              </div>
              <ScrollArea className="flex-1">
                <SortableContext items={items.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 pr-2 min-h-[60px]">
                    {items.map(company => (
                      <SortableCompanyCard
                        key={company.id}
                        company={company}
                        stage={stage}
                        stages={stages}
                        onCompanyClick={onCompanyClick}
                        onMoveCompany={onMoveCompany}
                        onDeleteCompany={onDeleteCompany}
                      />
                    ))}
                  </div>
                </SortableContext>
              </ScrollArea>
            </DroppableColumn>
          );
        })}
      </div>

      <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {activeDeal && activeStage ? (
          <div className="rotate-2 scale-105 shadow-2xl w-[280px]">
            <CompanyCardContent
              company={activeDeal}
              stage={activeStage}
              stages={stages}
              onCompanyClick={() => {}}
              onMoveCompany={() => {}}
              onDeleteCompany={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
