import { useEffect, useState, useCallback } from "react";
import { api, API_URL } from "@/lib/api";

export interface CalcCategory {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  lux: number;
  icon: string;
  scope: "indoor" | "public_lighting";
  pole_height_min: number | null;
  pole_height_max: number | null;
  pole_uniformity: number | null;
  position: number;
  is_active: boolean;
}

// Public fetch — works without auth (used by guest calculator)
export function usePublicCalcCategories() {
  const [items, setItems] = useState<CalcCategory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/calc-categories/public`);
        if (r.ok) setItems(await r.json());
      } catch (e) {
        console.error("[calc-categories] public fetch error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  return { items, loading };
}

// Authenticated CRUD
export function useCalcCategoriesAdmin() {
  const [items, setItems] = useState<CalcCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<CalcCategory[]>("/api/calc-categories");
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = async (body: Partial<CalcCategory>) => {
    const created = await api<CalcCategory>("/api/calc-categories", { method: "POST", body });
    await refresh();
    return created;
  };
  const update = async (id: string, body: Partial<CalcCategory>) => {
    const updated = await api<CalcCategory>(`/api/calc-categories/${id}`, { method: "PUT", body });
    await refresh();
    return updated;
  };
  const remove = async (id: string) => {
    await api<{ ok: true }>(`/api/calc-categories/${id}`, { method: "DELETE" });
    await refresh();
  };

  return { items, loading, refresh, create, update, remove };
}
