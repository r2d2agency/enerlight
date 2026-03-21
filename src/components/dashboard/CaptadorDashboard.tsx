import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MapPin, Plus, Eye, Building2, Clock, CheckCircle2, Circle,
  LogIn, LogOut, Calendar, ChevronRight, Navigation, ArrowRight, ClipboardList,
} from "lucide-react";
import { useFieldCaptures, useFieldCaptureStats, useTodayReturns } from "@/hooks/use-captador";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: "Novo", color: "text-blue-500", bg: "bg-blue-500/10" },
  in_progress: { label: "Em Andamento", color: "text-amber-500", bg: "bg-amber-500/10" },
  converted: { label: "Convertido", color: "text-green-500", bg: "bg-green-500/10" },
  archived: { label: "Arquivado", color: "text-muted-foreground", bg: "bg-muted" },
};

export function CaptadorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: stats } = useFieldCaptureStats(user?.id);
  const { data: todayReturns = [] } = useTodayReturns();
  const { data: recentCaptures = [] } = useFieldCaptures();

  const todayCaptures = recentCaptures.filter((c) => {
    const today = new Date();
    return new Date(c.created_at).toDateString() === today.toDateString();
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          Captador
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-primary/20">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-primary">{todayCaptures.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Captações Hoje</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-amber-500">{todayReturns.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Retornos Hoje</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{stats.total_captures}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Fichas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-500">{stats.converted_count}</div>
              <div className="text-xs text-muted-foreground mt-1">Convertidos</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <a href="/captador" className="flex flex-col items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-5 transition-all hover:bg-primary/10 active:scale-[0.98]">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Plus className="h-6 w-6 text-primary" />
          </div>
          <span className="text-sm font-medium">Nova Captação</span>
        </a>
        <a href="/captador" className="flex flex-col items-center gap-2 rounded-xl border border-border p-5 transition-all hover:bg-accent active:scale-[0.98]">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Navigation className="h-6 w-6 text-muted-foreground" />
          </div>
          <span className="text-sm font-medium">Ver Mapa</span>
        </a>
      </div>

      {/* Today's Returns (Agenda) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-500" />
              Retornos de Hoje
            </CardTitle>
            {todayReturns.length > 0 && (
              <Badge variant="secondary" className="text-xs">{todayReturns.length}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {todayReturns.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum retorno agendado para hoje</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {todayReturns.map((capture) => {
                  const st = STATUS_MAP[capture.status] || STATUS_MAP.new;
                  return (
                    <a key={capture.id} href="/captador"
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent transition-colors border border-border/50">
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", st.bg)}>
                        <Building2 className={cn("h-5 w-5", st.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {capture.company_name || capture.address || "Obra"}
                        </p>
                        {capture.address && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" /> {capture.address}
                          </p>
                        )}
                        {capture.return_notes && (
                          <p className="text-xs text-primary/70 truncate mt-0.5">{capture.return_notes}</p>
                        )}
                        {capture.construction_stage && (
                          <Badge variant="outline" className="text-[10px] mt-1">{capture.construction_stage}</Badge>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </a>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Recent Captures */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Últimas Captações
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {recentCaptures.slice(0, 10).map((capture) => {
                const st = STATUS_MAP[capture.status] || STATUS_MAP.new;
                return (
                  <a key={capture.id} href="/captador"
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", st.bg)}>
                      <MapPin className={cn("h-4 w-4", st.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {capture.company_name || capture.address || "Obra"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(capture.created_at), "dd/MM HH:mm")}
                        {capture.construction_stage && ` • ${capture.construction_stage}`}
                      </p>
                    </div>
                    <Badge className={cn(st.bg, st.color, "border-0 text-[10px]")}>{st.label}</Badge>
                  </a>
                );
              })}
              {recentCaptures.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhuma captação ainda</p>
                </div>
              )}
            </div>
          </ScrollArea>
          {recentCaptures.length > 0 && (
            <a href="/captador" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline mt-3 pt-2 border-t border-border">
              Ver todas as fichas <ArrowRight className="h-3 w-3" />
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
