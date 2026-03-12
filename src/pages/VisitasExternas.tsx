import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCRMMyTeam } from "@/hooks/use-crm";
import { CheckCircle, AlertTriangle, Calendar as CalendarIcon, MapPin, Loader2, Filter, X, User, Users, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";

interface ExternalVisitListItem {
  id: string;
  deal_id: string;
  deal_title: string;
  title: string;
  visit_date: string;
  start_time?: string;
  end_time?: string;
  status: string;
  address?: string;
  created_by_name?: string;
  participants: { id: string; user_id: string; user_name: string }[];
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const getVisitDateOnly = (value?: string) => {
  if (!value) return "";
  const [dateOnly] = value.split("T");
  return DATE_ONLY_REGEX.test(dateOnly) ? dateOnly : "";
};

const formatVisitDateBR = (value?: string) => {
  const dateOnly = getVisitDateOnly(value);
  if (!dateOnly) return "—";
  const [year, month, day] = dateOnly.split("-");
  return `${day}/${month}/${year}`;
};

export default function VisitasExternas() {
  const { user } = useAuth();
  const { data: teamMembers = [] } = useCRMMyTeam();

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");

  // For opening deal dialog
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);

  const isAdmin = user?.role && ['owner', 'admin', 'manager'].includes(user.role);
  const isSuperadmin = (user as any)?.is_superadmin === true;
  const canViewAll = isAdmin || isSuperadmin;

  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("start_date", format(startDate, "yyyy-MM-dd"));
  if (endDate) queryParams.set("end_date", format(endDate, "yyyy-MM-dd"));
  if (statusFilter && statusFilter !== "all_statuses") queryParams.set("status", statusFilter);
  if (canViewAll && selectedUser !== "all") queryParams.set("user_id", selectedUser);

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ["crm-external-visits", queryParams.toString()],
    queryFn: () => api<ExternalVisitListItem[]>(`/api/crm/external-visits?${queryParams.toString()}`),
  });

  const clearDateFilter = () => { setStartDate(undefined); setEndDate(undefined); };

  const statusLabels: Record<string, string> = {
    scheduled: "Agendada", in_progress: "Em Andamento", completed: "Concluída", cancelled: "Cancelada",
  };

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-muted text-muted-foreground",
  };

  const hasActiveFilters = startDate || endDate || (canViewAll && selectedUser !== "all") || statusFilter;
  const totalVisits = visits.length;
  const todayDateOnly = format(new Date(), "yyyy-MM-dd");
  const todayVisits = visits.filter((v) => getVisitDateOnly(v.visit_date) === todayDateOnly).length;
  const overdueVisits = visits.filter((v) => {
    const visitDateOnly = getVisitDateOnly(v.visit_date);
    return Boolean(visitDateOnly) && visitDateOnly < todayDateOnly && v.status === "scheduled";
  }).length;
  const doneVisits = visits.filter(v => v.status === "completed").length;

  const handleOpenDeal = (visit: ExternalVisitListItem) => {
    setSelectedDealId(visit.deal_id);
    setDealDialogOpen(true);
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
            <p className="text-muted-foreground">Visitas agendadas nas negociações do CRM</p>
          </div>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="relative"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {hasActiveFilters && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />}
          </Button>
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
                        {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Início"}
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
                        {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Fim"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} disabled={(d) => startDate ? d < startDate : false} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  {(startDate || endDate) && (
                    <Button variant="ghost" size="icon" onClick={clearDateFilter} className="h-8 w-8"><X className="h-4 w-4" /></Button>
                  )}
                </div>

                {canViewAll && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Vendedor:</span>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {teamMembers.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_statuses">Todos</SelectItem>
                      <SelectItem value="scheduled">Agendada</SelectItem>
                      <SelectItem value="in_progress">Em Andamento</SelectItem>
                      <SelectItem value="completed">Concluída</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
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
          <Card><CardContent className="p-4 text-center">
            <MapPin className="h-5 w-5 mx-auto mb-2 text-primary" />
            <p className="text-2xl font-bold">{totalVisits}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <CalendarIcon className="h-5 w-5 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{todayVisits}</p>
            <p className="text-xs text-muted-foreground">Hoje</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-red-500" />
            <p className="text-2xl font-bold">{overdueVisits}</p>
            <p className="text-xs text-muted-foreground">Atrasadas</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold">{doneVisits}</p>
            <p className="text-xs text-muted-foreground">Concluídas</p>
          </CardContent></Card>
        </div>

        {/* Visit List */}
        <Card className="min-w-0 overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !visits.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma visita encontrada</h3>
                <p className="text-muted-foreground">Agende visitas externas dentro das negociações do CRM.</p>
              </div>
            ) : (
              <div className="divide-y min-w-[600px]">
                {visits.map((visit) => {
                  const visitDateOnly = getVisitDateOnly(visit.visit_date);
                  const isOverdue = Boolean(visitDateOnly) && visitDateOnly < todayDateOnly && visit.status === "scheduled";
                  const isDueToday = visitDateOnly === todayDateOnly;

                  return (
                    <div
                      key={visit.id}
                      className={cn(
                        "flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors cursor-pointer",
                        isOverdue && "bg-destructive/5",
                        visit.status === "completed" && "bg-green-50 dark:bg-green-900/10"
                      )}
                      onClick={() => handleOpenDeal(visit)}
                    >
                      <MapPin className={cn("h-5 w-5 shrink-0", isOverdue ? "text-destructive" : "text-primary")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn("font-medium truncate", visit.status === "completed" && "line-through text-muted-foreground")}>
                            {visit.title}
                          </span>
                          <Badge className={cn("text-[10px] px-1.5 shrink-0", statusColors[visit.status])}>
                            {statusLabels[visit.status] || visit.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                          {visit.deal_title && <span className="truncate max-w-[200px]">📋 {visit.deal_title}</span>}
                          {visit.participants?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {visit.participants.map(p => p.user_name).join(", ")}
                            </span>
                          )}
                          {visit.address && <span className="truncate max-w-[150px]">📍 {visit.address}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {visit.start_time && (
                          <span className="text-sm flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {visit.start_time.slice(0, 5)}
                          </span>
                        )}
                        <span className={cn(
                          "text-sm whitespace-nowrap",
                          isOverdue && "text-destructive font-medium",
                          isDueToday && !isOverdue && "text-primary font-medium"
                        )}>
                          {format(parseISO(visit.visit_date), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deal Detail Dialog - opens on visits tab */}
      {selectedDealId && (
        <DealDetailDialog
          deal={{ id: selectedDealId } as any}
          open={dealDialogOpen}
          onOpenChange={(open) => {
            setDealDialogOpen(open);
            if (!open) setSelectedDealId(null);
          }}
        />
      )}
    </MainLayout>
  );
}
