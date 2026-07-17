import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { eadBrandAdminApi, brandAdminToken } from '@/lib/ead-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import {
  Loader2, LogOut, Users, GraduationCap, Award, TrendingUp,
  UserCheck, UserX, Clock, BookOpen, Building2, Filter, X, Layers, Check, XCircle, MapPin,
  Settings, Plus, Trash2, Save,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { resolveMediaUrl } from '@/lib/media';
import enerlightLogo from '@/assets/enerlight-logo.png';




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
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [company, setCompany] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [certFilter, setCertFilter] = useState<'all' | 'with' | 'without'>('all');
  const [installerSearch, setInstallerSearch] = useState('');


  async function loadDashboard(f?: string, t?: string, c?: string, ci?: string) {
    const d = await eadBrandAdminApi.dashboard({
      from: f || undefined,
      to: t || undefined,
      company: c || undefined,
      city: ci || undefined,
    });
    setData(d);
  }

  useEffect(() => {
    if (!brandAdminToken.get()) { nav(`/marca/${slug}/admin/login`, { replace: true }); return; }
    Promise.all([eadBrandAdminApi.me(), eadBrandAdminApi.dashboard(), eadBrandAdminApi.settings()])
      .then(([m, d, st]) => { setAdmin(m.admin); setData(d); setSettings(st); })
      .catch(() => { brandAdminToken.clear(); nav(`/marca/${slug}/admin/login`, { replace: true }); })
      .finally(() => setLoading(false));
  }, [slug, nav]);

  function setRecipient(i: number, k: 'name' | 'phone' | 'email', v: string) {
    setSettings((prev: any) => {
      const arr = [...(prev?.notify_admin_recipients || [])];
      arr[i] = { ...arr[i], [k]: v };
      return { ...(prev || {}), notify_admin_recipients: arr };
    });
  }

  function addRecipient() {
    setSettings((prev: any) => ({
      ...(prev || {}),
      notify_admin_recipients: [...(prev?.notify_admin_recipients || []), { name: '', phone: '', email: '' }],
    }));
  }

  function removeRecipient(i: number) {
    setSettings((prev: any) => {
      const arr = [...(prev?.notify_admin_recipients || [])];
      arr.splice(i, 1);
      return { ...(prev || {}), notify_admin_recipients: arr };
    });
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const recipients = (settings.notify_admin_recipients || [])
        .map((r: any) => ({
          name: String(r.name || '').trim(),
          phone: String(r.phone || '').replace(/\D/g, ''),
          email: String(r.email || '').trim().toLowerCase(),
        }))
        .filter((r: any) => r.phone || r.email);
      const r = await eadBrandAdminApi.updateSettings({
        notify_connection_id: settings.notify_connection_id || null,
        notify_admin_recipients: recipients,
        signup_notify_message: settings.signup_notify_message || null,
      });
      setSettings((prev: any) => ({ ...(prev || {}), ...(r.settings || {}), notify_admin_recipients: recipients }));
      toast.success('Notificações salvas');
    } catch (e: any) { toast.error(e.message || 'Erro ao salvar notificações'); }
    finally { setSavingSettings(false); }
  }

  async function applyFilters() {
    setReloading(true);
    try { await loadDashboard(from, to, company, city); } finally { setReloading(false); }
  }
  async function clearFilters() {
    setFrom(''); setTo(''); setCompany(''); setCity('');
    setReloading(true);
    try { await loadDashboard('', '', '', ''); } finally { setReloading(false); }
  }
  function setPreset(days: number) {
    const t = new Date();
    const f = new Date(); f.setDate(f.getDate() - days);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    setFrom(iso(f)); setTo(iso(t));
    setReloading(true);
    loadDashboard(iso(f), iso(t), company, city).finally(() => setReloading(false));
  }
  function onCompanyChange(v: string) {
    const next = v === '__all__' ? '' : v;
    setCompany(next);
    setReloading(true);
    loadDashboard(from, to, next, city).finally(() => setReloading(false));
  }
  function onCityChange(v: string) {
    const next = v === '__all__' ? '' : v;
    setCity(next);
    setReloading(true);
    loadDashboard(from, to, company, next).finally(() => setReloading(false));
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      const r: any = await eadBrandAdminApi.approveStudent(id);
      const w = r?.notify?.whatsapp;
      const em = r?.notify?.email;
      toast.success(`Aprovado! WhatsApp: ${w?.success ? 'enviado' : (w?.error || 'falhou')} • E-mail: ${em?.success ? 'enviado' : (em?.error || 'falhou')}`);
      await loadDashboard(from, to, company, city);
    } catch (e: any) {
      if (e?.status === 400) { toast.info(e.message || 'Já aprovado'); await loadDashboard(from, to, company, city); }
      else toast.error(e.message || 'Erro ao aprovar');
    }
    finally { setBusyId(null); }
  }
  async function reject(id: string) {
    const reason = window.prompt('Motivo da rejeição (opcional):') || '';
    setBusyId(id);
    try {
      await eadBrandAdminApi.rejectStudent(id, reason);
      toast.success('Cadastro rejeitado');
      await loadDashboard(from, to, company, city);
    } catch (e: any) { toast.error(e.message || 'Erro ao rejeitar'); }
    finally { setBusyId(null); }
  }



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

  const logoUrl = resolveMediaUrl(admin?.brand?.logo_url);

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-background border-b sticky top-0 z-10">
        <div
          className="h-1 w-full"
          style={{ background: 'linear-gradient(90deg, #2563eb, #06b6d4, #2563eb)', boxShadow: '0 0 10px rgba(6,182,212,0.6)' }}
        />
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-3 items-center gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={admin?.brand?.name}
                  className="h-12 w-auto max-w-[160px] object-contain"
                  onError={() => setAdmin((prev: any) => ({ ...prev, brand: { ...prev?.brand, logo_url: null } }))}
                />
              ) : (
                <div className="h-10 w-10 rounded shrink-0" style={{ background: admin?.brand?.primary_color || '#0ea5e9' }} />
              )}
              <div className="min-w-0 hidden sm:block">
                <div className="text-sm font-semibold truncate">{admin?.brand?.name}</div>
                <div className="text-xs text-muted-foreground truncate">{admin?.name} · {admin?.email}</div>
              </div>
            </div>
            <div className="flex justify-center">
              <img src={enerlightLogo} alt="Enerlight" className="h-8 w-auto object-contain opacity-90" />
            </div>
            <div className="flex justify-end gap-1">
              <Link to={`/marca/${slug}/admin/catalogos`}>
                <Button variant="outline" size="sm"><Layers className="h-4 w-4 mr-1" />Catálogos</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4 mr-1" />Sair</Button>
            </div>
          </div>
        </div>
      </header>



      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 flex-1 w-full">
        {/* Filtros */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" /> Período
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">De</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Até</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Empresa</Label>
                <Select value={company || '__all__'} onValueChange={onCompanyChange}>
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue placeholder="Todas as empresas" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="__all__">Todas as empresas</SelectItem>
                    {(data.all_companies || []).map((c: string) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Cidade</Label>
                <Select value={city || '__all__'} onValueChange={onCityChange}>
                  <SelectTrigger className="h-9 w-[200px]">
                    <SelectValue placeholder="Todas as cidades" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="__all__">Todas as cidades</SelectItem>
                    {(data.all_cities || []).map((c: string) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={applyFilters} disabled={reloading}>
                {reloading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
              </Button>
              {(from || to || company || city) && (
                <Button size="sm" variant="ghost" onClick={clearFilters} disabled={reloading}>
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}

              <div className="flex gap-1 ml-auto flex-wrap">
                <Button size="sm" variant="outline" onClick={() => setPreset(7)}>7 dias</Button>
                <Button size="sm" variant="outline" onClick={() => setPreset(30)}>30 dias</Button>
                <Button size="sm" variant="outline" onClick={() => setPreset(90)}>90 dias</Button>
                <Button size="sm" variant="outline" onClick={() => setPreset(365)}>12 meses</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {settings && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Notificações de novos cadastros</CardTitle>
              <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" />Salvar</>}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-[260px_1fr] gap-4">
                <div className="space-y-2">
                  <Label>Conexão WhatsApp</Label>
                  <Select
                    value={settings.notify_connection_id || '__auto__'}
                    onValueChange={(v) => setSettings((prev: any) => ({ ...(prev || {}), notify_connection_id: v === '__auto__' ? null : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Automática</SelectItem>
                      {(settings.connections || []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.instance_name || c.phone_number || c.instance_id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mensagem para administradores</Label>
                  <Textarea
                    value={settings.signup_notify_message || ''}
                    onChange={(e) => setSettings((prev: any) => ({ ...(prev || {}), signup_notify_message: e.target.value }))}
                    placeholder="Use {nome}, {email}, {telefone}, {empresa}, {cidade}, {uf}, {marca}, {destinatario}"
                    rows={3}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Destinatários fixos</Label>
                  <Button size="sm" variant="outline" onClick={addRecipient}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
                </div>
                {(settings.notify_admin_recipients || []).length === 0 && (
                  <div className="text-sm text-muted-foreground border rounded-md p-3">Nenhum destinatário configurado.</div>
                )}
                {(settings.notify_admin_recipients || []).map((r: any, i: number) => (
                  <div key={i} className="grid md:grid-cols-[1fr_170px_1fr_auto] gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input value={r.name || ''} onChange={(e) => setRecipient(i, 'name', e.target.value)} placeholder="Nome" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">WhatsApp</Label>
                      <Input value={r.phone || ''} onChange={(e) => setRecipient(i, 'phone', e.target.value)} placeholder="5599999999999" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">E-mail</Label>
                      <Input type="email" value={r.email || ''} onChange={(e) => setRecipient(i, 'email', e.target.value)} placeholder="nome@empresa.com" />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeRecipient(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
            <CardHeader><CardTitle>Status dos instaladores</CardTitle></CardHeader>
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
                <TableHead className="text-right">Instaladores que tentaram</TableHead>
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

        {/* Empresas dos instaladores */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Empresas dos instaladores</CardTitle>
            <Badge variant="secondary">{data.companies?.length || 0} empresas</Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead className="text-right">Instaladores</TableHead>
                <TableHead className="text-right">Aprovados</TableHead>
                <TableHead className="text-right">Pendentes</TableHead>
                <TableHead className="text-right">Último cadastro</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.companies?.length ? data.companies.map((co: any, i: number) => (
                  <TableRow key={`${co.company}-${i}`}>
                    <TableCell className="font-medium">{co.company}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{[co.city, co.state].filter(Boolean).join(' / ') || '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{co.total}</TableCell>
                    <TableCell className="text-right text-emerald-600">{co.approved}</TableCell>
                    <TableCell className="text-right text-amber-600">{co.pending}</TableCell>
                    <TableCell className="text-right text-sm">{fmtDate(co.last_signup)}</TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem dados no período</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top students + recent + pending */}

        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Top instaladores (certificados / desempenho)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Instalador</TableHead>
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
                  <TableHead>Instalador</TableHead>
                  <TableHead>Empresa / Cidade</TableHead>
                  <TableHead className="text-right">Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.pending_students?.length ? data.pending_students.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                        {p.phone && <div className="text-xs text-muted-foreground">📱 {p.phone}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-muted-foreground" />{p.company || '—'}</div>
                        {(p.city || p.state) && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />{[p.city, p.state].filter(Boolean).join(' / ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmtDate(p.created_at)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 mr-1"
                          disabled={busyId === p.id}
                          onClick={() => approve(p.id)}
                        >
                          {busyId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" />Aprovar</>}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={busyId === p.id}
                          onClick={() => reject(p.id)}
                        >
                          <XCircle className="h-3 w-3 mr-1" />Rejeitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem pendências</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>


        {/* Instaladores */}
        {(() => {
          const list: any[] = data.installers || data.recent_students || [];
          const stats = data.installer_stats || {
            total: list.length,
            with_certificate: list.filter((x: any) => (x.certificate_count || 0) > 0).length,
            without_certificate: list.filter((x: any) => !(x.certificate_count || 0)).length,
            avg_attempts: 0,
            avg_attempts_active: 0,
          };
          const q = installerSearch.trim().toLowerCase();
          const filtered = list.filter((r: any) => {
            if (certFilter === 'with' && !(r.certificate_count > 0)) return false;
            if (certFilter === 'without' && (r.certificate_count > 0)) return false;
            if (!q) return true;
            return [r.name, r.email, r.company, r.city, r.state, r.phone]
              .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q));
          });
          const certPie = [
            { name: 'Com certificado', value: stats.with_certificate },
            { name: 'Sem certificado', value: stats.without_certificate },
          ].filter(x => x.value > 0);
          return (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Instaladores</CardTitle>
                <Badge variant="secondary">{filtered.length} de {list.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Kpi label="Total cadastrados" value={stats.total} icon={Users} color="#0ea5e9" />
                  <Kpi label="Com certificado" value={stats.with_certificate} icon={Award} color="#22c55e" />
                  <Kpi label="Sem certificado" value={stats.without_certificate} icon={UserX} color="#ef4444" />
                  <Kpi
                    label="Média de tentativas"
                    value={Number(stats.avg_attempts || 0).toFixed(1)}
                    icon={GraduationCap}
                    color="#8b5cf6"
                    hint={`Ativos: ${Number(stats.avg_attempts_active || 0).toFixed(1)}/instalador`}
                  />
                </div>

                {certPie.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="h-56">
                      <div className="text-sm font-medium mb-2">Distribuição por certificado</div>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={certPie} dataKey="value" nameKey="name" outerRadius={70} label>
                            {certPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="h-56">
                      <div className="text-sm font-medium mb-2">Tentativas de prova por instalador</div>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[...list]
                            .sort((a: any, b: any) => (b.attempts_count || 0) - (a.attempts_count || 0))
                            .slice(0, 8)
                            .map((r: any) => ({ nome: (r.name || '').split(' ')[0], Tentativas: r.attempts_count || 0, Certificados: r.certificate_count || 0 }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="nome" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Tentativas" fill="#8b5cf6" />
                          <Bar dataKey="Certificados" fill="#22c55e" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs">Certificado</Label>
                    <Select value={certFilter} onValueChange={(v) => setCertFilter(v as any)}>
                      <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="with">Com certificado</SelectItem>
                        <SelectItem value="without">Sem certificado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1 flex-1 min-w-[220px]">
                    <Label className="text-xs">Buscar</Label>
                    <Input
                      value={installerSearch}
                      onChange={(e) => setInstallerSearch(e.target.value)}
                      placeholder="Nome, e-mail, empresa, cidade..."
                      className="h-9"
                    />
                  </div>
                  {(certFilter !== 'all' || installerSearch) && (
                    <Button size="sm" variant="ghost" onClick={() => { setCertFilter('all'); setInstallerSearch(''); }}>
                      <X className="h-4 w-4 mr-1" /> Limpar
                    </Button>
                  )}
                </div>

                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Instalador</TableHead>
                    <TableHead>Empresa / Cidade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tentativas</TableHead>
                    <TableHead className="text-right">Tent. p/ certificado</TableHead>
                    <TableHead className="text-right">Certificados</TableHead>
                    <TableHead className="text-right">Cadastro</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.length ? filtered.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.email}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{r.company || '—'}</div>
                          <div className="text-xs text-muted-foreground">{[r.city, r.state].filter(Boolean).join(' / ')}</div>
                        </TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-right">{r.attempts_count ?? 0}</TableCell>
                        <TableCell className="text-right">
                          {(r.certificate_count || 0) > 0 && (r.attempts_until_certificate || 0) > 0 ? (
                            <Badge variant="outline">{r.attempts_until_certificate}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {(r.certificate_count || 0) > 0 ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{r.certificate_count}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmtDate(r.created_at)}</TableCell>
                      </TableRow>
                    )) : <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sem instaladores</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })()}

      </main>

      <footer className="bg-background border-t mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col items-center gap-2">
          <img src={enerlightLogo} alt="Enerlight" className="h-8 w-auto object-contain opacity-90" />
          <div className="text-xs text-muted-foreground">Plataforma de ensino powered by Enerlight</div>
        </div>
      </footer>
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
