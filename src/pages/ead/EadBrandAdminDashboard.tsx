import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { eadBrandAdminApi, brandAdminToken } from '@/lib/ead-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Loader2, LogOut, Users, GraduationCap, Award, TrendingUp,
  UserCheck, UserX, Clock, BookOpen,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { resolveMediaUrl } from '@/lib/media';


const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
}

export default function EadBrandAdminDashboard() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [admin, setAdmin] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brandAdminToken.get()) { nav(`/marca/${slug}/admin/login`, { replace: true }); return; }
    Promise.all([eadBrandAdminApi.me(), eadBrandAdminApi.dashboard()])
      .then(([m, d]) => { setAdmin(m.admin); setData(d); })
      .catch(() => { brandAdminToken.clear(); nav(`/marca/${slug}/admin/login`, { replace: true }); })
      .finally(() => setLoading(false));
  }, [slug, nav]);

  function logout() {
    brandAdminToken.clear();
    nav(`/marca/${slug}/admin/login`, { replace: true });
  }

  if (loading || !data) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const s = data.students, c = data.courses, at = data.attempts;
  const statusPie = [
    { name: 'Aprovados', value: s.approved },
    { name: 'Pendentes', value: s.pending },
    { name: 'Rejeitados', value: s.rejected },
  ].filter(x => x.value > 0);

  const monthly = (data.monthly || []).map((m: any) => ({
    mes: m.month.slice(5) + '/' + m.month.slice(2, 4),
    Cadastros: m.signups, Aprovados: m.approved,
  }));

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {admin?.brand?.logo_url ? (
              <img src={admin.brand.logo_url} alt={admin.brand.name} className="h-9 w-auto max-w-[120px] object-contain" />
            ) : (
              <div className="h-9 w-9 rounded" style={{ background: admin?.brand?.primary_color || '#0ea5e9' }} />
            )}
            <div className="min-w-0">
              <div className="font-semibold truncate">{admin?.brand?.name} — Painel</div>
              <div className="text-xs text-muted-foreground truncate">{admin?.name} · {admin?.email}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" />Sair</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Kpi label="Inscritos" value={s.total} icon={Users} color="#0ea5e9" />
          <Kpi label="Aprovados" value={s.approved} icon={UserCheck} color="#22c55e" />
          <Kpi label="Pendentes" value={s.pending} icon={Clock} color="#f59e0b" />
          <Kpi label="Rejeitados" value={s.rejected} icon={UserX} color="#ef4444" />
          <Kpi label="Últimos 30d" value={s.last30} icon={TrendingUp} color="#8b5cf6" />
          <Kpi label="Certificados" value={data.certificates} icon={Award} color="#ec4899" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Cursos publicados" value={`${c.published} / ${c.total}`} icon={BookOpen} color="#0ea5e9" />
          <Kpi label="Tentativas de prova" value={at.total} icon={GraduationCap} color="#0284c7" />
          <Kpi label="Provas aprovadas" value={at.passed} icon={Award} color="#22c55e" />
          <Kpi label="Taxa de aprovação" value={`${at.pass_rate.toFixed(1)}%`} icon={TrendingUp} color="#8b5cf6" hint={`Nota média ${at.avg_score.toFixed(1)}`} />
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Cadastros por mês (últimos 6 meses)</CardTitle></CardHeader>
            <CardContent className="h-72">
              {monthly.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Cadastros" fill="#0ea5e9" />
                    <Bar dataKey="Aprovados" fill="#22c55e" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Status dos alunos</CardTitle></CardHeader>
            <CardContent className="h-72">
              {statusPie.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={90} label>
                      {statusPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </CardContent>
          </Card>
        </div>

        {/* Course performance */}
        <Card>
          <CardHeader><CardTitle>Desempenho por curso</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Curso</TableHead>
                <TableHead className="text-right">Alunos que tentaram</TableHead>
                <TableHead className="text-right">Aprovados</TableHead>
                <TableHead className="text-right">Taxa</TableHead>
                <TableHead className="text-right">Nota média</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.top_courses?.length ? data.top_courses.map((cr: any) => {
                  const rate = cr.students_attempted ? (cr.students_passed / cr.students_attempted) * 100 : 0;
                  return (
                    <TableRow key={cr.id}>
                      <TableCell className="font-medium">{cr.title}</TableCell>
                      <TableCell className="text-right">{cr.students_attempted}</TableCell>
                      <TableCell className="text-right">{cr.students_passed}</TableCell>
                      <TableCell className="text-right">{rate.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">{cr.avg_score.toFixed(1)}</TableCell>
                    </TableRow>
                  );
                }) : <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top students + recent + pending */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Top alunos (certificados / desempenho)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead className="text-right">Certificados</TableHead>
                  <TableHead className="text-right">Nota média</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.top_students?.length ? data.top_students.map((st: any) => (
                    <TableRow key={st.id}>
                      <TableCell>
                        <div className="font-medium">{st.name}</div>
                        <div className="text-xs text-muted-foreground">{st.email}</div>
                      </TableCell>
                      <TableCell className="text-right">{st.certificates}</TableCell>
                      <TableCell className="text-right">{Number(st.avg_score || 0).toFixed(1)}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Aguardando aprovação</CardTitle>
              {s.pending > 0 && <Badge variant="destructive">{s.pending}</Badge>}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa / Local</TableHead>
                  <TableHead className="text-right">Cadastro</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.pending_students?.length ? data.pending_students.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.company || '—'}
                        {(p.city || p.state) && <div className="text-xs text-muted-foreground">{[p.city, p.state].filter(Boolean).join(' / ')}</div>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmtDate(p.created_at)}</TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem pendências</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Cadastros recentes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Data</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.recent_students?.length ? data.recent_students.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.company || '—'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.email}<div className="text-xs text-muted-foreground">{[r.city, r.state].filter(Boolean).join(' / ')}</div></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right text-sm">{fmtDate(r.created_at)}</TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem cadastros</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, hint }: { label: string; value: any; icon: any; color: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    approved: { label: 'Aprovado', variant: 'default' },
    pending: { label: 'Pendente', variant: 'secondary' },
    rejected: { label: 'Rejeitado', variant: 'destructive' },
  };
  const m = map[status] || { label: status, variant: 'outline' };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function Empty() {
  return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados no período</div>;
}
