import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { RefreshCw, Lock, Unlock, FileSpreadsheet, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type Punch = {
  id: string; user_id: string; punch_type: string;
  punched_at: string; source: string; notes?: string;
};

type Closure = {
  id: string; year_month: string; closed_at: string; closed_by_name?: string;
  reopened_at?: string | null; reopen_reason?: string | null;
} | null;

const SEQ = ['entrada', 'almoco_ini', 'almoco_fim', 'saida', 'extra', 'extra'];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
  } catch { return '—'; }
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function diffHours(punches: Punch[]) {
  // Soma pares (entrada→saída, ida→volta) sequencialmente
  const ordered = [...punches].sort((a, b) => a.punched_at.localeCompare(b.punched_at));
  let total = 0;
  for (let i = 0; i + 1 < ordered.length; i += 2) {
    const a = new Date(ordered[i].punched_at).getTime();
    const b = new Date(ordered[i + 1].punched_at).getTime();
    if (b > a) total += (b - a) / 3600000;
  }
  return total;
}

function fmtH(h: number) {
  if (!h) return '0h';
  const H = Math.floor(h);
  const M = Math.round((h - H) * 60);
  return `${H}h${String(M).padStart(2, '0')}`;
}

export default function TimesheetAdmin() {
  const [employees, setEmployees] = useState<Array<{ user_id: string; name: string }>>([]);
  const [userId, setUserId] = useState<string>('');
  const [month, setMonth] = useState<string>(currentMonth());
  const [loading, setLoading] = useState(false);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [closure, setClosure] = useState<Closure>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await api<any[]>('/api/rh/employees/full');
        const mapped = (list || []).map((e: any) => ({ user_id: e.user_id, name: e.name }));
        setEmployees(mapped);
        if (mapped.length && !userId) setUserId(mapped[0].user_id);
      } catch (e: any) {
        toast.error(e?.message || 'Erro ao carregar colaboradores');
      }
    })();
    // eslint-disable-next-line
  }, []);

  const load = async () => {
    if (!userId || !month) return;
    setLoading(true);
    try {
      const r = await api<any>(`/api/rh/timesheet?user_id=${userId}&month=${month}`);
      setPunches(r?.punches || []);
      setClosure(r?.closure || null);
      setClosed(!!r?.closed);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar folha');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId, month]);

  const byDay = useMemo(() => {
    const map: Record<string, Punch[]> = {};
    for (const p of punches) {
      const d = dayKey(p.punched_at);
      (map[d] ||= []).push(p);
    }
    // ordena por dia asc
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [punches]);

  const totalMonth = useMemo(
    () => byDay.reduce((acc, [, list]) => acc + diffHours(list), 0),
    [byDay]
  );

  const close = async () => {
    const notes = window.prompt('Observação de fechamento (opcional):') || '';
    try {
      await api('/api/rh/timesheet/close', {
        method: 'POST', body: { user_id: userId, month, notes },
      });
      toast.success('Folha fechada');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao fechar folha');
    }
  };

  const reopen = async () => {
    const reason = window.prompt('Motivo para reabrir a folha?');
    if (!reason) return;
    try {
      await api('/api/rh/timesheet/reopen', {
        method: 'POST', body: { user_id: userId, month, reason },
      });
      toast.success('Folha reaberta');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao reabrir folha');
    }
  };

  const empName = employees.find((e) => e.user_id === userId)?.name || '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Label className="text-xs">Colaborador</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
          </div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {closed ? (
            <>
              <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> Fechada</Badge>
              <Button variant="outline" onClick={reopen} className="gap-2">
                <Unlock className="h-4 w-4" /> Reabrir
              </Button>
            </>
          ) : (
            <Button onClick={close} className="gap-2" disabled={!userId}>
              <Lock className="h-4 w-4" /> Fechar folha
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Colaborador</div>
          <div className="text-lg font-semibold truncate">{empName}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Dias com batidas</div>
          <div className="text-2xl font-bold">{byDay.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs text-muted-foreground">Total do mês</div>
          <div className="text-2xl font-bold">{fmtH(totalMonth)}</div>
        </CardContent></Card>
      </div>

      {closure && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 text-sm">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span>
                Fechada em {new Date(closure.closed_at).toLocaleString('pt-BR')}
                {closure.closed_by_name ? ` por ${closure.closed_by_name}` : ''}.
              </span>
            </div>
            {closure.reopened_at && (
              <div className="text-muted-foreground mt-1">
                Reaberta em {new Date(closure.reopened_at).toLocaleString('pt-BR')}
                {closure.reopen_reason ? ` — motivo: ${closure.reopen_reason}` : ''}.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Folha do mês</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead>
                {SEQ.map((_, i) => (
                  <TableHead key={i}>Batida {i + 1}</TableHead>
                ))}
                <TableHead className="text-right">Horas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDay.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={SEQ.length + 2} className="text-center text-muted-foreground py-8">
                    Sem batidas neste mês.
                  </TableCell>
                </TableRow>
              ) : byDay.map(([d, list]) => {
                const ordered = [...list].sort((a, b) => a.punched_at.localeCompare(b.punched_at));
                const dateLabel = new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', {
                  weekday: 'short', day: '2-digit', month: '2-digit',
                });
                return (
                  <TableRow key={d}>
                    <TableCell className="font-medium whitespace-nowrap">{dateLabel}</TableCell>
                    {SEQ.map((_, i) => {
                      const p = ordered[i];
                      return (
                        <TableCell key={i}>
                          {p ? (
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-sm">{fmtTime(p.punched_at)}</span>
                              {p.source === 'manual' && (
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-mono">{fmtH(diffHours(ordered))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
