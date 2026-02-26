import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Users, Loader2 } from "lucide-react";
import { useSalesPositions, useSalesPositionMutations, useCRMOrgMembers } from "@/hooks/use-sales-positions";
import { toast } from "sonner";

export function SalesPositionsPanel() {
  const { data: positions = [], isLoading } = useSalesPositions();
  const { data: orgMembers = [] } = useCRMOrgMembers();
  const { create, update, remove } = useSalesPositionMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");

  const openNew = () => {
    setEditingId(null);
    setName("");
    setUserId("");
    setDialogOpen(true);
  };

  const openEdit = (pos: typeof positions[0]) => {
    setEditingId(pos.id);
    setName(pos.name);
    setUserId(pos.current_user_id || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, name, current_user_id: userId || null });
      } else {
        await create.mutateAsync({ name, current_user_id: userId || undefined });
      }
      setDialogOpen(false);
    } catch {
      toast.error("Erro ao salvar posição");
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Excluir esta posição? As empresas vinculadas ficarão sem posição.")) {
      remove.mutate(id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Posições de Vendas
        </CardTitle>
        <Button size="sm" className="gap-1" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          Nova Posição
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground mb-3">
          Crie posições (ex: Vendas 1, Vendas 2) e vincule um vendedor. Quando o vendedor sair, basta trocar o usuário da posição — todas as empresas continuam vinculadas.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : positions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma posição criada ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Posição</TableHead>
                <TableHead>Vendedor Atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((pos) => (
                <TableRow key={pos.id}>
                  <TableCell className="font-medium">{pos.name}</TableCell>
                  <TableCell>
                    {pos.current_user_name ? (
                      <div>
                        <p className="text-sm">{pos.current_user_name}</p>
                        <p className="text-xs text-muted-foreground">{pos.current_user_email}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Sem vendedor</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={pos.is_active ? "default" : "secondary"}>
                      {pos.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pos)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(pos.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Posição" : "Nova Posição de Vendas"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome da posição *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Vendas 1, Vendas Norte, etc."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Vendedor vinculado</label>
              <Select value={userId || "none"} onValueChange={(v) => setUserId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {orgMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Quando o vendedor sair, basta trocar aqui.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!name.trim() || create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
