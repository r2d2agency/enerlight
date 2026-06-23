import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface NfcCard {
  id: string;
  uid: string;
  chip_type: string;
  status: string;
  user_id: string | null;
  user_name?: string;
  user_email?: string;
  company_name: string | null;
  public_slug: string;
  public_url: string;
  qr_code_url: string;
  plan: string;
  activated_at: string | null;
  created_at: string;
  reads_count?: number;
  display_name?: string;
  photo_url?: string;
  role_title?: string;
}

export interface NfcProfile {
  id?: string;
  card_id?: string;
  display_name?: string | null;
  role_title?: string | null;
  company_name?: string | null;
  company_logo_url?: string | null;
  company_description?: string | null;
  photo_url?: string | null;
  bio?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  linkedin?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
}

export interface NfcMaterial {
  id: string;
  card_id: string | null;
  title: string;
  description: string | null;
  material_type: string;
  file_url: string;
  thumbnail_url: string | null;
  requires_lead: boolean;
}

export function useNfcDashboard() {
  return useQuery({
    queryKey: ["nfc", "dashboard"],
    queryFn: () => api<any>("/api/nfc/dashboard"),
  });
}

export function useNfcCards(params: { status?: string; user_id?: string; search?: string } = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && qs.append(k, String(v)));
  return useQuery({
    queryKey: ["nfc", "cards", params],
    queryFn: () => api<NfcCard[]>(`/api/nfc/cards${qs.toString() ? "?" + qs : ""}`),
  });
}

export function useNfcCard(id?: string) {
  return useQuery({
    queryKey: ["nfc", "card", id],
    queryFn: () => api<{ card: NfcCard; profile: NfcProfile | null; materials: NfcMaterial[] }>(`/api/nfc/cards/${id}`),
    enabled: !!id,
  });
}

export function useCreateNfcCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api<NfcCard>("/api/nfc/cards", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nfc"] }),
  });
}

export function useUpdateNfcCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) => api<NfcCard>(`/api/nfc/cards/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nfc"] }),
  });
}

export function useDeleteNfcCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/nfc/cards/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nfc"] }),
  });
}

export function useSaveNfcProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profile }: { id: string; profile: NfcProfile }) =>
      api(`/api/nfc/cards/${id}/profile`, { method: "PUT", body: profile }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nfc"] }),
  });
}

export function useNfcReads(id?: string) {
  return useQuery({
    queryKey: ["nfc", "reads", id],
    queryFn: () => api<any[]>(`/api/nfc/cards/${id}/reads`),
    enabled: !!id,
  });
}

export function useNfcLeads(id?: string) {
  return useQuery({
    queryKey: ["nfc", "leads", id],
    queryFn: () => api<any[]>(`/api/nfc/cards/${id}/leads`),
    enabled: !!id,
  });
}
