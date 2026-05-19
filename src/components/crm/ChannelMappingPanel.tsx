import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Search, Share2, ArrowRight } from "lucide-react";
import { useCRMChannelMappings, useCRMChannelMutations } from "@/hooks/use-crm-channels";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function ChannelMappingPanel() {
  const { data: mappings, isLoading } = useCRMChannelMappings();
  const { upsertMapping, deleteMapping } = useCRMChannelMutations();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sourceChannel, setSourceChannel] = useState("");
  const [targetChannel, setTargetChannel] = useState("");

  const { data: availableChannels } = useQuery({
    queryKey: ["crm-goals-channels"],
    queryFn: () => api<string[]>("/api/crm/goals/channels"),
  });

  const filteredMappings = mappings?.filter(m => 
    m.source_channel.toLowerCase().includes(search.toLowerCase()) ||
    m.target_channel.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    if (!sourceChannel.trim() || !targetChannel.trim()) return;
    upsertMapping.mutate({ source_channel: sourceChannel.trim(), target_channel: targetChannel.trim() }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setSourceChannel("");
        setTargetChannel("");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Mapeamento de Canais
          </CardTitle>
          <CardDescription>
            Vincule nomes de canais da planilha aos nomes oficiais do sistema
          </CardDescription>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Mapeamento
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar mapeamentos..." 
            className="pl-9" 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome na Planilha (Origem)</TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead>Nome no Sistema (Destino)</TableHead>
                <TableHead className="w-[80px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMappings?.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.source_channel}</TableCell>
                  <TableCell>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell>{m.target_channel}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMapping.mutate(m.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!filteredMappings || filteredMappings.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Nenhum mapeamento encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Mapeamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome na Planilha</Label>
                <Input 
                  placeholder="Ex: Canal-Vendas-01" 
                  value={sourceChannel}
                  onChange={e => setSourceChannel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Vincular ao Canal do Sistema</Label>
                <Select value={targetChannel} onValueChange={setTargetChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o canal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableChannels?.map(ch => (
                      <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                    ))}
                    <SelectItem value="custom">+ Novo Canal...</SelectItem>
                  </SelectContent>
                </Select>
                {targetChannel === "custom" && (
                  <Input 
                    placeholder="Digite o nome do novo canal" 
                    className="mt-2"
                    onChange={e => setTargetChannel(e.target.value)}
                  />
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={upsertMapping.isPending}>
                Salvar Mapeamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
