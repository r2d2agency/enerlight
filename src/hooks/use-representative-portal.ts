import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface RepresentativePortalMe {
  organization_id: string;
  representative: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    cpf_cnpj?: string;
  };
}

export interface RepresentativePortalDashboard {
  companies: number;
  quotes: {
    total: number;
    total_value: number;
  };
  orders: {
    total: number;
    total_value: number;
  };
}

export interface RepresentativePortalCompany {
  id: string;
  company_name: string;
  trade_name?: string | null;
  cnpj?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  created_at: string;
}

export interface RepresentativePortalPriceList {
  id: string;
  name: string;
  description?: string | null;
  segment?: string | null;
  is_master?: boolean;
  markup_percentage?: number;
}

export interface RepresentativePortalPriceListItem {
  id: string;
  product_code?: string | null;
  product_name: string;
  description?: string | null;
  sale_price: number;
  category?: string | null;
  brand?: string | null;
}

export interface RepresentativePortalQuote {
  id: string;
  code: string;
  status: string;
  company_id?: string | null;
  price_list_id?: string | null;
  company_name: string;
  client_document?: string | null;
  client_contact_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  total_value: number;
  created_at: string;
}

export interface RepresentativePortalOrder {
  id: string;
  order_number: string;
  status: string;
  erp_status: string;
  company_name: string;
  total_value: number;
  created_at: string;
}

export function useRepresentativePortalMe() {
  return useQuery({
    queryKey: ["representative-portal-me"],
    queryFn: () => api<RepresentativePortalMe>("/api/representative-portal/me"),
  });
}

export function useRepresentativePortalDashboard() {
  return useQuery({
    queryKey: ["representative-portal-dashboard"],
    queryFn: () => api<RepresentativePortalDashboard>("/api/representative-portal/dashboard"),
  });
}

export function useRepresentativePortalCompanies() {
  return useQuery({
    queryKey: ["representative-portal-companies"],
    queryFn: () => api<RepresentativePortalCompany[]>("/api/representative-portal/companies"),
  });
}

export function useRepresentativePortalPriceLists() {
  return useQuery({
    queryKey: ["representative-portal-price-lists"],
    queryFn: () => api<RepresentativePortalPriceList[]>("/api/representative-portal/price-lists"),
  });
}

export function useRepresentativePortalQuotes() {
  return useQuery({
    queryKey: ["representative-portal-quotes"],
    queryFn: () => api<RepresentativePortalQuote[]>("/api/representative-portal/quotes"),
  });
}

export function useRepresentativePortalOrders() {
  return useQuery({
    queryKey: ["representative-portal-orders"],
    queryFn: () => api<RepresentativePortalOrder[]>("/api/representative-portal/orders"),
  });
}

export function useRepresentativePortalPriceListItems(priceListId?: string) {
  return useQuery({
    queryKey: ["representative-portal-price-list-items", priceListId],
    queryFn: () => api<RepresentativePortalPriceListItem[]>(`/api/representative-portal/price-lists/${priceListId}/items`),
    enabled: !!priceListId,
  });
}

export function useRepresentativePortalMutations() {
  const queryClient = useQueryClient();

  const createCompany = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/representative-portal/companies", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["representative-portal-companies"] });
      queryClient.invalidateQueries({ queryKey: ["representative-portal-dashboard"] });
    },
  });

  const createQuote = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/api/representative-portal/quotes", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["representative-portal-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["representative-portal-dashboard"] });
    },
  });

  const confirmOrder = useMutation({
    mutationFn: (quoteId: string) =>
      api(`/api/representative-portal/quotes/${quoteId}/confirm-order`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["representative-portal-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["representative-portal-orders"] });
      queryClient.invalidateQueries({ queryKey: ["representative-portal-dashboard"] });
    },
  });

  return { createCompany, createQuote, confirmOrder };
}
