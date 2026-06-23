import { Devolucao, STATUS_LABELS, STATUS_ORDER, DevolucaoStatus } from "@/hooks/use-devolucoes";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { User, Calendar, Truck, AlertCircle, Clock } from "lucide-react";
import { safeFormatDate } from "@/lib/utils";
import { computeSla } from "@/lib/devolucao-sla";

interface Props {
  devolucoes: Devolucao[];
  onSelect: (id: string) => void;
  slaConfig?: Record<string, number>;
}

const COL_COLORS: Record<string, string> = {
  solicitado: 'border-t-slate-400',
  aguardando_nf_produto: 'border-t-amber-500',
  recebido: 'border-t-blue-500',
  em_analise: 'border-t-purple-500',
  cliente_notificado: 'border-t-cyan-500',
  aguardando_nf_retorno: 'border-t-orange-500',
  troca_conserto: 'border-t-indigo-500',
  enviado: 'border-t-teal-500',
  concluido: 'border-t-green-500',
};

export function DevolucaoKanban({ devolucoes, onSelect, slaConfig }: Props) {
  const grouped = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = devolucoes.filter(d => d.status === s);
    return acc;
  }, {} as Record<DevolucaoStatus, Devolucao[]>);

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: '60vh' }}>
      {STATUS_ORDER.map(status => {
        const overdueCount = grouped[status].filter(d => computeSla(d.status, d.updated_at, d.created_at, slaConfig).level === 'overdue').length;
        return (
          <div key={status} className="flex-shrink-0 w-72">
            <div className={`bg-muted/40 rounded-lg border-t-4 ${COL_COLORS[status]} p-2 h-full flex flex-col`}>
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="font-semibold text-sm">{STATUS_LABELS[status]}</div>
                <div className="flex items-center gap-1">
                  {overdueCount > 0 && (
                    <Badge className="text-[10px] bg-red-100 text-red-700 hover:bg-red-100">{overdueCount} atrasada{overdueCount > 1 ? 's' : ''}</Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">{grouped[status].length}</Badge>
                </div>
              </div>
              <div className="space-y-2 overflow-y-auto flex-1">
                {grouped[status].map(d => {
                  const sla = computeSla(d.status, d.updated_at, d.created_at, slaConfig);
                  return (
                    <Card
                      key={d.id}
                      className={`p-2.5 cursor-pointer hover:shadow-md transition-shadow space-y-1.5 ${sla.level === 'overdue' ? 'border-l-4 border-l-red-500' : sla.level === 'warning' ? 'border-l-4 border-l-amber-500' : ''}`}
                      onClick={() => onSelect(d.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-muted-foreground">#{d.numero}</div>
                        {d.priority === 'urgent' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                      </div>
                      <div className="font-medium text-sm line-clamp-2">{d.customer_name}</div>
                      {d.itens && d.itens[0] && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{d.itens[0].product_name}</div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[10px]">{d.reason}</Badge>
                        {d.opened_channel && <Badge variant="outline" className="text-[10px]">{d.opened_channel}</Badge>}
                      </div>
                      {sla.level !== 'none' && (
                        <Badge variant="outline" className={`text-[10px] ${sla.color} gap-1 w-full justify-center`}>
                          <Clock className="h-3 w-3" /> {sla.label}
                        </Badge>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{d.seller_name?.split(' ')[0] || '—'}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{safeFormatDate(d.created_at, 'dd/MM')}</span>
                      </div>
                      {(Number(d.total_freight_cost) || 0) > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Truck className="h-3 w-3" /> R$ {Number(d.total_freight_cost).toFixed(2)}
                        </div>
                      )}
                    </Card>
                  );
                })}
                {!grouped[status].length && (
                  <div className="text-xs text-muted-foreground text-center py-6">—</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
