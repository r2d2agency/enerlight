import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface ChannelMapping {
  id: string;
  source_channel: string;
  target_channel: string;
  created_at: string;
}

export function useCRMChannelMappings() {
  return useQuery({
    queryKey: ["crm-channel-mappings"],
    queryFn: () => api<ChannelMapping[]>("/api/crm/goals/channel-mappings"),
  });
}

export function useCRMChannelMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const upsertMapping = useMutation({
    mutationFn: (data: { source_channel: string; target_channel: string }) =>
      api<ChannelMapping>("/api/crm/goals/channel-mappings", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-channel-mappings"] });
    },
  });

  const deleteMapping = useMutation({
    mutationFn: (id: string) => api(`/api/crm/goals/channel-mappings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-channel-mappings"] });
      toast({ title: "Mapeamento excluído" });
    },
  });

  return { upsertMapping, deleteMapping };
}
