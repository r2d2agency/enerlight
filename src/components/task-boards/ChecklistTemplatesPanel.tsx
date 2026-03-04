import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ListChecks, Edit2, X, Check } from "lucide-react";
import {
  useChecklistTemplates,
  useTemplateMutations,
  ChecklistTemplate,
} from "@/hooks/use-task-boards";
import { useToast } from "@/hooks/use-toast";

export function ChecklistTemplatesPanel() {
  const { data: templates = [], isLoading } = useChecklistTemplates();
  const { createTemplate, updateTemplate, deleteTemplate } = useTemplateMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const { toast } = useToast();

  const handleOpenCreate = () => {
    setName("");
    setItems([""]);
    setEditId(null);
    setShowCreate(true);
  };

  const handleEdit = async (template: ChecklistTemplate) => {
    setName(template.name);
    // We'd need to fetch items, but for now use placeholders
    setItems(template.items?.map(i => i.text) || [""]);
    setEditId(template.id);
    setShowCreate(true);
  };

  const handleSave = () => {
    const validItems = items.filter(i => i.trim());
    if (!name.trim() || validItems.length === 0) {
      toast({ title: "Preencha o nome e pelo menos 1 item", variant: "destructive" });
      return;
    }
    if (editId) {
      updateTemplate.mutate({ id: editId, name: name.trim(), items: validItems });
    } else {
      createTemplate.mutate({ name: name.trim(), items: validItems });
    }
    setShowCreate(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Templates de Checklist</h3>
          <p className="text-sm text-muted-foreground">Modelos reutilizáveis para checklists de tarefas</p>
        </div>
        <Button size="sm" onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Novo Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  {t.name}
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(t)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteTemplate.mutate(t.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary" className="text-[10px]">
                {t.item_count} itens
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar" : "Novo"} Template</DialogTitle>
            <DialogDescription>Defina os itens do checklist</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do template" />
            </div>

            <ScrollArea className="max-h-60">
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={item}
                      onChange={(e) => {
                        const next = [...items];
                        next[i] = e.target.value;
                        setItems(next);
                      }}
                      placeholder={`Item ${i + 1}`}
                      className="text-sm"
                    />
                    {items.length > 1 && (
                      <Button
                        variant="ghost" size="sm" className="h-10 w-10 p-0"
                        onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Button variant="outline" size="sm" className="w-full" onClick={() => setItems([...items, ""])}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar item
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
