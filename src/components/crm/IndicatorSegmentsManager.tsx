import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useIndicatorSegments, useIndicatorSegmentMutations } from "@/hooks/use-representatives";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_COLORS = ["#a855f7", "#3b82f6", "#22c55e", "#f97316", "#ef4444", "#eab308", "#06b6d4", "#ec4899"];

export function IndicatorSegmentsManager({ open, onOpenChange }: Props) {
  const { data: segments = [] } = useIndicatorSegments();
  const { create, remove } = useIndicatorSegmentMutations();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    create.mutate({ name: newName.trim(), color: newColor }, {
      onSuccess: () => { setNewName(""); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Segmentos de Atuação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Ex: Indústria, Postos, Franquias..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={!newName.trim() || create.isPending} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {segments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum segmento cadastrado.
              </p>
            ) : (
              segments.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2 rounded-md border">
                  <Badge style={{ backgroundColor: s.color, color: "white" }} className="border-0">
                    {s.name}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => remove.mutate(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
