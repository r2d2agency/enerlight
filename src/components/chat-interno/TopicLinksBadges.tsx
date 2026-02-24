import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CheckSquare, Calendar, FolderKanban, Handshake, Plus, X, Loader2, ExternalLink
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface TopicLink {
  id: string;
  topic_id: string;
  link_type: "task" | "meeting" | "project" | "deal";
  link_id: string;
  link_title: string;
  created_by: string;
  created_at: string;
}

const linkTypeConfig = {
  task: { label: "Tarefa", icon: CheckSquare, color: "bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20" },
  meeting: { label: "Reunião", icon: Calendar, color: "bg-purple-500/10 text-purple-600 border-purple-200 hover:bg-purple-500/20" },
  project: { label: "Projeto", icon: FolderKanban, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20" },
  deal: { label: "Negociação", icon: Handshake, color: "bg-amber-500/10 text-amber-600 border-amber-200 hover:bg-amber-500/20" },
};

function useTopicLinks(topicId: string | null) {
  return useQuery<TopicLink[]>({
    queryKey: ["topic-links", topicId],
    queryFn: () => api(`/api/internal-chat/topics/${topicId}/links`),
    enabled: !!topicId,
  });
}

function useCreateTopicLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, ...data }: { topicId: string; link_type: string; link_id: string; link_title: string }) =>
      api(`/api/internal-chat/topics/${topicId}/links`, { method: "POST", body: data }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["topic-links", vars.topicId] });
      toast.success("Vínculo criado!");
    },
  });
}

function useDeleteTopicLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, topicId }: { linkId: string; topicId: string }) =>
      api(`/api/internal-chat/topics/links/${linkId}`, { method: "DELETE" }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["topic-links", vars.topicId] });
      toast.success("Vínculo removido!");
    },
  });
}

interface TopicLinksBadgesProps {
  topicId: string;
}

export function TopicLinksBadges({ topicId }: TopicLinksBadgesProps) {
  const { data: links = [] } = useTopicLinks(topicId);
  const createLink = useCreateTopicLink();
  const deleteLink = useDeleteTopicLink();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkType, setLinkType] = useState<string>("");
  const [searchItems, setSearchItems] = useState<{ id: string; title: string }[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (type: string, query: string) => {
    if (!type || query.length < 1) { setSearchItems([]); return; }
    setIsSearching(true);
    try {
      const items = await api<{ id: string; title: string }[]>(
        `/api/internal-chat/search-linkable?type=${type}&q=${encodeURIComponent(query)}`
      );
      setSearchItems(items);
    } catch {
      setSearchItems([]);
    }
    setIsSearching(false);
  };

  const handleCreate = async () => {
    if (!linkType || !selectedItem) return;
    const item = searchItems.find(i => i.id === selectedItem);
    await createLink.mutateAsync({
      topicId,
      link_type: linkType,
      link_id: selectedItem,
      link_title: item?.title || "",
    });
    setShowLinkDialog(false);
    resetDialog();
  };

  const resetDialog = () => {
    setLinkType("");
    setSearchItems([]);
    setSelectedItem("");
    setSearchQuery("");
  };

  const groupedLinks = links.reduce((acc, l) => {
    if (!acc[l.link_type]) acc[l.link_type] = [];
    acc[l.link_type].push(l);
    return acc;
  }, {} as Record<string, TopicLink[]>);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Existing links as badges */}
      {Object.entries(groupedLinks).map(([type, items]) => {
        const config = linkTypeConfig[type as keyof typeof linkTypeConfig];
        const Icon = config.icon;
        return items.map(link => (
          <Tooltip key={link.id}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn("gap-1 text-xs cursor-default group pr-1", config.color)}
              >
                <Icon className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{link.link_title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteLink.mutate({ linkId: link.id, topicId }); }}
                  className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{config.label}: {link.link_title}</TooltipContent>
          </Tooltip>
        ));
      })}

      {/* Add link button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 rounded-full"
            onClick={() => setShowLinkDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Vincular tarefa, reunião, projeto ou negociação</TooltipContent>
      </Tooltip>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={(v) => { setShowLinkDialog(v); if (!v) resetDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Vincular ao tópico</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo de vínculo</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(linkTypeConfig).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <Button
                      key={key}
                      variant={linkType === key ? "default" : "outline"}
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => { setLinkType(key); setSearchItems([]); setSelectedItem(""); setSearchQuery(""); }}
                    >
                      <Icon className="h-4 w-4" />
                      {cfg.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {linkType && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Buscar {linkTypeConfig[linkType as keyof typeof linkTypeConfig]?.label}
                </label>
                <Input
                  placeholder="Digite para buscar..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearch(linkType, e.target.value);
                  }}
                />
                {isSearching && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                  </div>
                )}
                {searchItems.length > 0 && (
                  <div className="mt-2 max-h-[200px] overflow-auto border rounded-md">
                    {searchItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItem(item.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0",
                          selectedItem === item.id && "bg-accent font-medium"
                        )}
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery && !isSearching && searchItems.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">Nenhum resultado encontrado</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkDialog(false); resetDialog(); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!selectedItem || createLink.isPending}>
              {createLink.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
