import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, List, Settings, Loader2, Trash2, ShieldCheck, FileSpreadsheet, Edit2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePriceLists, useOnlineQuoteMutations, usePermissionTemplates } from "@/hooks/use-online-quotes";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PriceListItemsDialog } from "@/components/crm/PriceListItemsDialog";

export default function RepresentativeConfig() {
  const { user } = useAuth();
  const { data: priceLists, isLoading: loadingPriceLists } = usePriceLists();
  const { data: permissionTemplates } = usePermissionTemplates();
  const { savePriceList, deletePriceList } = useOnlineQuoteMutations();

  const [isPriceListDialogOpen, setIsPriceListDialogOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<any>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [itemsPriceList, setItemsPriceList] = useState<any>(null);

  useEffect(() => {
    if (editingPriceList) {
      setSelectedTemplates(editingPriceList.allowed_templates || []);
    } else {
      setSelectedTemplates([]);
    }
  }, [editingPriceList]);

  const handleSavePriceList = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    const data = {
      id: editingPriceList?.id,
      name: formData.get('name'),
      description: formData.get('description'),
      is_active: formData.get('is_active') === 'on',
      allowed_templates: selectedTemplates,
      is_master: formData.get('is_master') === 'on',
      markup_percentage: parseFloat(formData.get('markup_percentage') as string || '0')
    };

    try {
      await savePriceList.mutateAsync(data);
      setIsPriceListDialogOpen(false);
      setEditingPriceList(null);
    } catch (err) {
      toast.error("Erro ao salvar tabela");
    }
  };

  const handleDeletePriceList = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir a tabela "${name}"?`)) {
      try {
        await deletePriceList.mutateAsync(id);
      } catch (err) {}
    }
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Configuração de Representantes</h1>
            <p className="text-muted-foreground">
              Gerencie tabelas de preços e permissões de acesso.
            </p>
          </div>
        </div>

        <Tabs defaultValue="price-lists" className="w-full">
          <TabsList>
            <TabsTrigger value="price-lists" className="flex items-center gap-2">
              <List className="h-4 w-4" /> Tabelas de Preços
            </TabsTrigger>
          </TabsList>

          <TabsContent value="price-lists" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Tabelas de Preços</CardTitle>
                  <CardDescription>Configure as tabelas que serão usadas pelos representantes.</CardDescription>
                </div>
                <Button onClick={() => {
                  setEditingPriceList(null);
                  setIsPriceListDialogOpen(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" /> Nova Tabela
                </Button>
              </CardHeader>
              <CardContent>
                {loadingPriceLists ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Segmento</TableHead>
                        <TableHead>Permissões</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceLists?.map((pl) => (
                        <TableRow key={pl.id}>
                          <TableCell className="font-medium">{pl.name}</TableCell>
                          <TableCell>{pl.segment || '-'}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {pl.allowed_templates?.map(tid => {
                                const template = permissionTemplates?.find(t => t.id === tid);
                                return template ? (
                                  <Badge key={tid} variant="outline" className="text-[10px]">
                                    {template.name}
                                  </Badge>
                                ) : null;
                              })}
                              {(!pl.allowed_templates || pl.allowed_templates.length === 0 || pl.allowed_templates.includes('')) && (
                                <Badge variant="secondary" className="text-[10px]">Acesso Global</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={pl.is_active ? "default" : "secondary"}>
                              {pl.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setItemsPriceList(pl)}>
                                <List className="h-4 w-4 mr-2" /> Itens
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => {
                                setEditingPriceList(pl);
                                setIsPriceListDialogOpen(true);
                              }}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeletePriceList(pl.id, pl.name)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isPriceListDialogOpen} onOpenChange={setIsPriceListDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingPriceList ? 'Editar Tabela' : 'Nova Tabela'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSavePriceList}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome da Tabela</Label>
                  <Input id="name" name="name" defaultValue={editingPriceList?.name} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" name="description" defaultValue={editingPriceList?.description} />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch id="is_active" name="is_active" defaultChecked={editingPriceList ? editingPriceList.is_active : true} />
                    <Label htmlFor="is_active">Ativa</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="is_master" name="is_master" defaultChecked={editingPriceList?.is_master} />
                    <Label htmlFor="is_master">Tabela Master (Preços Base)</Label>
                  </div>
                </div>
                {!editingPriceList?.is_master && (
                   <div className="grid gap-2">
                    <Label htmlFor="markup_percentage">Markup / Acréscimo (%)</Label>
                    <Input id="markup_percentage" name="markup_percentage" type="number" step="0.01" defaultValue={editingPriceList?.markup_percentage || 0} />
                    <p className="text-[10px] text-muted-foreground">Este percentual será somado ao preço da tabela master ao importar/visualizar.</p>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Grupos com Acesso (Permission Templates)</Label>
                  <div className="flex flex-wrap gap-2 border p-3 rounded-md min-h-[100px]">
                    {permissionTemplates?.map((template) => (
                      <div 
                        key={template.id}
                        onClick={() => {
                          if (selectedTemplates.includes(template.id)) {
                            setSelectedTemplates(selectedTemplates.filter(id => id !== template.id));
                          } else {
                            setSelectedTemplates([...selectedTemplates, template.id]);
                          }
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all border ${
                          selectedTemplates.includes(template.id) 
                          ? 'bg-primary text-primary-foreground border-primary' 
                          : 'bg-secondary hover:border-primary/50'
                        }`}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {template.name}
                      </div>
                    ))}
                    {(!permissionTemplates || permissionTemplates.length === 0) && (
                      <p className="text-xs text-muted-foreground">Nenhum template de permissão encontrado.</p>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Se nenhum grupo for selecionado, a tabela será visível para todos.</p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPriceListDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">Salvar Tabela</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {itemsPriceList && (
          <PriceListItemsDialog 
            priceList={itemsPriceList} 
            onOpenChange={(open) => !open && setItemsPriceList(null)} 
          />
        )}
      </div>
    </MainLayout>
  );
}
