import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely format a date value. Returns fallback string if date is invalid.
 */
export function safeFormatDate(
  value: string | Date | null | undefined,
  pattern: string,
  options?: { locale?: typeof ptBR; fallback?: string }
): string {
  if (!value) return options?.fallback ?? "—";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return options?.fallback ?? "—";
    return format(date, pattern, { locale: options?.locale });
  } catch {
    return options?.fallback ?? "—";
  }
}
