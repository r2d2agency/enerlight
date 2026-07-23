import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  User, Clock, History, ShieldCheck, CalendarClock, Briefcase, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { listJourneys, assignJourney, getAssignedJourney, WEEKDAYS } from '@/lib/rh-journeys';
import { api } from '@/lib/api';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    role: string;
    is_active?: boolean;
    facial_registered?: boolean;
    cpf?: string;
    birth_date?: string;
    hire_date?: string;
    contract_type?: string;
    base_salary?: number;
    salary_composition?: Array<{ label: string; value: number; type: string }>;
  } | null;
}

const CONTRACT_TYPES = ['CLT', 'PJ', 'Estagio', 'Terceiro', 'Autonomo'];
const ITEM_TYPES = [
  { v: 'fixo', label: 'Fixo' },
  { v: 'variavel', label: 'Variável' },
  { v: 'beneficio', label: 'Benefício' },
  { v: 'desconto', label: 'Desconto' },
];

export default function EmployeeRhDialog({ open, onOpenChange, employee }: Props) {
  const [registers, setRegisters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignedId, setAssignedId] = useState<string>('none');
  const journeys = listJourneys();

  const [contract, setContract] = useState({
    hire_date: '',
    contract_type: '',
    base_salary: '' as string | number,
    is_active: true,
    salary_composition: [] as Array<{ label: string; value: number; type: string }>,
  });
  const [savingContract, setSavingContract] = useState(false);

  useEffect(() => {
    if (!open || !employee) return;
    const a = getAssignedJourney(employee.user_id || employee.id);
    setAssignedId(a?.id || 'none');
    setContract({
      hire_date: employee.hire_date ? String(employee.hire_date).slice(0, 10) : '',
      contract_type: employee.contract_type || '',
      base_salary: employee.base_salary ?? '',
      is_active: employee.is_active !== false,
      salary_composition: Array.isArray(employee.salary_composition) ? employee.salary_composition : [],
    });
    setLoading(true);
    api<any>(`/api/rh/punches/me`).catch(() => null); // warm cache
    api<any[]>(`/api/rh/punches?user_id=${encodeURIComponent(employee.user_id)}&from=${new Date(Date.now() - 30 * 86400000).toISOString()}`)
      .then((r) => setRegisters(Array.isArray(r) ? r : []))
      .catch(() => setRegisters([]))
      .finally(() => setLoading(false));
  }, [open, employee]);

  const saveAssignment = () => {
    if (!employee) return;
    assignJourney(employee.user_id || employee.id, assignedId === 'none' ? null : assignedId);
    toast.success('Jornada atribuída');
  };

  const saveContract = async () => {
    if (!employee) return;
    setSavingContract(true);
    try {
      await api(`/api/rh/employment/${employee.user_id}`, {
        method: 'PATCH',
        body: {
          hire_date: contract.hire_date || null,
          contract_type: contract.contract_type || null,
          base_salary: contract.base_salary === '' ? null : Number(contract.base_salary),
          salary_composition: contract.salary_composition,
          is_active: contract.is_active,
        },
      });
      toast.success('Dados de contratação salvos');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSavingContract(false);
    }
  };

  const addItem = () =>
    setContract(c => ({ ...c, salary_composition: [...c.salary_composition, { label: '', value: 0, type: 'fixo' }] }));
  const updItem = (i: number, patch: Partial<{ label: string; value: number; type: string }>) =>
    setContract(c => ({
      ...c,
      salary_composition: c.salary_composition.map((it, idx) => idx === i ? { ...it, ...patch } : it),
    }));
  const rmItem = (i: number) =>
    setContract(c => ({ ...c, salary_composition: c.salary_composition.filter((_, idx) => idx !== i) }));

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="emp-rh-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> RH — {employee.name}
            {contract.is_active === false && <Badge variant="destructive">Acesso inativo</Badge>}
          </DialogTitle>
          <DialogDescription id="emp-rh-desc">
            Dados pessoais, contratação, jornada e histórico de ponto.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="info" className="gap-1"><User className="h-4 w-4" /> Dados</TabsTrigger>
            <TabsTrigger value="contract" className="gap-1"><Briefcase className="h-4 w-4" /> Contratação</TabsTrigger>
            <TabsTrigger value="journey" className="gap-1"><CalendarClock className="h-4 w-4" /> Jornada</TabsTrigger>
            <TabsTrigger value="history" className="gap-1"><History className="h-4 w-4" /> Pontos</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><Label className="text-xs text-muted-foreground">Nome</Label><div>{employee.name}</div></div>
              <div><Label className="text-xs text-muted-foreground">Email</Label><div className="truncate">{employee.email}</div></div>
              <div><Label className="text-xs text-muted-foreground">Cargo</Label><div>{employee.role}</div></div>
              <div><Label className="text-xs text-muted-foreground">CPF</Label><div>{employee.cpf || '—'}</div></div>
              <div><Label className="text-xs text-muted-foreground">Nascimento</Label><div>{employee.birth_date || '—'}</div></div>
              <div>
                <Label className="text-xs text-muted-foreground">Facial</Label>
                <div>
                  {employee.facial_registered ? (
                    <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Cadastrada</Badge>
                  ) : <Badge variant="outline">Não cadastrada</Badge>}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contract" className="space-y-4 pt-4">
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
              <div>
                <div className="font-medium text-sm">Acesso ativo no app</div>
                <div className="text-xs text-muted-foreground">
                  Ao desativar, o colaborador some das listas de CRM, metas, relatórios e notificações.
                </div>
              </div>
              <Switch checked={contract.is_active} onCheckedChange={(v) => setContract(c => ({ ...c, is_active: v }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de admissão</Label>
                <Input type="date" value={contract.hire_date}
                  onChange={(e) => setContract(c => ({ ...c, hire_date: e.target.value }))} />
              </div>
              <div>
                <Label>Tipo de contrato</Label>
                <Select value={contract.contract_type || undefined}
                  onValueChange={(v) => setContract(c => ({ ...c, contract_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Salário base (R$)</Label>
                <Input type="number" step="0.01" value={contract.base_salary}
                  onChange={(e) => setContract(c => ({ ...c, base_salary: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Composição salarial</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="gap-1">
                  <Plus className="h-3 w-3" /> Adicionar item
                </Button>
              </div>
              <div className="space-y-2">
                {contract.salary_composition.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-3 border rounded-md border-dashed">
                    Sem itens. Adicione benefícios, variáveis ou descontos.
                  </div>
                )}
                {contract.salary_composition.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Input placeholder="Descrição" value={it.label}
                        onChange={(e) => updItem(i, { label: e.target.value })} />
                    </div>
                    <div className="col-span-3">
                      <Input type="number" step="0.01" placeholder="Valor" value={it.value}
                        onChange={(e) => updItem(i, { value: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-3">
                      <Select value={it.type} onValueChange={(v) => updItem(i, { type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ITEM_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1">
                      <Button size="icon" variant="ghost" onClick={() => rmItem(i)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={saveContract} disabled={savingContract} className="w-full">
              {savingContract ? 'Salvando...' : 'Salvar contratação'}
            </Button>
          </TabsContent>

          <TabsContent value="journey" className="space-y-3 pt-4">
            <Label>Jornada atribuída</Label>
            <Select value={assignedId} onValueChange={setAssignedId}>
              <SelectTrigger><SelectValue placeholder="Selecione uma jornada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhuma —</SelectItem>
                {journeys.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {assignedId !== 'none' && (() => {
              const j = journeys.find((x) => x.id === assignedId);
              if (!j) return null;
              return (
                <div className="text-xs bg-muted/50 rounded-md p-3 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAYS.map((w, i) => (
                      <Badge key={i} variant={j.days.includes(i) ? 'default' : 'outline'} className="text-[10px]">{w}</Badge>
                    ))}
                  </div>
                  <div className="font-mono">{j.workStart} → {j.lunchStart} | {j.lunchEnd} → {j.workEnd}</div>
                  <div>Tolerância: {j.toleranceMinutes} min</div>
                </div>
              );
            })()}
            <Button onClick={saveAssignment} className="w-full">Salvar Jornada</Button>
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            <div className="max-h-[320px] overflow-auto space-y-2">
              {loading ? (
                <div className="text-center text-sm text-muted-foreground py-6">Carregando...</div>
              ) : registers.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-6">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhuma batida nos últimos 30 dias.
                </div>
              ) : (
                registers.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                    <div>
                      <div className="font-medium">{r.punch_type}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.punched_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <Badge variant={r.source === 'manual' ? 'outline' : 'secondary'}>{r.source}</Badge>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
