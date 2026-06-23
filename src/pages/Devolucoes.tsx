import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDevolucoes, useDevolucoesStats, STATUS_LABELS, REASON_LABELS, DevolucaoStatus } from "@/hooks/use-devolucoes";
import { DevolucaoKanban } from "@/components/devolucoes/DevolucaoKanban";
import { DevolucaoFormDialog } from "@/components/devolucoes/DevolucaoFormDialog";
import { DevolucaoDetailDialog } from "@/components/devolucoes/DevolucaoDetailDialog";
import { Plus, Search, RotateCcw, Truck, Wrench, Loader2, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { safeFormatDate } from "@/lib/utils";
import { computeSla } from "@/lib/devolucao-sla";

const STATUS_COLORS: Record<string, string> = {
  solicitado: 'bg-slate-100 text-slate-700',
  aguardando_nf_produto: 'bg-amber-100 text-amber-700',
  recebido: 'bg-blue-100 text-blue-700',
  em_analise: 'bg-purple-100 text-purple-700',
  cliente_notificado: 'bg-cyan-100 text-cyan-700',
  aguardando_nf_retorno: 'bg-orange-100 text-orange-700',
  troca_conserto: 'bg-indigo-100 text-indigo-700',
  enviado: 'bg-teal-100 text-teal-700',
  concluido: 'bg-green-100 text-green-700',
  recusado: 'bg-red-100 text-red-700',
  cancelado: 'bg-gray-200 text-gray-700',
};

export default function Devolucoes() {
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [reason, setReason] = useState<string>('all');
  const [sla, setSla] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = {
    search: search || undefined,
    status: status !== 'all' ? status : undefined,
    reason: reason !== 'all' ? reason : undefined,
  };
  const { data: allDevolucoes = [], isLoading } = useDevolucoes(filters);
  const { data: stats } = useDevolucoesStats();

  const devolucoes = sla === 'all'
    ? allDevolucoes
    : allDevolucoes.filter(d => computeSla(d.status, d.updated_at, d.created_at).level === sla);

  const overdueCount = allDevolucoes.filter(d => computeSla(d.status, d.updated_at, d.created_at).level === 'overdue').length;
  const warningCount = allDevolucoes.filter(d => computeSla(d.status, d.updated_at, d.created_at).level === 'warning').length;

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <RotateCcw className="h-6 w-6 text-primary" />
              Devoluções
            </h1>
            <p className="text-muted-foreground text-sm">Controle de RMA: solicitação, análise, troca/conserto e fretes</p>
          </div>
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova devolução
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatCard icon={AlertCircle} label="Em aberto" value={stats.open_count} color="text-amber-600" />
            <StatCard
              icon={Clock}
              label="Atrasadas (SLA)"
              value={overdueCount}
              color={overdueCount > 0 ? 'text-red-600' : 'text-muted-foreground'}
              onClick={() => setSla(sla === 'overdue' ? 'all' : 'overdue')}
              active={sla === 'overdue'}
            />
            <StatCard
              icon={Clock}
              label="Vencendo"
              value={warningCount}
              color={warningCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}
              onClick={() => setSla(sla === 'warning' ? 'all' : 'warning')}
              active={sla === 'warning'}
            />
            <StatCard icon={Wrench} label="Em análise" value={stats.in_analysis} color="text-purple-600" />
            <StatCard icon={CheckCircle2} label="Concluídas (mês)" value={stats.closed_this_month} color="text-green-600" />
            <StatCard icon={Truck} label="Frete (mês)" value={`R$ ${Number(stats.freight_cost_month || 0).toFixed(2)}`} color="text-blue-600" />
          </div>
        )}

        {/* Filters + view toggle */}
        <Card>
          <CardContent className="pt-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por cliente, descrição ou número..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="md:w-52"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Motivo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motivos</SelectItem>
                {Object.entries(REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sla} onValueChange={setSla}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="SLA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">SLA: Todos</SelectItem>
                <SelectItem value="overdue">Atrasadas</SelectItem>
                <SelectItem value="warning">Vencendo</SelectItem>
                <SelectItem value="on_time">No prazo</SelectItem>
              </SelectContent>
            </Select>
            <Tabs value={view} onValueChange={(v: any) => setView(v)}>
              <TabsList><TabsTrigger value="kanban">Kanban</TabsTrigger><TabsTrigger value="lista">Lista</TabsTrigger></TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : devolucoes.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <RotateCcw className="h-12 w-12 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold">Nenhuma devolução encontrada</h3>
            <p className="text-muted-foreground mt-1 text-sm">Clique em "Nova devolução" para começar</p>
          </CardContent></Card>
        ) : view === 'kanban' ? (
          <DevolucaoKanban devolucoes={devolucoes} onSelect={setSelectedId} />
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">SLA</th>
                    <th className="px-3 py-2">Vendedor</th>
                    <th className="px-3 py-2">Aberto</th>
                    <th className="px-3 py-2 text-right">Frete (R$)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {devolucoes.map(d => {
                    const s = computeSla(d.status, d.updated_at, d.created_at);
                    return (
                      <tr key={d.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedId(d.id)}>
                        <td className="px-3 py-2 font-mono">#{d.numero}</td>
                        <td className="px-3 py-2 font-medium">{d.customer_name}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{REASON_LABELS[d.reason] || d.reason}</Badge></td>
                        <td className="px-3 py-2"><Badge className={`${STATUS_COLORS[d.status]} text-xs`}>{STATUS_LABELS[d.status as DevolucaoStatus]}</Badge></td>
                        <td className="px-3 py-2">{s.level === 'none' ? <span className="text-muted-foreground text-xs">—</span> : <Badge variant="outline" className={`text-[10px] ${s.color}`}>{s.label}</Badge>}</td>
                        <td className="px-3 py-2">{d.seller_name || '—'}</td>
                        <td className="px-3 py-2">{safeFormatDate(d.created_at, 'dd/MM/yyyy')}</td>
                        <td className="px-3 py-2 text-right">{Number(d.total_freight_cost || 0).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <DevolucaoFormDialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) setEditing(null); }} devolucao={editing} />
      <DevolucaoDetailDialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }} devolucaoId={selectedId} />
    </MainLayout>
  );
}

function StatCard({ icon: Icon, label, value, color, onClick, active }: { icon: any; label: string; value: any; color?: string; onClick?: () => void; active?: boolean }) {
  return (
    <Card className={`${onClick ? 'cursor-pointer hover:shadow-md transition' : ''} ${active ? 'ring-2 ring-primary' : ''}`} onClick={onClick}><CardContent className="p-3 flex items-center gap-3">
      <div className={`p-2 rounded-md bg-muted ${color || ''}`}><Icon className="h-4 w-4" /></div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-bold text-lg leading-tight">{value}</div>
      </div>
    </CardContent></Card>
  );
}
