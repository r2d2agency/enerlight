import { useEffect, useState } from 'react';
import ComercialLayout from './ComercialLayout';
import { comercialTeamApi, ComercialTeamMemberMetrics } from '@/lib/comercial-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UsersRound, Wallet, ShoppingCart, FileText, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const money = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

export default function ComercialEquipe() {
  return <ComercialLayout>{(actor) => <EquipeContent actorProfile={actor.profile} />}</ComercialLayout>;
}

function EquipeContent({ actorProfile }: { actorProfile: string }) {
  const [members, setMembers] = useState<ComercialTeamMemberMetrics[]>([]);
  const [totals, setTotals] = useState({ sales_count: 0, sales_total: 0, quotes_count: 0, commission_total: 0 });
  const [filters, setFilters] = useState({ date_from: '', date_to: '', actor_id: '' });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    comercialTeamApi.getSummary(filters).then((response) => { setMembers(response.members); setTotals(response.totals); }).catch((error) => toast({ title: 'Erro ao carregar equipe', description: error?.message, variant: 'destructive' })).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const temporaryPassword = async (member: ComercialTeamMemberMetrics) => {
    try {
      const response = await comercialTeamApi.generateMemberTemporaryPassword(member.id);
      toast({ title: 'Senha temporária gerada', description: `${member.name}: ${response.temporary_password}` });
    } catch (error) { toast({ title: 'Erro ao gerar senha', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' }); }
  };

  if (actorProfile !== 'gerente' && actorProfile !== 'admin') return <Card><CardContent className="p-8 text-center">Esta área é exclusiva para supervisores.</CardContent></Card>;
  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Gestão comercial</p><h1 className="text-3xl font-bold">Minha equipe</h1><p className="text-sm text-muted-foreground">Acompanhe vendas, orçamentos e comissões individuais e acumuladas.</p></div>
    <Card><CardContent className="flex flex-wrap items-end gap-3 p-4"><div><label className="mb-1 block text-xs">De</label><Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} /></div><div><label className="mb-1 block text-xs">Até</label><Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} /></div><div><label className="mb-1 block text-xs">Vendedor</label><Select value={filters.actor_id || 'all'} onValueChange={(value) => setFilters({ ...filters, actor_id: value === 'all' ? '' : value })}><SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div><Button onClick={load}>Aplicar filtros</Button><Button variant="outline" onClick={() => { setFilters({ date_from: '', date_to: '', actor_id: '' }); setTimeout(load, 0); }}>Limpar</Button></CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[[UsersRound, 'Membros', members.length], [ShoppingCart, 'Vendas acumuladas', `${totals.sales_count} · ${money(totals.sales_total)}`], [FileText, 'Orçamentos acumulados', totals.quotes_count], [Wallet, 'Comissões acumuladas', money(totals.commission_total)]].map(([Icon, label, value]) => <Card key={String(label)}><CardContent className="flex items-center gap-3 p-5"><span className="rounded-lg bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Desempenho individual</CardTitle></CardHeader><CardContent>{loading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Vendedor</th><th className="p-3">Vendas</th><th className="p-3">Valor vendido</th><th className="p-3">Orçamentos</th><th className="p-3">Comissão</th><th className="p-3">Ações</th></tr></thead><tbody>{members.map((member) => <tr key={member.id} className="border-b"><td className="p-3"><strong>{member.name}</strong><br /><span className="text-xs text-muted-foreground">{member.email}</span></td><td className="p-3">{member.sales_count}</td><td className="p-3">{money(member.sales_total)}</td><td className="p-3">{member.quotes_count}</td><td className="p-3">{money(member.commission_total)}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => temporaryPassword(member)}><KeyRound className="mr-1 h-4 w-4" />Senha temporária</Button></td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}
