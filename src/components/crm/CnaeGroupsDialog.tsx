import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { useCRMCnaeGroups, useCRMCnaeDistinct, CRMCnaeGroup } from "@/hooks/use-crm";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Edit, X, Check, Tag } from "lucide-react";

interface CnaeGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CnaeGroupsDialog({ open, onOpenChange }: CnaeGroupsDialogProps) {
  const { data: groups, isLoading } = useCRMCnaeGroups();
  const { data: distinctCnaes } = useCRMCnaeDistinct();
  const queryClient = useQueryClient();

  const [editingGroup, setEditingGroup] = useState<CRMCnaeGroup | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#3b82f6");
  const [formCodes, setFormCodes] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (editingGroup) {
      setFormName(editingGroup.name);
      setFormColor(editingGroup.color);
      setFormCodes(editingGroup.cnae_codes || []);
      setShowForm(true);
    }
  }, [editingGroup]);

  const handleNew = () => {
    setEditingGroup(null);
    setFormName("");
    setFormColor("#3b82f6");
    setFormCodes([]);
    setManualCode("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingGroup(null);
    setManualCode("");
  };

  const handleSave = async () => {
    if (!formName.trim() || formCodes.length === 0) {
      toast.error("Preencha o nome e selecione ao menos um CNAE");
      return;
    }

    try {
      if (editingGroup) {
        await api(`/api/crm/cnae-groups/${editingGroup.id}`, {
          method: "PUT",
          body: { name: formName, cnae_codes: formCodes, color: formColor },
        });
        toast.success("Grupo atualizado!");
      } else {
        await api("/api/crm/cnae-groups", {
          method: "POST",
          body: { name: formName, cnae_codes: formCodes, color: formColor },
        });
        toast.success("Grupo criado!");
      }
      queryClient.invalidateQueries({ queryKey: ["crm-cnae-groups"] });
      closeForm();
    } catch {
      toast.error("Erro ao salvar grupo");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este grupo CNAE?")) return;
    try {
      await api(`/api/crm/cnae-groups/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["crm-cnae-groups"] });
      toast.success("Grupo excluído");
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const toggleCode = (code: string) => {
    setFormCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const [manualCode, setManualCode] = useState("");

  const addManualCode = () => {
    const code = manualCode.trim();
    if (code && !formCodes.includes(code)) {
      setFormCodes((prev) => [...prev, code]);
      setManualCode("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0" aria-describedby={undefined}>
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Grupos de CNAE</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 flex-col">
          {!showForm ? (
            <>
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-4 px-6 py-4 pr-10">
                  <div className="space-y-2">
                    {groups?.map((group) => (
                      <Card key={group.id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                            <div className="min-w-0">
                              <p className="font-medium">{group.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {group.cnae_codes?.length || 0} CNAEs • {group.companies_count} empresas
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingGroup(group)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(group.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {group.cnae_codes?.map((code) => (
                            <Badge key={code} variant="secondary" className="text-xs">
                              {code}
                            </Badge>
                          ))}
                        </div>
                      </Card>
                    ))}
                    {(!groups || groups.length === 0) && !isLoading && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Nenhum grupo de CNAE criado</p>
                        <p className="text-sm">Crie grupos para filtrar empresas por atividade</p>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              <div className="shrink-0 border-t px-6 py-4">
                <Button onClick={handleNew} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Grupo CNAE
                </Button>
              </div>
            </>
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-4 px-6 py-4 pr-10">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={closeForm}>
                      <X className="h-4 w-4" />
                    </Button>
                    <h3 className="font-medium">{editingGroup ? "Editar Grupo" : "Novo Grupo"}</h3>
                  </div>

                  <div className="grid grid-cols-[1fr_80px] gap-3">
                    <div className="space-y-1">
                      <Label>Nome do grupo</Label>
                      <Input
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Ex: Postos de Combustível"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Cor</Label>
                      <Input
                        type="color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        className="h-9 p-1 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>CNAEs selecionados ({formCodes.length})</Label>
                    <div className="flex flex-wrap gap-1 min-h-[32px]">
                      {formCodes.map((code) => (
                        <Badge
                          key={code}
                          variant="default"
                          className="cursor-pointer gap-1"
                          onClick={() => toggleCode(code)}
                        >
                          {code}
                          <X className="h-3 w-3" />
                        </Badge>
                      ))}
                      {formCodes.length === 0 && (
                        <span className="text-sm text-muted-foreground">Nenhum CNAE selecionado</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Adicionar CNAE manualmente</Label>
                    <div className="flex gap-2">
                      <Input
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        placeholder="Ex: 47.31-8-00"
                        onKeyDown={(e) => e.key === "Enter" && addManualCode()}
                      />
                      <Button variant="outline" size="icon" onClick={addManualCode}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {distinctCnaes && distinctCnaes.length > 0 && (
                    <div className="space-y-2">
                      <Label>CNAEs encontrados na sua base</Label>
                      <div className="max-h-[200px] overflow-y-auto rounded-md border p-2 space-y-1">
                        {distinctCnaes.map((cnae) => {
                          const isSelected = formCodes.includes(cnae.code);
                          return (
                            <div
                              key={cnae.code}
                              className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                                isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                              }`}
                              onClick={() => toggleCode(cnae.code)}
                            >
                              <span className="truncate mr-2">{cnae.code}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs">{cnae.count} empresas</Badge>
                                {isSelected && <Check className="h-4 w-4 text-primary" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="shrink-0 border-t px-6 py-4">
                <Button variant="outline" onClick={closeForm}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>
                  {editingGroup ? "Salvar" : "Criar Grupo"}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
