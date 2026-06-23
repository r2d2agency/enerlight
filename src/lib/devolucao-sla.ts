import { DevolucaoStatus } from "@/hooks/use-devolucoes";

// SLA em horas por etapa (tempo máximo esperado para sair desse status)
export const SLA_HOURS: Record<string, number> = {
  solicitado: 24,
  aguardando_nf_produto: 72,
  recebido: 24,
  em_analise: 72,
  cliente_notificado: 48,
  aguardando_nf_retorno: 120,
  troca_conserto: 96,
  enviado: 72,
};

export type SlaLevel = 'on_time' | 'warning' | 'overdue' | 'none';

export interface SlaInfo {
  level: SlaLevel;
  hoursInStage: number;
  hoursRemaining: number;
  slaHours: number;
  label: string;
  color: string;
}

const FINAL_STATUSES: DevolucaoStatus[] = ['concluido', 'recusado', 'cancelado'];

export function computeSla(status: DevolucaoStatus, updatedAt?: string, createdAt?: string): SlaInfo {
  if (FINAL_STATUSES.includes(status) || !SLA_HOURS[status]) {
    return { level: 'none', hoursInStage: 0, hoursRemaining: 0, slaHours: 0, label: '—', color: '' };
  }
  const ref = new Date(updatedAt || createdAt || Date.now()).getTime();
  const now = Date.now();
  const hoursInStage = Math.max(0, (now - ref) / 36e5);
  const slaHours = SLA_HOURS[status];
  const hoursRemaining = slaHours - hoursInStage;

  let level: SlaLevel = 'on_time';
  if (hoursRemaining < 0) level = 'overdue';
  else if (hoursRemaining < slaHours * 0.25) level = 'warning';

  const label =
    level === 'overdue'
      ? `Atrasado ${formatDur(Math.abs(hoursRemaining))}`
      : level === 'warning'
      ? `Vence em ${formatDur(hoursRemaining)}`
      : `${formatDur(hoursRemaining)} restantes`;

  const color =
    level === 'overdue'
      ? 'bg-red-100 text-red-700 border-red-300'
      : level === 'warning'
      ? 'bg-amber-100 text-amber-700 border-amber-300'
      : 'bg-emerald-100 text-emerald-700 border-emerald-300';

  return { level, hoursInStage, hoursRemaining, slaHours, label, color };
}

function formatDur(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
