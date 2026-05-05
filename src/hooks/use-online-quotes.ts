import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface PriceList {
  id: string;
  name: string;
  description?: string;
  segment?: string;
  is_active: boolean;
  created_at: string;
}

export interface PriceListItem {
  id: string;
  product_code: string;
  product_name: string;
  description?: string;
  sale_price: number;
  min_price?: number;
  cost_price?: number; // Restricted to admins/managers
  unit: string;
  image_url?: string;
}

export interface OnlineQuoteTemplate {
  id: string;
  name: string;
  description?: string;
  cover_url?: string;
  header_text?: string;
  footer_text?: string;
  is_default: boolean;
}

export interface OnlineQuote {
  id: string;
  client_name: string;
  total_value: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  include_images?: boolean;
  created_at: string;
}

export function usePriceLists() {
  return useQuery({
    queryKey: ["price-lists"],
    queryFn: () => api<PriceList[]>("/api/online-quotes/price-lists"),
  });
}

export function usePriceListItems(priceListId: string | null) {
  return useQuery({
    queryKey: ["price-list-items", priceListId],
    queryFn: () => api<PriceListItem[]>(`/api/online-quotes/price-lists/${priceListId}/items`),
    enabled: !!priceListId,
  });
}

export function useOnlineQuotes() {
  return useQuery({
    queryKey: ["online-quotes"],
    queryFn: () => api<OnlineQuote[]>("/api/online-quotes/quotes"),
  });
}

export function useOnlineQuoteTemplates() {
  return useQuery({
    queryKey: ["online-quote-templates"],
    queryFn: () => api<OnlineQuoteTemplate[]>("/api/online-quotes/templates"),
  });
}

export function useOnlineQuoteMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createQuote = useMutation({
    mutationFn: (data: any) => api("/api/online-quotes/quotes", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["online-quotes"] });
      toast({ title: "Orçamento criado com sucesso" });
    },
  });

  const saveTemplate = useMutation({
    mutationFn: (data: any) => api("/api/online-quotes/templates", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["online-quote-templates"] });
      toast({ title: "Template salvo com sucesso" });
    },
  });

  const savePriceList = useMutation({
    mutationFn: (data: any) => api("/api/online-quotes/price-lists", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast({ title: "Tabela de preços salva com sucesso" });
    },
  });

  return { createQuote, saveTemplate, savePriceList };
}
