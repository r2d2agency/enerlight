import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useScheduleBlockMutations, BLOCK_REASONS, ScheduleBlock } from "@/hooks/use-schedule-blocks";
import { Loader2, Ban, Repeat } from "lucide-react";
import { format } from "date-fns";

const DAY_NAMES = [
  { id: 0, label: "Dom" },
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
];

const RECURRENCE_PATTERNS: Record<string, string> = {
  daily: "Todo dia",
  weekdays: "Dias úteis (Seg-Sex)",
  weekly: "Semanal (escolher dias)",
  monthly: "Mensal (mesmo dia)",
};

interface ScheduleBlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: ScheduleBlock | null;
  defaultDate?: Date | null;
}

export function ScheduleBlockDialog({ open, onOpenChange, block, defaultDate }: ScheduleBlockDialogProps) {
  const { create, update } = useScheduleBlockMutations();
  const isEdit = !!block;

  const [title, setTitle] = useState(block?.title || "");
  const [reason, setReason] = useState(block?.reason || "other");
  const [blockDate, setBlockDate] = useState(
    block?.block_date?.split("T")[0] || (defaultDate ? format(defaultDate, "yyyy-MM-dd") : new Date().toISOString().split("T")[0])
  );
  const [allDay, setAllDay] = useState(block?.all_day ?? true);
  const [startTime, setStartTime] = useState(block?.start_time?.slice(0, 5) || "08:00");
  const [endTime, setEndTime] = useState(block?.end_time?.slice(0, 5) || "18:00");
  const [notes, setNotes] = useState(block?.notes || "");
  const [recurrent, setRecurrent] = useState(block?.recurrent ?? false);
  const [recurrencePattern, setRecurrencePattern] = useState(block?.recurrence_pattern || "weekdays");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(block?.recurrence_days || [1, 2, 3, 4, 5]);
  const [recurrenceEnd, setRecurrenceEnd] = useState(block?.recurrence_end?.split("T")[0] || "");

  const handleReasonChange = (val: string) => {
    setReason(val);
    if (!title || Object.values(BLOCK_REASONS).some(r => r.label === title)) {
      setTitle(BLOCK_REASONS[val]?.label || "");
    }
  };

  const toggleDay = (dayId: number) => {
    setRecurrenceDays(prev =>
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId].sort()
    );
  };

  const handleSubmit = async () => {
    if (!title.trim() || !blockDate) return;

    const data: any = {
      title, reason, block_date: blockDate, all_day: allDay, notes: notes || undefined,
      start_time: allDay ? undefined : startTime,
      end_time: allDay ? undefined : endTime,
      recurrent,
      recurrence_pattern: recurrent ? recurrencePattern : undefined,
      recurrence_days: recurrent && recurrencePattern === "weekly" ? recurrenceDays : undefined,
      recurrence_end: recurrent && recurrenceEnd ? recurrenceEnd : undefined,
    };

    if (isEdit) {
      await update.mutateAsync({ id: block.id, ...data });
    } else {
      await create.mutateAsync(data);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  // Preview text
  const getRecurrencePreview = () => {
    if (!recurrent) return null;
    let text = RECURRENCE_PATTERNS[recurrencePattern] || "";
    if (recurrencePattern === "weekly") {
      const days = DAY_NAMES.filter(d => recurrenceDays.includes(d.id)).map(d => d.label).join(", ");
      text = `Semanal: ${days || "nenhum dia"}`;
    }
    if (!allDay && startTime && endTime) {
      text += ` • ${startTime}-${endTime}`;
    } else {
      text += " • Dia inteiro";
    }
    if (recurrenceEnd) text += ` • Até ${recurrenceEnd.split("-").reverse().join("/")}`;
    else text += " • Sem data final";
    return text;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            {isEdit ? "Editar Bloqueio" : "Novo Bloqueio de Agenda"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={handleReasonChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(BLOCK_REASONS).map(([key, { label, emoji }]) => (
                  <SelectItem key={key} value={key}>{emoji} {label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Férias, Consulta médica..." />
          </div>

          <div className="space-y-2">
            <Label>{recurrent ? "Data de início *" : "Data *"}</Label>
            <Input type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={allDay} onCheckedChange={setAllDay} />
            <Label>Dia inteiro</Label>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
          )}

          {/* Recurrence */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-3">
              <Switch checked={recurrent} onCheckedChange={setRecurrent} />
              <Label className="flex items-center gap-2">
                <Repeat className="h-4 w-4" /> Repetir
              </Label>
            </div>

            {recurrent && (
              <>
                <div className="space-y-2">
                  <Label>Frequência</Label>
                  <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RECURRENCE_PATTERNS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {recurrencePattern === "weekly" && (
                  <div className="space-y-2">
                    <Label>Dias da semana</Label>
                    <div className="flex gap-1.5">
                      {DAY_NAMES.map(day => (
                        <Button
                          key={day.id}
                          type="button"
                          variant={recurrenceDays.includes(day.id) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.id)}
                          className="w-10 h-8 text-xs"
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Repetir até (opcional)</Label>
                  <Input type="date" value={recurrenceEnd} onChange={e => setRecurrenceEnd(e.target.value)} min={blockDate} />
                </div>

                {/* Preview */}
                <div className="rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
                  🔄 {getRecurrencePreview()}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes opcionais..." rows={2} />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim() || !blockDate}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
            {isEdit ? "Salvar" : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
