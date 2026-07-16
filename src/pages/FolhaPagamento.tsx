import { useState, useMemo } from "react";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, CheckCircle2, XCircle, DollarSign, ArrowLeft, Send, Wallet } from "lucide-react";
import {
  usePayrollConfig,
  usePayrollEmployees,
  usePayrollPeriods,
  usePayrollPeriod,
  usePayrollMutations,
  type PayrollItem,
} from "@/hooks/use-payroll";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  manager_review: { label: "Aguardando Gerente", variant: "outline" },
  ceo_review: { label: "Aguardando CEO", variant: "outline" },
  finance_review: { label: "Aguardando Financeiro", variant: "outline" },
  approved: { label: "Aprovada (3/3)", variant: "default" },
  paid: { label: "Paga", variant: "default" },
  rejected: { label: "Rejeitada", variant: "destructive" },
};

const brl = (v: any) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

function safeMonth(v: string) {
  const d = new Date(v);
  return isValid(d) ? format(d, "MMMM 'de' yyyy", { locale: ptBR }) : "—";
}

export default function FolhaPagamento() {
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [tab, setTab] = useState("periods");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Folha de Pagamento</h1>
          <p className="text-sm text-muted-foreground">
            Feche a folha do mês com salário, comissão, bônus e deduções — com aprovação Gerente → CEO → Financeiro.
          </p>
        </div>
      </div>

      {selectedPeriodId ? (
        <PeriodDetail id={selectedPeriodId} onBack={() => setSelectedPeriodId(null)} />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="periods">Folhas</TabsTrigger>
            <TabsTrigger value="employees">Salários base</TabsTrigger>
            <TabsTrigger value="config">Aprovadores</TabsTrigger>
          </TabsList>
          <TabsContent value="periods"><PeriodsList onSelect={setSelectedPeriodId} /></TabsContent>
          <TabsContent value="employees"><EmployeesTab /></TabsContent>
          <TabsContent value="config"><ConfigTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function PeriodsList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: periods = [], isLoading } = usePayrollPeriods();
  const { createPeriod, remove } = usePayrollMutations();
  const [newMonth, setNewMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const handleCreate = async () => {
    try {
      const res = await createPeriod.mutateAsync(`${newMonth}-01`);
      toast({ title: "Folha criada", description: "Colaboradores populados com salário e comissão do mês." });
      onSelect(res.id);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Folhas do mês</CardTitle>
        <CardDescription>Criar uma nova folha para o mês de referência</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Mês de referência</Label>
            <Input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
          </div>
          <Button onClick={handleCreate} disabled={createPeriod.isPending}>
            <Plus className="w-4 h-4 mr-1" /> Criar / Recarregar folha
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Colaboradores</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => {
                const s = STATUS_LABEL[p.status] || { label: p.status, variant: "secondary" as const };
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => onSelect(p.id)}>
                    <TableCell className="font-medium capitalize">{safeMonth(p.reference_month)}</TableCell>
                    <TableCell>{p.items_count}</TableCell>
                    <TableCell>{brl(p.total_value)}</TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      {["draft", "rejected"].includes(p.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Excluir esta folha?")) remove.mutate(p.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!periods.length && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma folha criada ainda</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeesTab() {
  const { data: employees = [] } = usePayrollEmployees();
  const { saveEmployee } = usePayrollMutations();
  const [edits, setEdits] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salário base por colaborador</CardTitle>
        <CardDescription>Esses valores serão puxados automaticamente ao criar a folha do mês.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Colaborador</TableHead><TableHead>E-mail</TableHead><TableHead>Salário base</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((e) => (
              <TableRow key={e.user_id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{e.email}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-40"
                    value={edits[e.user_id] ?? Number(e.base_salary || 0)}
                    onChange={(ev) => setEdits({ ...edits, [e.user_id]: ev.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const v = Number(edits[e.user_id] ?? e.base_salary) || 0;
                      await saveEmployee.mutateAsync({ userId: e.user_id, base_salary: v });
                      toast({ title: "Salvo" });
                    }}
                  >
                    Salvar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ConfigTab() {
  const { data } = usePayrollConfig();
  const { saveConfig } = usePayrollMutations();
  const [form, setForm] = useState({ manager_user_id: "", ceo_user_id: "", finance_user_id: "" });
  const users = data?.users || [];

  useMemo(() => {
    if (data?.config) {
      setForm({
        manager_user_id: data.config.manager_user_id || "",
        ceo_user_id: data.config.ceo_user_id || "",
        finance_user_id: data.config.finance_user_id || "",
      });
    }
  }, [data?.config]);

  const roleField = (key: "manager_user_id" | "ceo_user_id" | "finance_user_id", label: string) => (
    <div>
      <Label>{label}</Label>
      <Select value={form[key] || "none"} onValueChange={(v) => setForm({ ...form, [key]: v === "none" ? "" : v })}>
        <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Ninguém —</SelectItem>
          {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aprovadores da folha</CardTitle>
        <CardDescription>Fluxo sequencial: Gerente → CEO → Financeiro. Cada um pode editar antes de aprovar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        {roleField("manager_user_id", "Gerente (1ª aprovação)")}
        {roleField("ceo_user_id", "CEO (2ª aprovação)")}
        {roleField("finance_user_id", "Financeiro (3ª aprovação + libera pagamento)")}
        <Button
          onClick={async () => {
            await saveConfig.mutateAsync({
              manager_user_id: form.manager_user_id || null,
              ceo_user_id: form.ceo_user_id || null,
              finance_user_id: form.finance_user_id || null,
            });
            toast({ title: "Aprovadores atualizados" });
          }}
        >
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

function PeriodDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading } = usePayrollPeriod(id);
  const m = usePayrollMutations();
  const [editItem, setEditItem] = useState<PayrollItem | null>(null);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const { period, items, deductions, approvals, myRole } = data;
  const status = STATUS_LABEL[period.status] || { label: period.status, variant: "secondary" as const };
  const canEdit = ["draft", "manager_review", "ceo_review", "finance_review", "rejected"].includes(period.status);
  const expectedRole = { manager_review: "manager", ceo_review: "ceo", finance_review: "finance" }[period.status];
  const canApprove = !!expectedRole && myRole === expectedRole;

  const total = items.reduce((s, i) => s + Number(i.total || 0), 0);

  const dedByItem = deductions.reduce((acc, d) => {
    (acc[d.item_id] ||= []).push(d);
    return acc;
  }, {} as Record<string, typeof deductions>);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
        <h2 className="text-xl font-semibold capitalize">Folha de {safeMonth(period.reference_month)}</h2>
        <Badge variant={status.variant} className="ml-2">{status.label}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-right">Bônus</TableHead>
                <TableHead className="text-right">Deduções</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const dList = dedByItem[i.id] || [];
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">
                      {i.user_name_current || i.user_name}
                      {dList.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {dList.map((d) => `${d.description}: ${brl(d.value)}`).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{brl(i.base_salary)}</TableCell>
                    <TableCell className="text-right">{brl(i.commission_value)}</TableCell>
                    <TableCell className="text-right">{brl(i.bonus_value)}</TableCell>
                    <TableCell className="text-right text-destructive">-{brl(i.deductions_total)}</TableCell>
                    <TableCell className="text-right font-semibold">{brl(i.total)}</TableCell>
                    <TableCell>
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => setEditItem(i)}>Editar</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell colSpan={5} className="text-right font-bold">TOTAL DA FOLHA</TableCell>
                <TableCell className="text-right font-bold text-lg">{brl(total)}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Aprovações</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {approvals.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma aprovação registrada.</p>}
          {approvals.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm">
              {a.status === "approved" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-destructive" />}
              <span className="capitalize font-medium">{a.role}</span>
              <span className="text-muted-foreground">— {a.user_name || "?"}</span>
              {a.note && <span className="text-muted-foreground">· "{a.note}"</span>}
              <span className="text-muted-foreground ml-auto">
                {a.created_at && isValid(new Date(a.created_at)) ? format(new Date(a.created_at), "dd/MM/yyyy HH:mm") : ""}
              </span>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {period.status === "draft" && (
              <Button onClick={() => m.submit.mutate(id)} disabled={m.submit.isPending}>
                <Send className="w-4 h-4 mr-1" /> Enviar para aprovação
              </Button>
            )}
            {canApprove && (
              <>
                <Button
                  onClick={async () => {
                    await m.approve.mutateAsync({ id });
                    toast({ title: "Aprovado" });
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar como {myRole}
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    const note = prompt("Motivo da rejeição?") || "";
                    await m.reject.mutateAsync({ id, note });
                    toast({ title: "Rejeitada" });
                  }}
                >
                  <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                </Button>
              </>
            )}
            {period.status === "approved" && myRole === "finance" && (
              <Button
                onClick={async () => {
                  if (!confirm("Marcar folha como PAGA? Esta ação é irreversível.")) return;
                  await m.pay.mutateAsync(id);
                  toast({ title: "Folha marcada como paga" });
                }}
              >
                <DollarSign className="w-4 h-4 mr-1" /> Marcar como paga
              </Button>
            )}
            {period.status === "paid" && (
              <Badge variant="default" className="text-base py-1 px-3">
                <DollarSign className="w-4 h-4 mr-1" /> PAGA em {period.paid_at && isValid(new Date(period.paid_at)) ? format(new Date(period.paid_at), "dd/MM/yyyy") : ""}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {editItem && (
        <EditItemDialog
          item={editItem}
          deductions={dedByItem[editItem.id] || []}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

function EditItemDialog({
  item,
  deductions,
  onClose,
}: {
  item: PayrollItem;
  deductions: { id: string; description: string; value: string | number }[];
  onClose: () => void;
}) {
  const m = usePayrollMutations();
  const [base, setBase] = useState(String(item.base_salary));
  const [comm, setComm] = useState(String(item.commission_value));
  const [bonus, setBonus] = useState(String(item.bonus_value));
  const [notes, setNotes] = useState(item.notes || "");
  const [newDedDesc, setNewDedDesc] = useState("");
  const [newDedVal, setNewDedVal] = useState("");

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{item.user_name}</DialogTitle>
          <DialogDescription>Ajuste os valores desta linha</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Salário</Label><Input type="number" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} /></div>
            <div><Label>Comissão</Label><Input type="number" step="0.01" value={comm} onChange={(e) => setComm(e.target.value)} /></div>
            <div><Label>Bônus metas</Label><Input type="number" step="0.01" value={bonus} onChange={(e) => setBonus(e.target.value)} /></div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="border-t pt-3">
            <Label className="mb-2 block">Deduções</Label>
            {deductions.map((d) => (
              <div key={d.id} className="flex items-center gap-2 mb-1 text-sm">
                <span className="flex-1">{d.description}</span>
                <span className="text-destructive">-{brl(d.value)}</span>
                <Button size="icon" variant="ghost" onClick={() => m.removeDeduction.mutate(d.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <Input placeholder="Descrição (INSS, adiantamento…)" value={newDedDesc} onChange={(e) => setNewDedDesc(e.target.value)} />
              <Input type="number" step="0.01" placeholder="Valor" className="w-32" value={newDedVal} onChange={(e) => setNewDedVal(e.target.value)} />
              <Button
                size="sm"
                onClick={async () => {
                  if (!newDedDesc || !newDedVal) return;
                  await m.addDeduction.mutateAsync({ itemId: item.id, description: newDedDesc, value: Number(newDedVal) });
                  setNewDedDesc(""); setNewDedVal("");
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={async () => {
              await m.updateItem.mutateAsync({
                id: item.id,
                base_salary: Number(base) || 0,
                commission_value: Number(comm) || 0,
                bonus_value: Number(bonus) || 0,
                notes,
              });
              toast({ title: "Salvo" });
              onClose();
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
