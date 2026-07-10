import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Vehicle {
  id: string;
  organization_id: string;
  name: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  current_km: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleTrip {
  id: string;
  organization_id: string;
  vehicle_id: string;
  vehicle_name?: string;
  vehicle_plate?: string;
  driver_id: string | null;
  driver_name?: string;
  departure_at: string;
  return_at: string | null;
  km_start: number;
  km_end: number | null;
  purpose: "visit" | "delivery" | "other";
  destination_text: string | null;
  client_company_id: string | null;
  deal_id: string | null;
  shipment_id: string | null;
  shipment_client?: string | null;
  shipment_carrier?: string | null;
  own_fleet_cost?: number | null;
  checklist_out: Record<string, any>;
  checklist_in: Record<string, any>;
  notes_out: string | null;
  notes_in: string | null;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
}

interface TripFilters {
  status?: string;
  vehicle_id?: string;
  driver_id?: string;
  start_date?: string;
  end_date?: string;
}

export function useVehicles() {
  return useQuery<Vehicle[]>({
    queryKey: ["vehicles"],
    queryFn: () => api("/api/vehicles"),
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Vehicle>) =>
      api("/api/vehicles", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Vehicle> & { id: string }) =>
      api(`/api/vehicles/${id}`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/vehicles/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useVehicleTrips(filters?: TripFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.vehicle_id) params.set("vehicle_id", filters.vehicle_id);
  if (filters?.driver_id) params.set("driver_id", filters.driver_id);
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  const qs = params.toString();
  return useQuery<VehicleTrip[]>({
    queryKey: ["vehicle-trips", filters],
    queryFn: () => api(`/api/vehicles/trips${qs ? `?${qs}` : ""}`),
  });
}

export function useCreateVehicleTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api("/api/vehicles/trips", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle-trips"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["logistics-shipments"] });
    },
  });
}

export function useCloseVehicleTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      api(`/api/vehicles/trips/${id}/close`, { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle-trips"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["logistics-shipments"] });
    },
  });
}

export function useDeleteVehicleTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/vehicles/trips/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicle-trips"] }),
  });
}
