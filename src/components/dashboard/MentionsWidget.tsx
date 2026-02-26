import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AtSign, Hash, MessageSquare, ArrowRight } from "lucide-react";
import { useUnreadMentions } from "@/hooks/use-internal-chat";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function MentionsWidget() {
  const { data: mentions = [] } = useUnreadMentions();

  return (
    <Card className="animate-fade-in shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AtSign className="h-4 w-4 text-primary" />
            Menções Recentes
          </CardTitle>
          {mentions.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">{mentions.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {mentions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <AtSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma menção pendente</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[240px]">
            <div className="space-y-2 pr-2">
              {mentions.slice(0, 8).map((m) => (
                <a
                  key={m.id}
                  href="/comunicacao"
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors group"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.sender_name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Hash className="h-3 w-3" />
                      <span className="truncate">{m.channel_name} / {m.topic_title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{m.content?.slice(0, 60)}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-1">
                    {format(new Date(m.created_at), "HH:mm", { locale: ptBR })}
                  </span>
                </a>
              ))}
            </div>
          </ScrollArea>
        )}
        {mentions.length > 0 && (
          <a href="/comunicacao" className="flex items-center justify-center gap-1 text-xs text-primary hover:underline mt-3 pt-2 border-t border-border">
            Ver todas <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
