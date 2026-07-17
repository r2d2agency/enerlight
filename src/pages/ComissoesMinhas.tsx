import { useState, useMemo } from "react";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

const safeFormat = (value: any, pattern: string) => {
  if (!value) return "—";
  const s = String(value);
  const d = s.length <= 10 ? new Date(s + "T12:00:00") : new Date(s);
  return isValid(d) ? format(d, pattern, { locale: ptBR }) : "—";
};
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Sparkles, Loader2, TrendingUp, Target, Wallet } from "lucide-react";
import { useMyCommission } from "@/hooks/use-commission";
import { isBusinessDay } from "@/lib/brazilian-holidays";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const firstOfMonth = () => { const d = new Date(); return format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"); };
const lastOfMonth = () => { const d = new Date(); return format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd"); };

function businessDaysRemaining(endDate: string) {
  const end = new Date(endDate + "T12:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let count = 0;
  for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    if (isBusinessDay(d)) count++;
  }
  return count;
}

export default function ComissoesMinhas() {
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(lastOfMonth());
  const { data, isLoading } = useMyCommission({ start_date: startDate, end_date: endDate });

  const remainingDays = businessDaysRemaining(endDate);

  const progressValue = data?.projected_net_total ?? data?.net_total ?? 0;

  const motivation = useMemo(() => {
    if (!data?.commission?.nextTier) return null;
    const nt = data.commission.nextTier;
    const remaining = Math.max(0, nt.target - progressValue);
    const perDay = remainingDays > 0 ? remaining / remainingDays : remaining;
    return { nextTier: nt, remaining, perDay };
  }, [data, remainingDays, progressValue]);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const tiers = data?.rule?.tiers || [];
  const achievedIds = new Set((data?.commission?.achieved || []).map((a: any) => a.target));
  const maxTarget = tiers.length ? Math.max(...tiers.map((t: any) => t.target)) : (progressValue || 1);
  const pct = maxTarget > 0 ? Math.min(100, (progressValue / maxTarget) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Minha Comissão</h1>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      {!data?.rule && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="py-4 text-sm">
            Você ainda não tem regra de comissão cadastrada. Fale com seu supervisor.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Faturamento do mês
            </div>
            <div className="text-2xl font-bold">{fmt(data?.projected_net_total || 0)}</div>
            <div className="text-xs text-muted-foreground">
              {data?.total_count || 0} pedidos no período
            </div>
            {(data?.projected_redbar_net_total || 0) > 0 && (
              <div className="mt-1 text-[11px] text-red-700 dark:text-red-400">
                Red Bar: {fmt(data?.projected_redbar_net_total || 0)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Já validado
            </div>
            <div className="text-2xl font-bold text-green-600">{fmt(data?.net_total || 0)}</div>
            <div className="text-xs text-muted-foreground">
              {data?.validated_count || 0} validados • {fmt(data?.pending_total || 0)} aguardando
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4" /> Comissão a receber
            </div>
            <div className="text-2xl font-bold text-primary">{fmt(data?.commission?.total || 0)}</div>
            <div className="text-xs text-muted-foreground">
              Projeção mês: {fmt(data?.projected_commission?.total || 0)}
            </div>
            {data?.commission?.redbar_enabled && (
              <div className="mt-1 text-[11px] text-red-700 dark:text-red-400">
                Padrão: {fmt(data?.commission?.regular?.total || 0)} • Red Bar: {fmt(data?.commission?.redbar?.total || 0)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="h-4 w-4" /> Próxima meta
            </div>
            {data?.commission?.nextTier ? (
              <>
                <div className="text-2xl font-bold">{fmt(data.commission.nextTier.target)}</div>
                <div className="text-xs text-muted-foreground">{data.commission.nextTier.label || "Faixa"}</div>
              </>
            ) : (
              <div className="text-lg font-bold text-green-600">🏆 Todas as metas batidas!</div>
            )}
          </CardContent>
        </Card>
      </div>

      {tiers.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Progresso das metas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Progress value={pct} className="h-3" />
            <div className="flex flex-wrap gap-3">
              {tiers.map((t: any, i: number) => {
                const done = achievedIds.has(t.target);
                return (
                  <div key={i} className={`rounded-lg border p-3 min-w-[180px] ${done ? "border-green-500 bg-green-50/40 dark:bg-green-950/20" : ""}`}>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {done ? <Trophy className="h-3.5 w-3.5 text-green-600" /> : <Target className="h-3.5 w-3.5" />}
                      {t.label || `Meta ${i + 1}`}
                    </div>
                    <div className="text-lg font-bold">{fmt(t.target)}</div>
                    <div className="text-xs">
                      Bônus: {t.extra_percent > 0 && `+${t.extra_percent}%`}{t.extra_percent > 0 && t.extra_fixed > 0 && " + "}{t.extra_fixed > 0 && fmt(t.extra_fixed)}
                    </div>
                    {done && <Badge className="mt-1 bg-green-100 text-green-700">Batida</Badge>}
                  </div>
                );
              })}
            </div>
            {motivation && (
              <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <b>Faltam {fmt(motivation.remaining)}</b> para bater <b>{motivation.nextTier.label || "a próxima meta"}</b>
                  ({fmt(motivation.nextTier.target)}).
                  {remainingDays > 0 && <> Vendendo <b>{fmt(motivation.perDay)}</b> por dia útil ({remainingDays} restantes), você chega lá! 💪</>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Evolução diária</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead>
                <TableHead className="text-right">Pedidos validados</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.daily || []).map((d: any) => (
                <TableRow key={d.day}>
                  <TableCell>{safeFormat(d.day, "dd/MM (EEE)")}</TableCell>
                  <TableCell className="text-right">{d.count}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(d.value)}</TableCell>
                </TableRow>
              ))}
              {!data?.daily?.length && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem dados no período</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Detalhamento por pedido</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente / Pedido</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.details || []).map((r: any) => (
                <TableRow key={r.id} className={r.is_refund ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
                  <TableCell className="text-sm">{safeFormat(r.billing_date, "dd/MM")}</TableCell>
                  <TableCell>
                    <div className="text-sm">{r.client_name}</div>
                    <div className="text-xs text-muted-foreground">#{r.order_number}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.channel || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.validation_status === "validated" ? "default" : "outline"}>
                      {r.validation_status === "validated" ? "Validado" : r.validation_status === "rejected" ? "Rejeitado" : "Pendente"}
                    </Badge>
                    {r.is_refund && <Badge variant="outline" className="ml-1 text-red-600">Devolução</Badge>}
                  </TableCell>
                  <TableCell className={`text-right text-sm font-medium ${r.is_refund ? "text-red-600" : ""}`}>
                    {r.is_refund ? "-" : ""}{fmt(Number(r.adjusted_value ?? r.order_value))}
                  </TableCell>
                </TableRow>
              ))}
              {!data?.details?.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Sem pedidos no período</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
