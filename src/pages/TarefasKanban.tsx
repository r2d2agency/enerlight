import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, LayoutGrid, Globe, User, Settings, ListChecks,
  MoreVertical, Trash2, Edit2, Columns
} from "lucide-react";
import {
  useTaskBoards, useTaskBoardMutations,
  useTaskBoardColumns, useColumnMutations,
  useTaskCards, useCardMutations,
  useOrgMembers,
  TaskBoard, TaskCard,
} from "@/hooks/use-task-boards";
import { TaskKanbanBoard } from "@/components/task-boards/TaskKanbanBoard";
import { TaskCardDetailDialog } from "@/components/task-boards/TaskCardDetailDialog";
import { CreateCardDialog, CreateBoardDialog } from "@/components/task-boards/TaskBoardDialogs";
import { ChecklistTemplatesPanel } from "@/components/task-boards/ChecklistTemplatesPanel";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function TarefasKanban() {
  const { user } = useAuth();
  const isSuperadmin = !!(user as any)?.is_superadmin;
  const isAdmin = isSuperadmin || ['owner', 'admin'].includes((user as any)?.role || '');

  const { data: boards = [], isLoading: loadingBoards } = useTaskBoards();
  const { createBoard, deleteBoard } = useTaskBoardMutations();
  const { data: members = [] } = useOrgMembers();

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("boards");
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showCreateCard, setShowCreateCard] = useState(false);
  const [createCardColumnId, setCreateCardColumnId] = useState("");
  const [selectedCard, setSelectedCard] = useState<TaskCard | null>(null);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  // Selected board
  const selectedBoard = useMemo(
    () => boards.find(b => b.id === selectedBoardId) || null,
    [boards, selectedBoardId]
  );

  // Auto-select first board
  if (boards.length > 0 && !selectedBoardId) {
    setTimeout(() => setSelectedBoardId(boards[0].id), 0);
  }

  const { data: columns = [] } = useTaskBoardColumns(selectedBoardId ?? undefined);
  const { data: cards = [] } = useTaskCards(selectedBoardId ?? undefined);
  const { createCard, moveCard } = useCardMutations(selectedBoardId ?? undefined);
  const { addColumn } = useColumnMutations(selectedBoardId ?? undefined);

  const handleAddCard = (columnId: string) => {
    setCreateCardColumnId(columnId);
    setShowCreateCard(true);
  };

  const handleMoveCard = (cardId: string, columnId: string, position: number) => {
    moveCard.mutate({ id: cardId, column_id: columnId, position });
  };

  const handleAddColumn = () => {
    if (!newColumnName.trim()) return;
    addColumn.mutate({ name: newColumnName.trim() });
    setNewColumnName("");
    setShowAddColumn(false);
  };

  const globalBoards = boards.filter(b => b.is_global);
  const personalBoards = boards.filter(b => !b.is_global);

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2">
          <div>
            <h1 className="text-2xl font-bold">Tarefas</h1>
            <p className="text-sm text-muted-foreground">Organize suas tarefas em quadros Kanban</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setActiveTab(activeTab === "templates" ? "boards" : "templates")}>
              <ListChecks className="h-4 w-4 mr-1" />
              Templates
            </Button>
            <Button size="sm" onClick={() => setShowCreateBoard(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Quadro
            </Button>
          </div>
        </div>

        {activeTab === "templates" ? (
          <div className="p-4">
            <ChecklistTemplatesPanel />
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Board Sidebar */}
            <div className="w-56 border-r flex flex-col bg-muted/30">
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-4">
                  {/* Global boards */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                      <Globe className="h-3 w-3" /> Globais
                    </p>
                    <div className="space-y-1">
                      {globalBoards.map(b => (
                        <BoardItem
                          key={b.id}
                          board={b}
                          isSelected={selectedBoardId === b.id}
                          onSelect={() => setSelectedBoardId(b.id)}
                          onDelete={isAdmin && !b.is_global ? () => deleteBoard.mutate(b.id) : undefined}
                        />
                      ))}
                      {globalBoards.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-1">Nenhum quadro global</p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Personal boards */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                      <User className="h-3 w-3" /> Meus Quadros
                    </p>
                    <div className="space-y-1">
                      {personalBoards.map(b => (
                        <BoardItem
                          key={b.id}
                          board={b}
                          isSelected={selectedBoardId === b.id}
                          onSelect={() => setSelectedBoardId(b.id)}
                          onDelete={() => deleteBoard.mutate(b.id)}
                        />
                      ))}
                      {personalBoards.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-1">Nenhum quadro pessoal</p>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* Kanban content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedBoard ? (
                <>
                  {/* Board header */}
                  <div className="flex items-center gap-3 px-4 py-2 border-b">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedBoard.color }} />
                    <h2 className="font-semibold text-lg flex-1">{selectedBoard.name}</h2>
                    {selectedBoard.is_global && (
                      <Badge variant="outline" className="text-[10px]">
                        <Globe className="h-3 w-3 mr-1" />Global
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setShowAddColumn(true)}>
                      <Columns className="h-4 w-4 mr-1" />
                      Coluna
                    </Button>
                  </div>

                  {/* Kanban board */}
                  <div className="flex-1 overflow-hidden">
                    <TaskKanbanBoard
                      columns={columns}
                      cards={cards}
                      isGlobal={selectedBoard.is_global}
                      onCardClick={setSelectedCard}
                      onAddCard={handleAddCard}
                      onMoveCard={handleMoveCard}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center space-y-2">
                    <LayoutGrid className="h-12 w-12 mx-auto opacity-30" />
                    <p>Selecione ou crie um quadro para começar</p>
                    <Button size="sm" onClick={() => setShowCreateBoard(true)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Criar Quadro
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dialogs */}
        <CreateBoardDialog
          open={showCreateBoard}
          onOpenChange={setShowCreateBoard}
          isAdmin={isAdmin}
          onSubmit={(data) => createBoard.mutate(data)}
        />

        <CreateCardDialog
          open={showCreateCard}
          onOpenChange={setShowCreateCard}
          columnId={createCardColumnId}
          isGlobal={selectedBoard?.is_global || false}
          members={members}
          onSubmit={(data) => createCard.mutate(data)}
        />

        <TaskCardDetailDialog
          open={!!selectedCard}
          onOpenChange={(open) => !open && setSelectedCard(null)}
          card={selectedCard}
          boardId={selectedBoardId || ""}
          isGlobal={selectedBoard?.is_global || false}
          members={members}
        />

        {/* Add column dialog */}
        <Dialog open={showAddColumn} onOpenChange={setShowAddColumn}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Nova Coluna</DialogTitle>
              <DialogDescription>Adicione uma coluna ao quadro</DialogDescription>
            </DialogHeader>
            <Input
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Nome da coluna"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddColumn(false)}>Cancelar</Button>
              <Button onClick={handleAddColumn} disabled={!newColumnName.trim()}>Adicionar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

function BoardItem({ board, isSelected, onSelect, onDelete }: {
  board: TaskBoard;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm group transition-colors",
        isSelected
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-muted text-foreground"
      )}
      onClick={onSelect}
    >
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: board.color }} />
      <span className="truncate flex-1">{board.name}</span>
      <Badge variant="secondary" className="text-[9px] h-4 px-1">
        {board.card_count}
      </Badge>
      {onDelete && (
        <Button
          variant="ghost" size="sm"
          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      )}
    </div>
  );
}
