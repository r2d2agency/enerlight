// Local (frontend-only) gestão de jornadas de trabalho.
// Mantém compat com backend futuro — trocar por API depois.

const KEY = 'rh_journeys_v1';

export interface Journey {
  id: string;
  name: string;
  days: number[]; // 0..6 (dom..sab)
  workStart: string;   // "08:00"
  lunchStart: string;  // "12:00"
  lunchEnd: string;    // "13:00"
  workEnd: string;     // "18:00"
  toleranceMinutes: number;
  createdAt: string;
}

export function listJourneys(): Journey[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveJourney(j: Omit<Journey, 'id' | 'createdAt'> & { id?: string }): Journey {
  const all = listJourneys();
  if (j.id) {
    const idx = all.findIndex((x) => x.id === j.id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...j } as Journey;
      localStorage.setItem(KEY, JSON.stringify(all));
      return all[idx];
    }
  }
  const created: Journey = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: j.name,
    days: j.days,
    workStart: j.workStart,
    lunchStart: j.lunchStart,
    lunchEnd: j.lunchEnd,
    workEnd: j.workEnd,
    toleranceMinutes: j.toleranceMinutes,
  };
  all.push(created);
  localStorage.setItem(KEY, JSON.stringify(all));
  return created;
}

export function deleteJourney(id: string) {
  const all = listJourneys().filter((j) => j.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function assignJourney(userId: string, journeyId: string | null) {
  if (journeyId) localStorage.setItem(`rh_journey_assign_${userId}`, journeyId);
  else localStorage.removeItem(`rh_journey_assign_${userId}`);
}

export function getAssignedJourney(userId: string): Journey | null {
  const id = localStorage.getItem(`rh_journey_assign_${userId}`);
  if (!id) return null;
  return listJourneys().find((j) => j.id === id) || null;
}

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
