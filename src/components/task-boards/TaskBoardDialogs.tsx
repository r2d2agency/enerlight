import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrgMember } from "@/hooks/use-task-boards";

interface CreateCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnId: string;
  isGlobal: boolean;
  members: OrgMember[];
  defaultAssignedTo?: string;
  onSubmit: (data: {
    column_id: string;
    title: string;
    description?: string;
    priority: string;
    assigned_to?: string;
    due_date?: string;
    type?: string;
  }) => void;
}

export function CreateCardDialog({ open, onOpenChange, columnId, isGlobal, members, defaultAssignedTo, onSubmit }: CreateCardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [cardType, setCardType] = useState("task");
  const [assignedTo, setAssignedTo] = useState(defaultAssignedTo || "");
  const [dueDate, setDueDate] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({
      column_id: columnId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      assigned_to: assignedTo || undefined,
      due_date: dueDate || undefined,
      type: cardType,
    });
    setTitle("");
    setDescription("");
    setPriority("medium");
    setCardType("task");
    setAssignedTo(defaultAssignedTo || "");
    setDueDate("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>Crie uma nova tarefa nesta coluna</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Preparar proposta comercial"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes da tarefa..."
              className="min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select value={cardType} onValueChange={setCardType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Tarefa</SelectItem>
                  <SelectItem value="external_visit">Visita Externa</SelectItem>
                  <SelectItem value="call">Ligação</SelectItem>
                  <SelectItem value="meeting">Reunião</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🟦 Baixa</SelectItem>
                  <SelectItem value="medium">🟨 Média</SelectItem>
                  <SelectItem value="high">🟧 Alta</SelectItem>
                  <SelectItem value="urgent">🟥 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Prazo</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Responsável</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {members.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>Criar Tarefa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateBoardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onSubmit: (data: { name: string; description?: string; color?: string; is_global?: boolean }) => void;
}

export function CreateBoardDialog({ open, onOpenChange, isAdmin, onSubmit }: CreateBoardDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [isGlobal, setIsGlobal] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), description: description.trim() || undefined, color, is_global: isGlobal });
    setName("");
    setDescription("");
    setColor("#6366f1");
    setIsGlobal(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Quadro</DialogTitle>
          <DialogDescription>Crie um novo quadro de tarefas</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome do quadro *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Meu quadro pessoal" autoFocus />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional..." />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-1">
              {["#6366f1", "#f59e0b", "#22c55e", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"].map(c => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
              <div>
                <p className="text-sm font-medium">Quadro Global</p>
                <p className="text-xs text-muted-foreground">Visível para toda a organização</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>Criar Quadro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
