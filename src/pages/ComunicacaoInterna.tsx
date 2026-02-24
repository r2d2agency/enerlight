import { useState, useRef, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Hash, Plus, Search, Send, Paperclip, AtSign, MessageSquare,
  ChevronRight, Circle, CheckCircle2, Clock, Trash2, Users,
  ArrowLeft, Filter, MoreVertical, Building2, Loader2, FileText,
  Reply, X
} from "lucide-react";
import { TopicLinksBadges } from "@/components/chat-interno/TopicLinksBadges";
import { ChannelMembersDialog } from "@/components/chat-interno/ChannelMembersDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useUpload } from "@/hooks/use-upload";
import {
  useInternalChannels,
  useCreateChannel,
  useTopics,
  useCreateTopic,
  useUpdateTopic,
  useTopicMessages,
  useSendMessage,
  useChannelMembers,
  useInternalSearch,
  useUnreadMentions,
  type InternalChannel,
  type InternalTopic,
  type InternalMessage,
} from "@/hooks/use-internal-chat";
import { useDepartments } from "@/hooks/use-departments";
import { useAuth } from "@/contexts/AuthContext";

const statusConfig = {
  open: { label: "Aberto", icon: Circle, color: "text-blue-500", bg: "bg-blue-500/10" },
  in_progress: { label: "Em andamento", icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  closed: { label: "Fechado", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
};

export default function ComunicacaoInterna() {
  const { user } = useAuth();
  const [selectedChannel, setSelectedChannel] = useState<InternalChannel | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<InternalTopic | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelDept, setNewChannelDept] = useState("");
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<{ file_url: string; file_name: string; file_size?: number; file_type?: string }[]>([]);
  const [replyingTo, setReplyingTo] = useState<InternalMessage | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIdx, setMentionStartIdx] = useState(-1);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { uploadFile, isUploading } = useUpload();

  const { data: channels = [], isLoading: loadingChannels } = useInternalChannels(departmentFilter || undefined);
  const { data: topics = [], isLoading: loadingTopics } = useTopics(selectedChannel?.id || null, statusFilter || undefined);
  const { data: messages = [], isLoading: loadingMessages } = useTopicMessages(selectedTopic?.id || null);
  const { data: members = [] } = useChannelMembers(selectedChannel?.id || null);
  const { data: searchResults = [] } = useInternalSearch(showSearch ? searchQuery : "");
  const { data: unreadMentions = [] } = useUnreadMentions();

  const createChannel = useCreateChannel();
  const createTopic = useCreateTopic();
  const updateTopic = useUpdateTopic();
  const sendMessage = useSendMessage();

  const [depts, setDepts] = useState<{ id: string; name: string }[]>([]);
  const { getDepartments } = useDepartments();

  useEffect(() => {
    getDepartments().then(d => setDepts(d.map(x => ({ id: x.id, name: x.name }))));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      const ch = await createChannel.mutateAsync({
        name: newChannelName,
        description: newChannelDesc || undefined,
        department_id: newChannelDept || undefined,
      });
      setShowNewChannel(false);
      setNewChannelName("");
      setNewChannelDesc("");
      setNewChannelDept("");
      setSelectedChannel(ch);
      toast.success("Canal criado!");
    } catch {
      toast.error("Erro ao criar canal");
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopicTitle.trim() || !selectedChannel) return;
    try {
      const t = await createTopic.mutateAsync({ channelId: selectedChannel.id, title: newTopicTitle });
      setShowNewTopic(false);
      setNewTopicTitle("");
      setSelectedTopic(t);
      toast.success("Tópico criado!");
    } catch {
      toast.error("Erro ao criar tópico");
    }
  };

  // Parse @mentions from text
  const parseMentions = (text: string): string[] => {
    const mentionedIds: string[] = [];
    members.forEach(m => {
      if (text.includes(`@${m.user_name}`)) {
        mentionedIds.push(m.user_id);
      }
    });
    return mentionedIds;
  };

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !pendingAttachments.length) || !selectedTopic) return;
    const mentions = parseMentions(messageText);
    const content = replyingTo
      ? `> ${replyingTo.sender_name}: ${replyingTo.content.slice(0, 80)}${replyingTo.content.length > 80 ? '...' : ''}\n\n${messageText}`
      : messageText;
    try {
      await sendMessage.mutateAsync({
        topicId: selectedTopic.id,
        content,
        mentions,
        attachments: pendingAttachments.length ? pendingAttachments : undefined,
      });
      setMessageText("");
      setPendingAttachments([]);
      setReplyingTo(null);
    } catch {
      toast.error("Erro ao enviar mensagem");
    }
  };

  // Mention autocomplete logic
  const filteredMembers = members.filter(m =>
    !mentionQuery || m.user_name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessageText(val);

    const cursorPos = e.target.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const lastAt = textBefore.lastIndexOf("@");

    if (lastAt === -1) {
      setShowMentionSuggestions(false);
      return;
    }

    const charBefore = lastAt > 0 ? textBefore[lastAt - 1] : " ";
    if (charBefore !== " " && charBefore !== "\n" && lastAt !== 0) {
      setShowMentionSuggestions(false);
      return;
    }

    const afterAt = textBefore.slice(lastAt + 1);
    if (afterAt.includes(" ") || afterAt.includes("\n")) {
      setShowMentionSuggestions(false);
      return;
    }

    setMentionQuery(afterAt);
    setMentionStartIdx(lastAt);
    setMentionSelectedIdx(0);
    setShowMentionSuggestions(true);
  }, []);

  const handleSelectMention = useCallback((member: { user_id: string; user_name: string }) => {
    const cursorPos = textareaRef.current?.selectionStart || messageText.length;
    const before = messageText.slice(0, mentionStartIdx);
    const after = messageText.slice(cursorPos);
    const newText = `${before}@${member.user_name} ${after}`;
    setMessageText(newText);
    setShowMentionSuggestions(false);
    setMentionQuery("");
    setMentionStartIdx(-1);
    setTimeout(() => {
      const newPos = mentionStartIdx + member.user_name.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  }, [messageText, mentionStartIdx]);

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionSuggestions && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIdx(prev => (prev < filteredMembers.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIdx(prev => (prev > 0 ? prev - 1 : filteredMembers.length - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectMention(filteredMembers[mentionSelectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionSuggestions(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      if (url) {
        setPendingAttachments(prev => [...prev, {
          file_url: url,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        }]);
      }
    } catch {
      toast.error("Erro ao enviar arquivo");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleChangeStatus = (topicId: string, newStatus: string) => {
    updateTopic.mutate({ id: topicId, status: newStatus });
  };

  // Render message content with highlighted mentions and reply quotes
  const renderContent = (content: string) => {
    // Handle reply quotes
    const lines = content.split("\n");
    const quoteLines: string[] = [];
    let restLines: string[] = [];
    let passedQuote = false;
    for (const line of lines) {
      if (!passedQuote && line.startsWith("> ")) {
        quoteLines.push(line.slice(2));
      } else {
        passedQuote = true;
        restLines.push(line);
      }
    }
    const restText = restLines.join("\n").trim();

    const highlightMentions = (text: string) => {
      const parts = text.split(/(@\w[\w\s]*)/g);
      return parts.map((part, i) => {
        if (part.startsWith("@")) {
          return <span key={i} className="text-primary font-medium bg-primary/10 rounded px-1">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      });
    };

    return (
      <>
        {quoteLines.length > 0 && (
          <div className="border-l-2 border-primary/40 pl-2 mb-1 text-xs text-muted-foreground italic">
            {quoteLines.map((q, i) => <div key={i}>{q}</div>)}
          </div>
        )}
        {highlightMentions(restText)}
      </>
    );
  };

  // ========== MOBILE-FRIENDLY 3-PANEL LAYOUT ==========
  const showChannelList = !selectedChannel;
  const showTopicList = !!selectedChannel && !selectedTopic;
  const showMessages = !!selectedTopic;

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* PANEL 1: Channels */}
        <div className={cn(
          "flex flex-col border-r border-border bg-card w-full md:w-80 md:min-w-[320px] shrink-0",
          !showChannelList && "hidden md:flex"
        )}>
          <div className="p-4 space-y-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Comunicação
              </h2>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSearch(!showSearch)}>
                  <Search className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowNewChannel(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {showSearch && (
              <Input
                placeholder="Buscar mensagens..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-sm"
              />
            )}

            <Select value={departmentFilter} onValueChange={v => setDepartmentFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs">
                <Building2 className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Todos departamentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos departamentos</SelectItem>
                {depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Search Results */}
          {showSearch && searchQuery.length >= 2 ? (
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {searchResults.map((r: any) => (
                  <div key={r.id} className="p-3 rounded-lg hover:bg-accent cursor-pointer text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Hash className="h-3 w-3" />{r.channel_name} / {r.topic_title}
                    </div>
                    <p className="text-foreground line-clamp-2">{r.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">{r.sender_name}</p>
                  </div>
                ))}
                {searchResults.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Nenhum resultado</p>}
              </div>
            </ScrollArea>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {loadingChannels ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : channels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum canal criado</p>
                    <Button variant="link" size="sm" onClick={() => setShowNewChannel(true)}>Criar canal</Button>
                  </div>
                ) : channels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => { setSelectedChannel(ch); setSelectedTopic(null); }}
                    className={cn(
                      "w-full text-left p-3 rounded-lg transition-colors",
                      selectedChannel?.id === ch.id ? "bg-accent" : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-sm truncate">{ch.name}</span>
                      {ch.open_topics_count > 0 && (
                        <Badge variant="secondary" className="ml-auto text-xs">{ch.open_topics_count}</Badge>
                      )}
                    </div>
                    {ch.department_name && (
                      <p className="text-xs text-muted-foreground mt-1 ml-6">{ch.department_name}</p>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* PANEL 2: Topics */}
        <div className={cn(
          "flex flex-col border-r border-border bg-background w-full md:w-80 md:min-w-[320px] shrink-0",
          !showTopicList && "hidden md:flex"
        )}>
          <div className="p-4 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setSelectedChannel(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Hash className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm truncate flex-1">{selectedChannel?.name || "Selecione um canal"}</h3>
              {selectedChannel && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMembers(true)}>
                        <Users className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Gerenciar membros</TooltipContent>
                  </Tooltip>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowNewTopic(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            {selectedChannel && (
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="h-7 text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Todos status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Abertos</SelectItem>
                  <SelectItem value="in_progress">Em andamento</SelectItem>
                  <SelectItem value="closed">Fechados</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {!selectedChannel ? (
                <p className="text-sm text-muted-foreground text-center py-8">Selecione um canal à esquerda</p>
              ) : loadingTopics ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : topics.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <p>Nenhum tópico</p>
                  <Button variant="link" size="sm" onClick={() => setShowNewTopic(true)}>Criar tópico</Button>
                </div>
              ) : topics.map(t => {
                const sc = statusConfig[t.status];
                const StatusIcon = sc.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTopic(t)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg transition-colors",
                      selectedTopic?.id === t.id ? "bg-accent" : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn("h-4 w-4 shrink-0", sc.color)} />
                      <span className="font-medium text-sm truncate flex-1">{t.title}</span>
                      {t.message_count > 0 && (
                        <span className="text-xs text-muted-foreground">{t.message_count}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-6 text-xs text-muted-foreground">
                      <span>{t.created_by_name}</span>
                      {t.last_message_at && (
                        <>
                          <span>·</span>
                          <span>{format(new Date(t.last_message_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* PANEL 3: Messages */}
        <div className={cn(
          "flex flex-col flex-1 min-w-0",
          !showMessages && "hidden md:flex"
        )}>
          {selectedTopic ? (
            <>
              {/* Topic Header */}
              <div className="p-4 border-b border-border flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setSelectedTopic(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{selectedTopic.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      {selectedChannel?.name} · {selectedTopic.message_count || 0} mensagens
                    </p>
                    <TopicLinksBadges topicId={selectedTopic.id} />
                  </div>
                </div>
                <Select
                  value={selectedTopic.status}
                  onValueChange={(v) => {
                    handleChangeStatus(selectedTopic.id, v);
                    setSelectedTopic({ ...selectedTopic, status: v as any });
                  }}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">🔵 Aberto</SelectItem>
                    <SelectItem value="in_progress">🟡 Em andamento</SelectItem>
                    <SelectItem value="closed">🟢 Fechado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                  {loadingMessages ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">Nenhuma mensagem ainda</p>
                  ) : messages.map(msg => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div key={msg.id} className={cn("flex gap-3 group/msg", isMe && "flex-row-reverse")}>
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                          {msg.sender_name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div className={cn("max-w-[70%] space-y-1", isMe && "items-end")}>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{msg.sender_name}</span>
                            <span>{format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                            <button
                              onClick={() => {
                                setReplyingTo(msg);
                                textareaRef.current?.focus();
                              }}
                              className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent"
                              title="Responder"
                            >
                              <Reply className="h-3 w-3" />
                            </button>
                          </div>
                          <div className={cn(
                            "rounded-lg p-3 text-sm",
                            isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}>
                            {renderContent(msg.content)}
                          </div>
                          {/* Attachments */}
                          {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {msg.attachments.map((att) => (
                                <a
                                  key={att.id}
                                  href={att.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-accent hover:bg-accent/80 transition"
                                >
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate max-w-[120px]">{att.file_name}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-4 border-t border-border">
                {/* Reply banner */}
                {replyingTo && (
                  <div className="flex items-center gap-2 mb-2 p-2 rounded bg-muted text-sm max-w-3xl mx-auto">
                    <Reply className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-xs">{replyingTo.sender_name}</span>
                      <p className="text-xs text-muted-foreground truncate">{replyingTo.content.slice(0, 80)}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="shrink-0">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                )}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pendingAttachments.map((att, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" />
                        <span className="truncate max-w-[100px]">{att.file_name}</span>
                        <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="relative flex items-end gap-2 max-w-3xl mx-auto">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                  <Button
                    variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  </Button>

                  {/* Mention suggestions popup */}
                  {showMentionSuggestions && filteredMembers.length > 0 && (
                    <div className="absolute bottom-full left-10 mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                      <div className="px-2 py-1 text-xs text-muted-foreground border-b mb-1">
                        Membros do canal
                      </div>
                      {filteredMembers.map((member, index) => (
                        <button
                          key={member.id}
                          className={cn(
                            "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors",
                            index === mentionSelectedIdx && "bg-muted"
                          )}
                          onClick={() => handleSelectMention(member)}
                          onMouseEnter={() => setMentionSelectedIdx(index)}
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                            {member.user_name?.charAt(0)?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{member.user_name}</div>
                            <div className="text-xs text-muted-foreground truncate">{member.user_email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <Textarea
                    ref={textareaRef}
                    placeholder={`Mensagem... Use @nome para mencionar`}
                    value={messageText}
                    onChange={handleTextChange}
                    onKeyDown={handleTextareaKeyDown}
                    className="min-h-[40px] max-h-[120px] resize-none text-sm"
                    rows={1}
                  />
                  <Button
                    size="icon" className="h-9 w-9 shrink-0"
                    onClick={handleSendMessage}
                    disabled={sendMessage.isPending || (!messageText.trim() && !pendingAttachments.length)}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <MessageSquare className="h-12 w-12 mx-auto opacity-30" />
                <p className="text-sm">Selecione um tópico para ver as mensagens</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Channel Dialog */}
      <Dialog open={showNewChannel} onOpenChange={setShowNewChannel}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Canal</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome do canal *</label>
              <Input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} placeholder="Ex: Faturamento" />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={newChannelDesc} onChange={e => setNewChannelDesc(e.target.value)} placeholder="Descrição do canal..." />
            </div>
            <div>
              <label className="text-sm font-medium">Departamento</label>
              <Select value={newChannelDept} onValueChange={setNewChannelDept}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewChannel(false)}>Cancelar</Button>
            <Button onClick={handleCreateChannel} disabled={!newChannelName.trim() || createChannel.isPending}>
              {createChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Canal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Topic Dialog */}
      <Dialog open={showNewTopic} onOpenChange={setShowNewTopic}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Tópico</DialogTitle></DialogHeader>
          <div>
            <label className="text-sm font-medium">Assunto *</label>
            <Input
              value={newTopicTitle}
              onChange={e => setNewTopicTitle(e.target.value)}
              placeholder="Ex: Nota fiscal #1234"
              onKeyDown={e => e.key === "Enter" && handleCreateTopic()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTopic(false)}>Cancelar</Button>
            <Button onClick={handleCreateTopic} disabled={!newTopicTitle.trim() || createTopic.isPending}>
              Criar Tópico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      {selectedChannel && (
        <ChannelMembersDialog
          channelId={selectedChannel.id}
          channelName={selectedChannel.name}
          open={showMembers}
          onOpenChange={setShowMembers}
        />
      )}
    </MainLayout>
  );
}
