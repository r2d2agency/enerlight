import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComercialActor, ComercialListFilters as ListFilters, comercialTeamApi } from '@/lib/comercial-api';

interface Props {
  actor: ComercialActor;
  value: ListFilters;
  onChange: (value: ListFilters) => void;
  onApply: () => void;
  onClear: () => void;
}

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ComercialListFilters({ actor, value, onChange, onApply, onClear }: Props) {
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const canFilter = actor.profile === 'admin' || actor.profile === 'gerente';

  useEffect(() => {
    if (!canFilter) return;
    comercialTeamApi.getSummary().then((response) => setMembers(response.members)).catch(() => {});
  }, [canFilter]);

  const setPeriod = (period: string) => {
    const today = new Date();
    if (period === 'today') onChange({ ...value, date_from: localDate(today), date_to: localDate(today) });
    else if (period === 'week') {
      const start = new Date(today);
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      onChange({ ...value, date_from: localDate(start), date_to: localDate(today) });
    } else if (period === 'month') {
      onChange({ ...value, date_from: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), date_to: localDate(today) });
    } else onChange({ ...value, date_from: '', date_to: '' });
  };

  return <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
    {canFilter && <div><label className="mb-1 block text-xs">Vendedor</label><Select value={value.actor_id || 'all'} onValueChange={(actor_id) => onChange({ ...value, actor_id: actor_id === 'all' ? '' : actor_id })}><SelectTrigger className="w-[210px]"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div>}
    <div><label className="mb-1 block text-xs">Período</label><Select value={value.date_from && value.date_to ? 'custom' : 'all'} onValueChange={setPeriod}><SelectTrigger className="w-[170px]"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="today">Hoje</SelectItem><SelectItem value="week">Semana atual</SelectItem><SelectItem value="month">Mês atual</SelectItem><SelectItem value="custom">Personalizado</SelectItem></SelectContent></Select></div>
    <div><label className="mb-1 block text-xs">De</label><Input type="date" value={value.date_from || ''} onChange={(event) => onChange({ ...value, date_from: event.target.value })} /></div>
    <div><label className="mb-1 block text-xs">Até</label><Input type="date" value={value.date_to || ''} onChange={(event) => onChange({ ...value, date_to: event.target.value })} /></div>
    <Button onClick={onApply}>Aplicar filtros</Button><Button variant="outline" onClick={onClear}>Limpar</Button>
  </div>;
}
