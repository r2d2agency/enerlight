import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, RefreshCw, Plus, Pencil, Trash2, History, ShieldCheck, Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type Punch = {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  punch_type: string;
  punched_at: string;
  source: string;
  notes?: string;
};

type Missing = { user_id: string; name: string; email: string; work_start_time?: string };

const TYPE_LABEL: Record<string, string> = {
  entrada: 'Entrada',
  cafe_ini: 'Café (saída)',
  cafe_fim: 'Café (volta)',
  almoco_ini: 'Almoço (saída)',
  almoco_fim: 'Almoço (volta)',
  saida: 'Saída',
  extra: 'Extra',
};

const TYPES = Object.keys(TYPE_LABEL);

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
  } catch { return '—'; }
}

export default function PunchAdmin() {
  const [date, setDate] = useState(todayISO());
  const [punches, setPunches] = useState<Punch[]>([]);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [totals, setTotals] = useState({ present: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Array<{ user_id: string; name: string }>>([]);

  // dialogs
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    user_id: '', punch_type: 'entrada', time: '08:00', reason: '', notes: '',
  });
  const [editingPunch, setEditingPunch] = useState<Punch | null>(null);
  const [editForm, setEditForm] = useState({ punch_type: 'entrada', time: '08:00', reason: '', notes: '' });
  const [auditPunch, setAuditPunch] = useState<Punch | null>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, mRes, eRes] = await Promise.all([
        api<Punch[]>(`/api/rh/punches?date=${date}`),
        api<{ missing: Missing[]; total: number; present: number }>('/api/rh/punches/dashboard/missing-today'),
        api<any[]>('/api/rh/employees/full').catch(() => []),
      ]);
      setPunches(Array.isArray(pRes) ? pRes : []);
      setMissing(mRes?.missing || []);
      setTotals({ present: mRes?.present || 0, total: mRes?.total || 0 });
      setEmployees((Array.isArray(eRes) ? eRes : []).map((e: any) => ({ user_id: e.user_id, name: e.name })));
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  const grouped = useMemo(() => {
    const map: Record<string, { name: string; email?: string; items: Punch[] }> = {};
    for (const p of punches) {
      if (!map[p.user_id]) map[p.user_id] = { name: p.user_name || '—', email: p.user_email, items: [] };
      map[p.user_id].items.push(p);
    }
    for (const k of Object.keys(map)) {
      map[k].items.sort((a, b) => a.punched_at.localeCompare(b.punched_at));
    }
    return Object.entries(map);
  }, [punches]);

  const submitManual = async () => {
    if (!manualForm.user_id || !manualForm.reason) {
      toast.error('Colaborador e motivo são obrigatórios');
      return;
    }
    const [h, m] = manualForm.time.split(':');
    const dt = new Date(`${date}T${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}:00`);
    try {
      await api('/api/rh/punches/manual', {
        method: 'POST',
        body: {
          user_id: manualForm.user_id,
          punch_type: manualForm.punch_type,
          punched_at: dt.toISOString(),
          reason: manualForm.reason,
          notes: manualForm.notes,
        },
      });
      toast.success('Batida registrada');
      setManualOpen(false);
      setManualForm({ user_id: '', punch_type: 'entrada', time: '08:00', reason: '', notes: '' });
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registrar batida');
    }
  };

  const openEdit = (p: Punch) => {
    setEditingPunch(p);
    const t = new Date(p.punched_at);
    setEditForm({
      punch_type: p.punch_type,
      time: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
      reason: '',
      notes: p.notes || '',
    });
  };

  const submitEdit = async () => {
    if (!editingPunch || !editForm.reason) {
      toast.error('Motivo obrigatório');
      return;
    }
    const [h, m] = editForm.time.split(':');
    const original = new Date(editingPunch.punched_at);
    original.setHours(Number(h), Number(m), 0, 0);
    try {
      await api(`/api/rh/punches/${editingPunch.id}`, {
        method: 'PATCH',
        body: {
          punch_type: editForm.punch_type,
          punched_at: original.toISOString(),
          notes: editForm.notes,
          reason: editForm.reason,
        },
      });
      toast.success('Batida atualizada');
      setEditingPunch(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar');
    }
  };

  const removePunch = async (p: Punch) => {
    const reason = window.prompt('Motivo para excluir esta batida?');
    if (!reason) return;
    try {
      await api(`/api/rh/punches/${p.id}`, {
        method: 'DELETE',
        body: { reason },
      });
      toast.success('Batida excluída');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao excluir');
    }
  };

  const showAudit = async (p: Punch) => {
    setAuditPunch(p);
    try {
      const rows = await api<any[]>(`/api/rh/punches/${p.id}/audit`);
      setAuditRows(Array.isArray(rows) ? rows : []);
    } catch {
      setAuditRows([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[160px]" />
          </div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Button onClick={() => setManualOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Ajuste manual
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Colaboradores ativos</div>
          <div className="text-2xl font-bold">{totals.total}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Bateram hoje</div>
          <div className="text-2xl font-bold text-green-600">{totals.present}</div>
        </CardContent></Card>
        <Card className="border-destructive/40"><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Sem bater ponto
          </div>
          <div className="text-2xl font-bold text-destructive">{missing.length}</div>
        </CardContent></Card>
      </div>

      {missing.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" /> Alertas — sem bater ponto hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {missing.map((m) => (
              <Badge key={m.user_id} variant="destructive" className="text-xs">
                {m.name}{m.work_start_time ? ` · início ${String(m.work_start_time).slice(0, 5)}` : ''}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Batidas do dia</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Café (saída)</TableHead>
                <TableHead>Café (volta)</TableHead>
                <TableHead>Almoço (saída)</TableHead>
                <TableHead>Almoço (volta)</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Extras</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhuma batida neste dia.
                </TableCell></TableRow>
              ) : grouped.map(([uid, row]) => {
                const byType = (t: string) => row.items.filter(i => i.punch_type === t);
                const cell = (t: string) => {
                  const items = byType(t);
                  if (!items.length) return <span className="text-muted-foreground">—</span>;
                  return (
                    <div className="space-y-1">
                      {items.map(p => (
                        <div key={p.id} className="flex items-center gap-1">
                          <span className="font-mono text-sm">{fmtTime(p.punched_at)}</span>
                          <Badge variant={p.source === 'manual' ? 'outline' : 'secondary'} className="text-[10px]">
                            {p.source}
                          </Badge>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(p)} title="Editar">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => showAudit(p)} title="Auditoria">
                            <History className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removePunch(p)} title="Excluir">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                };
                return (
                  <TableRow key={uid}>
                    <TableCell>
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </TableCell>
                    <TableCell>{cell('entrada')}</TableCell>
                    <TableCell>{cell('almoco_ini')}</TableCell>
                    <TableCell>{cell('almoco_fim')}</TableCell>
                    <TableCell>{cell('saida')}</TableCell>
                    <TableCell>{cell('extra')}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setManualForm(f => ({ ...f, user_id: uid }));
                        setManualOpen(true);
                      }}>+ ajustar</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manual dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent aria-describedby="manual-desc">
          <DialogHeader>
            <DialogTitle>Ajuste manual de ponto</DialogTitle>
            <DialogDescription id="manual-desc">
              Toda batida manual fica registrada na auditoria com o motivo informado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Colaborador</Label>
              <Select value={manualForm.user_id} onValueChange={(v) => setManualForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={manualForm.punch_type} onValueChange={(v) => setManualForm(f => ({ ...f, punch_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hora ({date})</Label>
                <Input type="time" value={manualForm.time} onChange={(e) => setManualForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Motivo *</Label>
              <Textarea rows={2} value={manualForm.reason} onChange={(e) => setManualForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ex.: esqueceu de bater na entrada" />
            </div>
            <div>
              <Label>Observação (opcional)</Label>
              <Input value={manualForm.notes} onChange={(e) => setManualForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>Cancelar</Button>
            <Button onClick={submitManual}><ShieldCheck className="h-4 w-4 mr-1" /> Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingPunch} onOpenChange={(o) => !o && setEditingPunch(null)}>
        <DialogContent aria-describedby="edit-desc">
          <DialogHeader>
            <DialogTitle>Editar batida</DialogTitle>
            <DialogDescription id="edit-desc">
              A alteração fica registrada na auditoria com autor, antes/depois e motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={editForm.punch_type} onValueChange={(v) => setEditForm(f => ({ ...f, punch_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hora</Label>
                <Input type="time" value={editForm.time} onChange={(e) => setEditForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Motivo *</Label>
              <Textarea rows={2} value={editForm.reason} onChange={(e) => setEditForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingPunch(null)}>Cancelar</Button>
            <Button onClick={submitEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit dialog */}
      <Dialog open={!!auditPunch} onOpenChange={(o) => !o && setAuditPunch(null)}>
        <DialogContent aria-describedby="audit-desc">
          <DialogHeader>
            <DialogTitle>Auditoria da batida</DialogTitle>
            <DialogDescription id="audit-desc">Histórico completo desta batida.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto space-y-2 text-sm">
            {auditRows.length === 0 ? (
              <div className="text-muted-foreground text-center py-6">Sem eventos.</div>
            ) : auditRows.map((r) => (
              <div key={r.id} className="border rounded-md p-2">
                <div className="flex justify-between items-center">
                  <Badge variant={r.action === 'delete' ? 'destructive' : r.action === 'create' ? 'default' : 'secondary'}>
                    {r.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="text-xs mt-1">
                  Por: <b>{r.actor_name || '—'}</b>
                </div>
                {r.reason && <div className="text-xs mt-1">Motivo: {r.reason}</div>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
