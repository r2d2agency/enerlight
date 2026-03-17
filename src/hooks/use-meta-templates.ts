import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
    example?: any;
  }>;
}

export function useMetaTemplates(connectionId?: string) {
  return useQuery({
    queryKey: ["meta-templates", connectionId],
    queryFn: () => api<MetaTemplate[]>(`/api/meta/templates/${connectionId}`),
    enabled: !!connectionId,
  });
}

export function useMetaTemplateMutations(connectionId?: string) {
  const qc = useQueryClient();

  const createTemplate = useMutation({
    mutationFn: (data: { name: string; language: string; category: string; components: any[] }) =>
      api(`/api/meta/templates/${connectionId}`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-templates", connectionId] }),
  });

  const deleteTemplate = useMutation({
    mutationFn: (templateName: string) =>
      api(`/api/meta/templates/${connectionId}/${templateName}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meta-templates", connectionId] }),
  });

  const sendTemplate = useMutation({
    mutationFn: (data: { to: string; template_name: string; language_code?: string; components?: any[] }) =>
      api(`/api/meta/send/${connectionId}`, { method: "POST", body: data }),
  });

  return { createTemplate, deleteTemplate, sendTemplate };
}
