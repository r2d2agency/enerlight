import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTaskCardsByType, TaskCard, useOrgMembers, useCardMutations, useTaskBoards, useTaskBoardColumns } from "@/hooks/use-task-boards";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CheckCircle, AlertTriangle, Calendar as CalendarIcon, MapPin, Loader2, Filter, X, Building2, User, Trash2, ClipboardList } from "lucide-react";
import { format, parseISO, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// We'll reuse the TaskCardDetailDialog for full detail view
import { TaskCardDetailDialog } from "@/components/task-boards/TaskCardDetailDialog";

export default function VisitasExternas() {
  const { user } = useAuth();
  const { data: members = [] } = useOrgMembers();

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<TaskCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const isAdmin = user?.role && ['owner', 'admin', 'manager'].includes(user.role);
  const isSuperadmin = (user as any)?.is_superadmin === true;
  const canViewAll = isAdmin || isSuperadmin;

  const filters = {
    assigned_to: canViewAll ? selectedUser : undefined,
    start_date: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    end_date: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    status: statusFilter || undefined,
  };

  const { data: visits, isLoading } = useTaskCardsByType("external_visit", filters);
  const { data: boards } = useTaskBoards();

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-100 text-red-700 border-red-200";
      case "high": return "bg-orange-100 text-orange-700 border-orange-200";
      case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const priorityLabels: Record<string, string> = {
    urgent: "Urgente", high: "Alta", medium: "Média", low: "Baixa",
  };

  const statusLabels: Record<string, string> = {
    todo: "A Fazer", in_progress: "Em Andamento", done: "Concluído",
  };

  const hasActiveFilters = startDate || endDate || (canViewAll && selectedUser !== "all") || statusFilter;

  const totalVisits = visits?.length || 0;
  const todayVisits = visits?.filter(v => v.due_date && isToday(parseISO(v.due_date))).length || 0;
  const overdueVisits = visits?.filter(v => v.due_date && isPast(parseISO(v.due_date)) && v.status !== "done").length || 0;
  const doneVisits = visits?.filter(v => v.status === "done").length || 0;

  const handleOpenDetail = (card: TaskCard) => {
    setSelectedCard(card);
    setDetailOpen(true);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              Visitas Externas
            </h1>
            <p className="text-muted-foreground">Tarefas do tipo Visita Externa em todos os quadros</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="relative"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Período:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn(!startDate && "text-muted-foreground")}>
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Data inicial"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  <span className="text-sm text-muted-foreground">até</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn(!endDate && "text-muted-foreground")}>
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Data final"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} disabled={(date) => startDate ? date < startDate : false} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  {(startDate || endDate) && (
                    <Button variant="ghost" size="icon" onClick={clearDateFilter} className="h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {canViewAll && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Vendedor:</span>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_statuses">Todos</SelectItem>
                      <SelectItem value="todo">A Fazer</SelectItem>
                      <SelectItem value="in_progress">Em Andamento</SelectItem>
                      <SelectItem value="done">Concluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={() => { clearDateFilter(); setSelectedUser("all"); setStatusFilter(""); }} className="text-muted-foreground">
                    Limpar filtros
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <MapPin className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{totalVisits}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CalendarIcon className="h-5 w-5 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{todayVisits}</p>
              <p className="text-xs text-muted-foreground">Hoje</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-red-500" />
              <p className="text-2xl font-bold">{overdueVisits}</p>
              <p className="text-xs text-muted-foreground">Atrasadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{doneVisits}</p>
              <p className="text-xs text-muted-foreground">Concluídas</p>
            </CardContent>
          </Card>
        </div>

        {/* Visit List */}
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !visits?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma visita encontrada</h3>
                <p className="text-muted-foreground mb-4">
                  Crie uma tarefa do tipo "Visita Externa" em qualquer quadro de tarefas para vê-la aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y min-w-[600px]">
                {visits.map((visit) => {
                  const isOverdue = visit.due_date && isPast(parseISO(visit.due_date)) && visit.status !== "done";
                  const isDueToday = visit.due_date && isToday(parseISO(visit.due_date));

                  return (
                    <div
                      key={visit.id}
                      className={cn(
                        "flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer",
                        isOverdue && "bg-red-50 dark:bg-red-900/10",
                        visit.status === "done" && "bg-green-50 dark:bg-green-900/10"
                      )}
                      onClick={() => handleOpenDetail(visit)}
                    >
                      {/* Status icon */}
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0",
                        visit.status === "done" ? "bg-green-500 border-green-500 text-white" :
                        visit.status === "in_progress" ? "bg-blue-500 border-blue-500 text-white" :
                        isOverdue ? "border-red-500" : "border-muted-foreground"
                      )}>
                        {visit.status === "done" && <CheckCircle className="h-4 w-4" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="h-4 w-4 text-primary shrink-0" />
                          <p className={cn("font-medium truncate", visit.status === "done" && "line-through text-muted-foreground")}>
                            {visit.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                          {visit.board_name && (
                            <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" />{visit.board_name}</span>
                          )}
                          {visit.assigned_name && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1"><User className="h-3 w-3" />{visit.assigned_name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className={cn("text-xs", statusLabels[visit.status] ? "" : "")}>
                          {statusLabels[visit.status] || visit.status}
                        </Badge>
                        <Badge variant="outline" className={getPriorityColor(visit.priority)}>
                          {priorityLabels[visit.priority] || visit.priority}
                        </Badge>
                        {visit.due_date && (
                          <span className={cn(
                            "text-sm whitespace-nowrap",
                            isOverdue && "text-red-600 font-medium",
                            isDueToday && !isOverdue && "text-primary font-medium"
                          )}>
                            {format(parseISO(visit.due_date), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog - reuses the full TaskCardDetailDialog */}
      {selectedCard && (
        <TaskCardDetailDialog
          open={detailOpen}
          onOpenChange={(open) => {
            setDetailOpen(open);
            if (!open) setSelectedCard(null);
          }}
          card={selectedCard}
          boardId={selectedCard.board_id}
          isGlobal={true}
          members={members}
          boards={boards}
        />
      )}
    </MainLayout>
  );
}
