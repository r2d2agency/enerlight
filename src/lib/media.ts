import { API_URL } from "@/lib/api";

/**
 * Normaliza URLs de mídia vindas do backend.
 * - Se vier absoluta (http/https/data/blob) mantém.
 * - Se vier relativa (/uploads/...) prefixa com o API_URL.
 */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  const u = String(url).trim();
  if (!u) return null;

  if (/^(data:|blob:)/i.test(u)) return u;
  if (/^https?:/i.test(u)) {
    try {
      const parsed = new URL(u);
      parsed.pathname = parsed.pathname.replace(/\/+/g, '/');
      return parsed.toString();
    } catch {
      return u;
    }
  }
  if (u.startsWith("//")) return `https:${u}`;

  if (u.startsWith("/")) return `${API_URL}${u}`;
  return `${API_URL}/${u}`;
}
