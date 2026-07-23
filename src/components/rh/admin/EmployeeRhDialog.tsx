import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Clock, History, ShieldCheck, CalendarClock } from 'lucide-react';
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
    facial_registered: boolean;
    cpf?: string;
    birth_date?: string;
    journey?: string;
  } | null;
}

export default function EmployeeRhDialog({ open, onOpenChange, employee }: Props) {
  const { getRegisters } = useRh();
  const [registers, setRegisters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignedId, setAssignedId] = useState<string>('none');
  const journeys = listJourneys();

  useEffect(() => {
    if (!open || !employee) return;
    const a = getAssignedJourney(employee.user_id || employee.id);
    setAssignedId(a?.id || 'none');
    setLoading(true);
    getRegisters?.({ userId: employee.user_id, limit: 30 })
      .then((r: any) => setRegisters(Array.isArray(r) ? r : r?.registers || []))
      .catch(() => setRegisters([]))
      .finally(() => setLoading(false));
  }, [open, employee, getRegisters]);

  const saveAssignment = () => {
    if (!employee) return;
    assignJourney(employee.user_id || employee.id, assignedId === 'none' ? null : assignedId);
    toast.success('Jornada atribuída');
  };

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby="emp-rh-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> RH — {employee.name}
          </DialogTitle>
          <DialogDescription id="emp-rh-desc">
            Ficha do colaborador, jornada de trabalho e histórico de registros.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="info" className="gap-1"><User className="h-4 w-4" /> Dados</TabsTrigger>
            <TabsTrigger value="journey" className="gap-1"><CalendarClock className="h-4 w-4" /> Jornada</TabsTrigger>
            <TabsTrigger value="history" className="gap-1"><History className="h-4 w-4" /> Registros</TabsTrigger>
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
                  ) : (
                    <Badge variant="outline">Não cadastrada</Badge>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="journey" className="space-y-3 pt-4">
            <Label>Jornada atribuída</Label>
            <Select value={assignedId} onValueChange={setAssignedId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma jornada" />
              </SelectTrigger>
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
                  Nenhum registro encontrado.
                </div>
              ) : (
                registers.map((r: any, i: number) => (
                  <div key={r.id || i} className="flex items-center justify-between text-sm border rounded-md p-2">
                    <div>
                      <div className="font-medium">{r.type || r.punch_type || 'Registro'}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : ''}
                      </div>
                    </div>
                    <Badge variant="outline">{r.status || 'ok'}</Badge>
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
