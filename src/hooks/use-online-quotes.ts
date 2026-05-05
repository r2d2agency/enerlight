import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface PriceList {
  id: string;
  name: string;
  description?: string;
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
}

export interface OnlineQuote {
  id: string;
  client_name: string;
  total_value: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
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

  return { createQuote };
}
