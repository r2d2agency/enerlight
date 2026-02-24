import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useScheduleBlockMutations, BLOCK_REASONS, ScheduleBlock } from "@/hooks/use-schedule-blocks";
import { Loader2, Ban } from "lucide-react";
import { format } from "date-fns";

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

  // Auto-fill title based on reason
  const handleReasonChange = (val: string) => {
    setReason(val);
    if (!title || Object.values(BLOCK_REASONS).some(r => r.label === title)) {
      setTitle(BLOCK_REASONS[val]?.label || "");
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !blockDate) return;

    const data: any = {
      title, reason, block_date: blockDate, all_day: allDay, notes: notes || undefined,
      start_time: allDay ? undefined : startTime,
      end_time: allDay ? undefined : endTime,
    };

    if (isEdit) {
      await update.mutateAsync({ id: block.id, ...data });
    } else {
      await create.mutateAsync(data);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            {isEdit ? "Editar Bloqueio" : "Novo Bloqueio de Agenda"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={handleReasonChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(BLOCK_REASONS).map(([key, { label, emoji }]) => (
                  <SelectItem key={key} value={key}>
                    {emoji} {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Férias, Consulta médica..." />
          </div>

          <div className="space-y-2">
            <Label>Data *</Label>
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

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes opcionais..." rows={2} />
          </div>
        </div>

        <DialogFooter>
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
