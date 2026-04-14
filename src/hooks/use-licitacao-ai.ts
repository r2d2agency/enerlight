import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface LicitacaoAIConfig {
  id?: string;
  organization_id?: string;
  is_enabled: boolean;
  use_org_ai_config: boolean;
  ai_provider: string;
  ai_model: string;
  ai_api_key: string | null;
  analysis_prompt: string;
  compliance_prompt: string;
  max_tokens: number;
  temperature: number;
  org_ai_provider?: string;
  org_ai_model?: string;
  org_has_ai_key?: boolean;
}

export interface LicitacaoAIProduct {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  category: string | null;
  specifications: string | null;
  unit: string | null;
  unit_price: number | null;
  brand: string | null;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string;
}

export interface LicitacaoAIAnalysis {
  id: string;
  licitacao_id: string;
  status: string;
  summary: string | null;
  dates_extracted: Array<{ label: string; date: string; description?: string }>;
  required_documents: string[];
  edital_items: Array<{ item_number: string; description: string; quantity?: string; unit?: string; estimated_value?: string }>;
  product_matches: Array<{ edital_item: string; product_name: string; match_level: string; notes?: string }>;
  compliance_analysis: string | null;
  compliance_score: number | null;
  risk_assessment: string | null;
  recommendations: string | null;
  tokens_used: number;
  model_used: string | null;
  error_message: string | null;
  created_at: string;
}

// Config
export function useLicitacaoAIConfig() {
  return useQuery({
    queryKey: ["licitacao-ai-config"],
    queryFn: () => api<LicitacaoAIConfig>("/api/licitacao-ai/config"),
  });
}

export function useSaveLicitacaoAIConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LicitacaoAIConfig>) =>
      api("/api/licitacao-ai/config", { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-ai-config"] }),
  });
}

// Products
export function useLicitacaoAIProducts() {
  return useQuery({
    queryKey: ["licitacao-ai-products"],
    queryFn: () => api<LicitacaoAIProduct[]>("/api/licitacao-ai/products"),
  });
}

export function useCreateLicitacaoAIProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LicitacaoAIProduct>) =>
      api<LicitacaoAIProduct>("/api/licitacao-ai/products", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-ai-products"] }),
  });
}

export function useUpdateLicitacaoAIProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api(`/api/licitacao-ai/products/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-ai-products"] }),
  });
}

export function useDeleteLicitacaoAIProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/licitacao-ai/products/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-ai-products"] }),
  });
}

export function useImportLicitacaoAIProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (products: Partial<LicitacaoAIProduct>[]) =>
      api<{ imported: number }>("/api/licitacao-ai/products/import", { method: "POST", body: { products } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-ai-products"] }),
  });
}

// Analysis
export function useLicitacaoAIAnalysis(licitacaoId: string | null) {
  return useQuery({
    queryKey: ["licitacao-ai-analysis", licitacaoId],
    queryFn: () => api<LicitacaoAIAnalysis | null>(`/api/licitacao-ai/analyses/${licitacaoId}`),
    enabled: !!licitacaoId,
  });
}

export function useAnalyzeEdital() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licitacaoId, edital_text, edital_url }: { licitacaoId: string; edital_text?: string; edital_url?: string }) =>
      api<LicitacaoAIAnalysis>(`/api/licitacao-ai/analyze/${licitacaoId}`, { method: "POST", body: { edital_text, edital_url } }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["licitacao-ai-analysis", vars.licitacaoId] });
      qc.invalidateQueries({ queryKey: ["licitacao-checklist"] });
      qc.invalidateQueries({ queryKey: ["licitacao-history"] });
    },
  });
}

export interface ParsedEditalData {
  title?: string;
  edital_number?: string;
  modality?: string;
  opening_date?: string;
  deadline_date?: string;
  result_date?: string;
  estimated_value?: number;
  entity_name?: string;
  entity_cnpj?: string;
  entity_contact?: string;
  entity_phone?: string;
  entity_email?: string;
  description?: string;
  notes?: string;
  dates?: Array<{ label: string; date: string; description?: string }>;
  checklist_items?: string[];
  required_documents?: string[];
  tasks?: Array<{ title: string; description?: string; priority?: string; due_date?: string }>;
  summary?: string;
  edital_items?: Array<{ item_number: string; description: string; quantity?: string; unit?: string; estimated_value?: string }>;
  product_matches?: Array<{ edital_item: string; product_name: string; match_level: string; notes?: string }>;
  compliance_score?: number;
  compliance_analysis?: string;
  risk_assessment?: string;
  recommendations?: string;
}

export function useParseEdital() {
  return useMutation({
    mutationFn: (data: { edital_url?: string; edital_text?: string }) =>
      api<ParsedEditalData>("/api/licitacao-ai/parse-edital", { method: "POST", body: data }),
  });
}

export function useSaveAIAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licitacaoId, ...data }: { licitacaoId: string; [key: string]: any }) =>
      api<any>(`/api/licitacao-ai/save-analysis/${licitacaoId}`, { method: "POST", body: data }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["licitacao-ai-analysis", vars.licitacaoId] });
      qc.invalidateQueries({ queryKey: ["licitacao-history"] });
    },
  });
}
