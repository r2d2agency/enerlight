import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { listJourneys, saveJourney, deleteJourney, WEEKDAYS, type Journey } from '@/lib/rh-journeys';
import { cn } from '@/lib/utils';

const empty = {
  id: undefined as string | undefined,
  name: '',
  days: [1, 2, 3, 4, 5],
  workStart: '08:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  workEnd: '18:00',
  toleranceMinutes: 10,
};

export default function JourneyManagement() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const reload = () => setJourneys(listJourneys());
  useEffect(reload, []);

  const openNew = () => {
    setForm(empty);
    setOpen(true);
  };
  const openEdit = (j: Journey) => {
    setForm({ ...j });
    setOpen(true);
  };

  const toggleDay = (d: number) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort(),
    }));
  };

  const submit = () => {
    if (!form.name.trim()) return toast.error('Informe o nome da jornada');
    if (!form.days.length) return toast.error('Selecione ao menos um dia');
    saveJourney(form);
    toast.success('Jornada salva');
    setOpen(false);
    reload();
  };

  const remove = (id: string) => {
    if (!confirm('Excluir esta jornada?')) return;
    deleteJourney(id);
    reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">Defina modelos de jornada e atribua a cada colaborador na aba Colaboradores.</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Jornada
        </Button>
      </div>

      {journeys.length === 0 ? (
        <Card>
          <CardContent className="text-center py-10 text-muted-foreground">
            <CalendarClock className="h-10 w-10 mx-auto mb-3 opacity-30" />
            Nenhuma jornada cadastrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {journeys.map((j) => (
            <Card key={j.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{j.name}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(j)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(j.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((w, i) => (
                    <Badge key={i} variant={j.days.includes(i) ? 'default' : 'outline'} className="text-[10px]">
                      {w}
                    </Badge>
                  ))}
                </div>
                <div className="font-mono text-xs bg-muted/50 rounded-md p-2">
                  {j.workStart} → {j.lunchStart} | {j.lunchEnd} → {j.workEnd}
                </div>
                <div className="text-xs text-muted-foreground">Tolerância: {j.toleranceMinutes} min</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="journey-desc">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar Jornada' : 'Nova Jornada'}</DialogTitle>
            <DialogDescription id="journey-desc">
              Configure dias e horários que serão usados como referência de jornada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Comercial 08-18" />
            </div>

            <div>
              <Label className="mb-2 block">Dias da semana</Label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((w, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                      form.days.includes(i)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-input hover:bg-muted',
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início expediente</Label>
                <Input type="time" value={form.workStart} onChange={(e) => setForm({ ...form, workStart: e.target.value })} />
              </div>
              <div>
                <Label>Início almoço</Label>
                <Input type="time" value={form.lunchStart} onChange={(e) => setForm({ ...form, lunchStart: e.target.value })} />
              </div>
              <div>
                <Label>Fim almoço</Label>
                <Input type="time" value={form.lunchEnd} onChange={(e) => setForm({ ...form, lunchEnd: e.target.value })} />
              </div>
              <div>
                <Label>Fim expediente</Label>
                <Input type="time" value={form.workEnd} onChange={(e) => setForm({ ...form, workEnd: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Tolerância (minutos)</Label>
              <Input
                type="number"
                min={0}
                value={form.toleranceMinutes}
                onChange={(e) => setForm({ ...form, toleranceMinutes: Number(e.target.value) })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
