import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, ArrowRight, Video } from "lucide-react";
import { useMeetings } from "@/hooks/use-meetings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-500/10 text-blue-500",
  in_progress: "bg-amber-500/10 text-amber-500",
  completed: "bg-green-500/10 text-green-500",
  cancelled: "bg-muted text-muted-foreground",
};

export function AgendaWidget() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: meetings = [] } = useMeetings({ date_from: today, date_to: today });

  const active = meetings.filter(m => m.status !== "cancelled");

  return (
    <Card className="animate-fade-in shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Agenda de Hoje
          </CardTitle>
          {active.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{active.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {active.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum compromisso hoje</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[240px]">
            <div className="space-y-2 pr-2">
              {active.map((meeting) => (
                <a
                  key={meeting.id}
                  href="/reunioes"
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors"
                >
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    statusColors[meeting.status] || statusColors.scheduled
                  )}>
                    <Video className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{meeting.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{meeting.start_time?.slice(0, 5)} - {meeting.end_time?.slice(0, 5)}</span>
                      </div>
                      {meeting.location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">{meeting.location}</span>
                        </div>
                      )}
                    </div>
                    {(meeting.deal_title || meeting.project_title) && (
                      <p className="text-xs text-primary/70 truncate mt-0.5">
                        {meeting.deal_title || meeting.project_title}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {meeting.participant_count} part.
                  </span>
                </a>
              ))}
            </div>
          </ScrollArea>
        )}
        {active.length > 0 && (
          <a href="/reunioes" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline mt-3 pt-2 border-t border-border">
            Ver agenda completa <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
