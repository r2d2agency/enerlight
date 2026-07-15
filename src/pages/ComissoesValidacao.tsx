import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, X, RotateCcw, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useValidationQueue, useValidationMutations, useCommissionOrgUsers, useCommissionSummary, ValidationRecord } from "@/hooks/use-commission";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

function firstOfMonth() {
  const d = new Date(); return format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd");
}
function lastOfMonth() {
  const d = new Date(); return format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd");
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  validated: { label: "Validado", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected: { label: "Rejeitado", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export default function ComissoesValidacao() {
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(lastOfMonth());
  const [status, setStatus] = useState("pending");
  const [userId, setUserId] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ValidationRecord | null>(null);

  const { data, isLoading } = useValidationQueue({
    start_date: startDate, end_date: endDate,
    status: status !== "all" ? status : undefined,
    user_id: userId !== "all" ? userId : undefined,
  });
  const { data: users } = useCommissionOrgUsers();
  const { data: summary } = useCommissionSummary({ start_date: startDate, end_date: endDate });
  const { updateRecord, bulkStatus } = useValidationMutations();

  const records = data?.records || [];
  const totalsByStatus = useMemo(() => {
    const acc: Record<string, { count: number; total: number }> = {};
    (data?.stats || []).forEach((s: any) => { acc[s.status] = { count: Number(s.count), total: Number(s.total_value) }; });
    return acc;
  }, [data]);

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(records.map(r => r.id))); else setSelected(new Set());
  };
  const toggleOne = (id: string) => {
    setSelected(s => { const ns = new Set(s); ns.has(id) ? ns.delete(id) : ns.add(id); return ns; });
  };

  const groupedByDay = useMemo(() => {
    const m: Record<string, ValidationRecord[]> = {};
    records.forEach(r => {
      const d = (r.billing_date || "").slice(0, 10);
      (m[d] ||= []).push(r);
    });
    return Object.entries(m).sort(([a], [b]) => b.localeCompare(a));
  }, [records]);

  const doBulk = async (newStatus: string) => {
    if (!selected.size) return;
    await bulkStatus.mutateAsync({ ids: Array.from(selected), status: newStatus });
    toast.success(`${selected.size} registros atualizados`);
    setSelected(new Set());
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Validação de Faturamento</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Confira dia a dia, item por item. Registros marcados como <b>Validados</b> entram no cálculo de comissão dos vendedores.
      </p>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="validated">Validado</SelectItem>
                <SelectItem value="rejected">Rejeitado</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Vendedor</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(users || []).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-2 flex items-end gap-2">
            <Button size="sm" variant="default" disabled={!selected.size || bulkStatus.isPending}
              onClick={() => doBulk("validated")}>
              <Check className="h-4 w-4 mr-1" /> Validar ({selected.size})
            </Button>
            <Button size="sm" variant="outline" disabled={!selected.size || bulkStatus.isPending}
              onClick={() => doBulk("rejected")}>
              <X className="h-4 w-4 mr-1" /> Rejeitar
            </Button>
            <Button size="sm" variant="ghost" disabled={!selected.size || bulkStatus.isPending}
              onClick={() => doBulk("pending")}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["pending", "validated", "rejected"] as const).map(s => (
          <Card key={s}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{STATUS_LABEL[s].label}</div>
              <div className="text-2xl font-bold">{totalsByStatus[s]?.count || 0}</div>
              <div className="text-sm">{fmt(totalsByStatus[s]?.total || 0)}</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Vendedores impactados</div>
            <div className="text-2xl font-bold">{summary?.users?.length || 0}</div>
            <div className="text-sm text-muted-foreground">no período</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !records.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum registro no período/filtro.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map(([day, list]) => {
            const dayTotal = list.reduce((s, r) => s + Number(r.adjusted_value ?? r.order_value), 0);
            const validatedTotal = list.filter(r => r.validation_status === "validated" && !r.is_refund)
              .reduce((s, r) => s + Number(r.adjusted_value ?? r.order_value), 0);
            return (
              <Card key={day}>
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {day ? format(new Date(day + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR }) : "Sem data"}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {list.length} itens • Total {fmt(dayTotal)} • Validado {fmt(validatedTotal)}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <Checkbox
                            checked={list.every(r => selected.has(r.id))}
                            onCheckedChange={(c) => {
                              const ns = new Set(selected);
                              list.forEach(r => c ? ns.add(r.id) : ns.delete(r.id));
                              setSelected(ns);
                            }}
                          />
                        </TableHead>
                        <TableHead>Cliente / Pedido</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-24">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map(r => {
                        const st = r.validation_status || "pending";
                        const value = Number(r.adjusted_value ?? r.order_value);
                        return (
                          <TableRow key={r.id} className={r.is_refund ? "bg-red-50/40 dark:bg-red-950/10" : ""}>
                            <TableCell>
                              <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{r.client_name || "—"}</div>
                              <div className="text-xs text-muted-foreground">#{r.order_number}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{r.linked_user_name || <span className="text-muted-foreground">Sem vínculo</span>}</div>
                              <div className="text-xs text-muted-foreground">{r.seller_name}</div>
                            </TableCell>
                            <TableCell className="text-sm">{r.channel || "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className={`text-sm font-medium ${r.is_refund ? "text-red-600" : ""}`}>
                                {r.is_refund ? "-" : ""}{fmt(value)}
                              </div>
                              {r.adjusted_value != null && (
                                <div className="text-[10px] text-muted-foreground line-through">{fmt(r.order_value)}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={STATUS_LABEL[st].className}>{STATUS_LABEL[st].label}</Badge>
                              {r.is_refund && <Badge variant="outline" className="ml-1 text-red-600">Devolução</Badge>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600"
                                  onClick={() => updateRecord.mutate({ id: r.id, patch: { status: "validated" } })}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600"
                                  onClick={() => updateRecord.mutate({ id: r.id, patch: { status: "rejected" } })}>
                                  <X className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7"
                                  onClick={() => setEditing(r)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EditDialog record={editing} onClose={() => setEditing(null)} users={users || []} />
    </div>
  );
}

function EditDialog({ record, onClose, users }: { record: ValidationRecord | null; onClose: () => void; users: any[] }) {
  const { updateRecord } = useValidationMutations();
  const [adjusted, setAdjusted] = useState<string>("");
  const [linked, setLinked] = useState<string>("");
  const [channel, setChannel] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [isRefund, setIsRefund] = useState(false);

  useMemo(() => {
    if (record) {
      setAdjusted(record.adjusted_value != null ? String(record.adjusted_value) : "");
      setLinked(record.linked_user_id || "");
      setChannel(record.channel || "");
      setNote(record.validation_note || "");
      setIsRefund(!!record.is_refund);
    }
  }, [record?.id]);

  const save = async () => {
    if (!record) return;
    await updateRecord.mutateAsync({
      id: record.id,
      patch: {
        adjusted_value: adjusted === "" ? null : (Number(adjusted) as any),
        linked_user_id: linked || null,
        channel,
        validation_note: note,
        is_refund: isRefund,
      } as any,
    });
    toast.success("Registro atualizado");
    onClose();
  };

  return (
    <Dialog open={!!record} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar registro</DialogTitle>
        </DialogHeader>
        {record && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Pedido <b>#{record.order_number}</b> — {record.client_name}
            </div>
            <div>
              <Label className="text-xs">Valor ajustado (deixe vazio para manter o original {fmt(record.order_value)})</Label>
              <Input type="number" step="0.01" value={adjusted} onChange={e => setAdjusted(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vendedor vinculado</Label>
              <Select value={linked || "__none__"} onValueChange={v => setLinked(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem vínculo</SelectItem>
                  {users.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Canal</Label>
              <Input value={channel} onChange={e => setChannel(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Observação / Motivo</Label>
              <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isRefund} onCheckedChange={c => setIsRefund(!!c)} />
              Marcar como devolução / estorno (subtrai da base de comissão)
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={updateRecord.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
