import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, BellOff, Volume2, VolumeX, X, MessageSquare, FolderKanban, StickyNote, AtSign, Hash, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { chatEvents } from "@/lib/chat-events";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { safeFormatDate } from "@/lib/utils";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { useProjectNoteNotifications, useProjectNoteNotificationMutations } from "@/hooks/use-projects";
import { useUnreadMentions, useUnreadMentionCount } from "@/hooks/use-internal-chat";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supportsPushNotifications, subscribeToPush, isPushSubscribed, getPushPermissionStatus } from "@/lib/push-notifications";

interface UnreadConversation {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  unread_count: number;
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  connection_name: string;
  attendance_status?: string | null;
  created_at?: string | null;
}

export function MessageNotifications() {
  const queryClient = useQueryClient();
  const [unreadConversations, setUnreadConversations] = useState<UnreadConversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("notification-sound-enabled");
    return saved !== "false";
  });
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("messages");
  const previousUnreadRef = useRef<number>(0);
  const previousConversationIdsRef = useRef<Set<string>>(new Set());
  
  const { playSound, playNewConversationSound, settings } = useNotificationSound();

  // Project note notifications
  const { data: projectNotifications = [] } = useProjectNoteNotifications();
  const projectNotifMut = useProjectNoteNotificationMutations();
  const totalProjectNotifs = projectNotifications.length;

  // Internal chat mention notifications
  const { data: internalMentions = [] } = useUnreadMentions();
  const { data: mentionCountData } = useUnreadMentionCount();
  const totalMentions = mentionCountData?.count || internalMentions.length;
  const previousMentionsRef = useRef<number>(0);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported] = useState(() => supportsPushNotifications());

  const grandTotal = totalUnread + totalProjectNotifs + totalMentions;

  // Toast popup for new mentions
  useEffect(() => {
    if (totalMentions > previousMentionsRef.current && previousMentionsRef.current >= 0) {
      const newCount = totalMentions - previousMentionsRef.current;
      if (previousMentionsRef.current > 0 || totalMentions > 0) {
        const latestMention = internalMentions[0];
        if (latestMention && newCount > 0 && previousMentionsRef.current > 0) {
          toast.info(`${latestMention.sender_name} mencionou você`, {
            description: `#${latestMention.channel_name} / ${latestMention.topic_title}`,
            action: {
              label: "Ver",
              onClick: () => { window.location.href = "/comunicacao"; },
            },
            duration: 8000,
          });
          if (soundEnabled) playSound();
        }
      }
    }
    previousMentionsRef.current = totalMentions;
  }, [totalMentions, internalMentions]);

  // Check push subscription status on mount
  useEffect(() => {
    if (pushSupported) {
      isPushSubscribed().then(setPushSubscribed);
    }
  }, [pushSupported]);

  const handleTogglePush = async () => {
    if (pushSubscribed) {
      // Already subscribed
      toast.info("Notificações push já estão ativas!");
      return;
    }
    const permission = getPushPermissionStatus();
    if (permission === 'denied') {
      toast.error("Notificações foram bloqueadas no navegador. Vá nas configurações do navegador para permitir.");
      return;
    }
    const result = await subscribeToPush();
    if (result) {
      setPushSubscribed(true);
      toast.success("Notificações push ativadas! Você receberá alertas mesmo com o app minimizado.");
    } else {
      toast.error("Não foi possível ativar as notificações push.");
    }
  };

  const handleDismissMention = async (mentionId: string) => {
    try {
      await api(`/api/internal-chat/mentions/${mentionId}/read`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["internal-mentions"] });
      queryClient.invalidateQueries({ queryKey: ["internal-mentions-count"] });
    } catch (err) {
      console.error("Error dismissing mention:", err);
    }
  };

  // Save sound preference
  useEffect(() => {
    localStorage.setItem("notification-sound-enabled", soundEnabled.toString());
  }, [soundEnabled]);

  // Fetch unread conversations
  const fetchUnreadConversations = useCallback(async (emitEvent = false) => {
    try {
      const data = await api<UnreadConversation[]>("/api/chat/conversations/unread");
      setUnreadConversations(data);
      
      const newTotal = data.reduce((sum, c) => sum + c.unread_count, 0);
      const currentIds = new Set(data.map(c => c.id));
      
      // Check for brand new conversations (IDs that weren't in previous list)
      const newConversationIds = [...currentIds].filter(id => !previousConversationIdsRef.current.has(id));
      const hasNewConversations = newConversationIds.length > 0 && previousConversationIdsRef.current.size > 0;
      
      // Check for new messages in existing conversations
      const hasNewMessagesInExisting = newTotal > previousUnreadRef.current && !hasNewConversations;
      
      // Play appropriate sound
      if (soundEnabled && settings.soundEnabled && previousUnreadRef.current >= 0) {
        if (hasNewConversations) {
          // New conversation entering the queue - play special double sound
          console.log('[Notifications] New conversation detected:', newConversationIds);
          playNewConversationSound();
        } else if (hasNewMessagesInExisting && previousUnreadRef.current > 0) {
          // New message in existing conversation - play regular sound
          playSound();
        }
      }
      
      // Broadcast to other components to refresh immediately
      if (emitEvent && (hasNewConversations || hasNewMessagesInExisting)) {
        chatEvents.emit('new_message');
      }
      
      previousConversationIdsRef.current = currentIds;
      previousUnreadRef.current = newTotal;
      setTotalUnread(newTotal);
    } catch (error) {
      console.error("Error fetching unread conversations:", error);
    }
  }, [soundEnabled, settings.soundEnabled, playSound, playNewConversationSound]);

  // Poll for unread messages - faster polling (every 3 seconds)
  useEffect(() => {
    fetchUnreadConversations(false); // Initial fetch without event
    
    const interval = setInterval(() => fetchUnreadConversations(true), 3000);
    
    return () => clearInterval(interval);
  }, [fetchUnreadConversations]);

  // Clear notification for a conversation
  const handleClearNotification = async (conversationId: string) => {
    try {
      await api(`/api/chat/conversations/${conversationId}/read`, { method: "POST" });
      setUnreadConversations(prev => prev.filter(c => c.id !== conversationId));
      setTotalUnread(prev => {
        const conv = unreadConversations.find(c => c.id === conversationId);
        return Math.max(0, prev - (conv?.unread_count || 0));
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  // Navigate to conversation
  const handleGoToConversation = (conversationId: string) => {
    setIsOpen(false);
    // Navigate to chat page - the conversation will be selected there
    window.location.href = `/chat?conversation=${conversationId}`;
  };

  const formatMessagePreview = (conv: UnreadConversation) => {
    if (!conv.last_message && !conv.last_message_type) return "Nova mensagem";
    
    if (conv.last_message_type === "audio") return "🎤 Áudio";
    if (conv.last_message_type === "image") return "📷 Imagem";
    if (conv.last_message_type === "video") return "🎥 Vídeo";
    if (conv.last_message_type === "document") return "📄 Documento";
    
    return conv.last_message?.slice(0, 50) || "Nova mensagem";
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
        >
          {grandTotal > 0 ? (
            <Bell className="h-5 w-5 text-primary animate-pulse" />
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground" />
          )}
          {grandTotal > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 text-[10px] font-bold"
            >
              {grandTotal > 99 ? "99+" : grandTotal}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[calc(100vw-1rem)] max-w-80 p-0 mx-2 sm:mx-0 sm:w-80" 
        align="end"
        sideOffset={8}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between p-2 border-b">
            <TabsList className="h-8">
              <TabsTrigger value="messages" className="text-xs h-7 gap-1">
                <MessageSquare className="h-3 w-3" />
                Msgs {totalUnread > 0 && <Badge variant="secondary" className="text-[9px] px-1 h-4">{totalUnread}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="projects" className="text-xs h-7 gap-1">
                <FolderKanban className="h-3 w-3" />
                Projetos {totalProjectNotifs > 0 && <Badge variant="destructive" className="text-[9px] px-1 h-4">{totalProjectNotifs}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="interno" className="text-xs h-7 gap-1">
                <AtSign className="h-3 w-3" />
                Interno {totalMentions > 0 && <Badge variant="destructive" className="text-[9px] px-1 h-4">{totalMentions}</Badge>}
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-0.5">
              {pushSupported && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleTogglePush}
                  title={pushSubscribed ? "Notificações push ativas" : "Ativar notificações push"}
                >
                  <BellRing className={`h-3.5 w-3.5 ${pushSubscribed ? 'text-primary' : 'text-muted-foreground'}`} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Desativar som" : "Ativar som"}
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
              </Button>
            </div>
          </div>

          <TabsContent value="messages" className="mt-0">
            <ScrollArea className="max-h-[60vh] sm:max-h-[300px]">
              {unreadConversations.length === 0 ? (
                <div className="p-6 sm:p-4 text-center text-sm text-muted-foreground">
                  <BellOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhuma mensagem não lida
                </div>
              ) : (
                <div className="divide-y">
                  {unreadConversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="p-3 hover:bg-muted/50 cursor-pointer transition-colors group"
                      onClick={() => handleGoToConversation(conv.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <MessageSquare className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm truncate">
                              {conv.contact_name || conv.contact_phone || "Desconhecido"}
                            </p>
                            <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                              {conv.unread_count}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {formatMessagePreview(conv)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                              {conv.connection_name}
                            </span>
                            {conv.last_message_at && (
                              <>
                                <span className="text-[10px] text-muted-foreground">•</span>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {safeFormatDate(conv.last_message_at, "HH:mm", { locale: ptBR })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearNotification(conv.id);
                          }}
                          title="Marcar como lida"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            {unreadConversations.length > 0 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-8"
                  onClick={() => { setIsOpen(false); window.location.href = "/chat"; }}
                >
                  Ver todas as conversas
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects" className="mt-0">
            <ScrollArea className="max-h-[60vh] sm:max-h-[300px]">
              {projectNotifications.length === 0 ? (
                <div className="p-6 sm:p-4 text-center text-sm text-muted-foreground">
                  <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhuma notificação de projeto
                </div>
              ) : (
                <div className="divide-y">
                  {projectNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="p-3 hover:bg-muted/50 cursor-pointer transition-colors group"
                      onClick={() => {
                        projectNotifMut.markRead.mutate(notif.id);
                        setIsOpen(false);
                        window.location.href = "/projetos";
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <StickyNote className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{notif.project_title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="font-medium">{notif.sender_name}</span>: {notif.content_preview}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {safeFormatDate(notif.created_at, "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            projectNotifMut.markRead.mutate(notif.id);
                          }}
                          title="Marcar como lida"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            {projectNotifications.length > 0 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-8"
                  onClick={() => projectNotifMut.markAllRead.mutate()}
                >
                  Marcar todas como lidas
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="interno" className="mt-0">
            <ScrollArea className="max-h-[60vh] sm:max-h-[300px]">
              {internalMentions.length === 0 ? (
                <div className="p-6 sm:p-4 text-center text-sm text-muted-foreground">
                  <AtSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhuma menção não lida
                </div>
              ) : (
                <div className="divide-y">
                  {internalMentions.map((mention) => (
                    <div
                      key={mention.id}
                      className="p-3 hover:bg-muted/50 cursor-pointer transition-colors group"
                      onClick={() => {
                        handleDismissMention(mention.id);
                        setIsOpen(false);
                        window.location.href = "/comunicacao";
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <AtSign className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{mention.sender_name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {mention.content?.slice(0, 60) || "Nova menção"}
                          </p>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                            <Hash className="h-2.5 w-2.5" />
                            <span className="truncate">{mention.channel_name} / {mention.topic_title}</span>
                            <span>•</span>
                            <span className="whitespace-nowrap">
                              {safeFormatDate(mention.created_at, "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDismissMention(mention.id);
                          }}
                          title="Marcar como lida"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            {internalMentions.length > 0 && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-8"
                  onClick={async () => {
                    for (const m of internalMentions) await handleDismissMention(m.id);
                  }}
                >
                  Marcar todas como lidas
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
