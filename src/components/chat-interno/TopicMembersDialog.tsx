import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserPlus, X, Search, Loader2, Users } from "lucide-react";
import {
  useTopicMembers,
  useAddTopicMember,
  useRemoveTopicMember,
  useOrgMembers,
} from "@/hooks/use-internal-chat";
import { toast } from "sonner";

interface Props {
  topicId: string;
  topicTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TopicMembersDialog({ topicId, topicTitle, open, onOpenChange }: Props) {
  const [search, setSearch] = useState("");
  const { data: members = [], isLoading } = useTopicMembers(open ? topicId : null);
  const { data: orgMembers = [] } = useOrgMembers();
  const addMember = useAddTopicMember();
  const removeMember = useRemoveTopicMember();

  const memberIds = new Set(members.map(m => m.user_id));

  const availableUsers = orgMembers.filter(
    u => !memberIds.has(u.id) && (
      !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    )
  );

  const handleAdd = async (userId: string) => {
    try {
      await addMember.mutateAsync({ topicId, userId });
      toast.success("Membro adicionado ao tópico!");
    } catch {
      toast.error("Erro ao adicionar membro");
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeMember.mutateAsync({ topicId, userId });
      toast.success("Membro removido do tópico");
    } catch {
      toast.error("Erro ao remover membro");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Membros do tópico
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{topicTitle}</p>
        </DialogHeader>

        <div className="flex-shrink-0">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            Membros atuais ({members.length})
            {members.length === 0 && <span className="ml-1 text-xs">(todos podem ver)</span>}
          </p>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="h-auto max-h-[160px]">
              <div className="space-y-1 pr-3">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.user_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.user_email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(m.user_id)}
                      disabled={removeMember.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <p className="text-sm font-medium text-muted-foreground mb-2 flex-shrink-0">Adicionar membro</p>
          <div className="relative mb-2 flex-shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <ScrollArea className="flex-1 min-h-0 max-h-[240px]">
            <div className="space-y-1 pr-3">
              {availableUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {search ? "Nenhum usuário encontrado" : "Todos os usuários já são membros"}
                </p>
              ) : (
                availableUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-primary hover:text-primary"
                      onClick={() => handleAdd(u.id)}
                      disabled={addMember.isPending}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
