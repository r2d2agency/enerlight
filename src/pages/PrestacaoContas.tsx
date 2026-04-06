import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExpenses, EXPENSE_CATEGORIES, ExpenseReport } from "@/hooks/use-expenses";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send, Check, X, DollarSign, FileText, Users, Trash2, Receipt } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  rejected: "bg-destructive/10 text-destructive",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  submitted: "Enviado",
  approved: "Aprovado",
  rejected: "Rejeitado",
  paid: "Pago",
};

export default function PrestacaoContas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [activeTab, setActiveTab] = useState("reports");
  const { reports, groupSummary, createReport, addItem, deleteItem, submitReport, approveReport, rejectReport, payReport, deleteReport } = useExpenses(
    statusFilter ? { status: statusFilter } : undefined
  );

  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<ExpenseReport | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showReject, setShowReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Create form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newItems, setNewItems] = useState<Array<{ category: string; description: string; amount: string; expense_date: string }>>([
    { category: "combustivel", description: "", amount: "", expense_date: format(new Date(), "yyyy-MM-dd") },
  ]);

  // Add item form
  const [itemCategory, setItemCategory] = useState("combustivel");
  const [itemDesc, setItemDesc] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemDate, setItemDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const validItems = newItems.filter(i => i.amount && Number(i.amount) > 0);
    try {
      await createReport.mutateAsync({
        title: newTitle,
        description: newDesc,
        items: validItems.map(i => ({
          category: i.category,
          description: i.description,
          amount: Number(i.amount),
          expense_date: i.expense_date,
        })),
      });
      toast({ title: "Relatório criado com sucesso" });
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setNewItems([{ category: "combustivel", description: "", amount: "", expense_date: format(new Date(), "yyyy-MM-dd") }]);
    } catch (err: any) {
      toast({ title: "Erro ao criar", description: err.message, variant: "destructive" });
    }
  };

  const handleAddItem = async () => {
    if (!showDetail || !itemAmount) return;
    try {
      await addItem.mutateAsync({
        reportId: showDetail.id,
        item: { category: itemCategory, description: itemDesc, amount: Number(itemAmount), expense_date: itemDate },
      });
      toast({ title: "Item adicionado" });
      setShowAddItem(false);
      setItemDesc("");
      setItemAmount("");
      // Refresh detail
      const updated = reports.data?.find(r => r.id === showDetail.id);
      if (updated) setShowDetail({ ...updated });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleAction = async (action: string, id: string) => {
    try {
      switch (action) {
        case 'submit': await submitReport.mutateAsync(id); toast({ title: "Enviado para aprovação" }); break;
        case 'approve': await approveReport.mutateAsync(id); toast({ title: "Aprovado" }); break;
        case 'reject':
          setShowReject(id);
          return;
        case 'pay': await payReport.mutateAsync(id); toast({ title: "Marcado como pago" }); break;
        case 'delete': await deleteReport.mutateAsync(id); toast({ title: "Excluído" }); break;
      }
      setShowDetail(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleReject = async () => {
    if (!showReject) return;
    try {
      await rejectReport.mutateAsync({ id: showReject, reason: rejectReason });
      toast({ title: "Rejeitado" });
      setShowReject(null);
      setRejectReason("");
      setShowDetail(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const totalGeral = reports.data?.reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const totalPending = reports.data?.filter(r => r.status === 'submitted').reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const totalApproved = reports.data?.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.total_amount), 0) || 0;
  const totalPaid = reports.data?.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.total_amount), 0) || 0;

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Geral</span>
              </div>
              <p className="text-2xl font-bold mt-1">R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Pendente Aprovação</span>
              </div>
              <p className="text-2xl font-bold mt-1">R$ {totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Aprovado</span>
              </div>
              <p className="text-2xl font-bold mt-1">R$ {totalApproved.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Pago</span>
              </div>
              <p className="text-2xl font-bold mt-1">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <TabsList>
              <TabsTrigger value="reports">
                <Receipt className="h-4 w-4 mr-1" />
                Relatórios
              </TabsTrigger>
              <TabsTrigger value="groups">
                <Users className="h-4 w-4 mr-1" />
                Por Grupo
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="submitted">Enviado</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" /> Novo Relatório
              </Button>
            </div>
          </div>

          <TabsContent value="reports" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Itens</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.data?.map(r => (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setShowDetail(r)}>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell>{r.user_name}</TableCell>
                        <TableCell>{r.group_name || '-'}</TableCell>
                        <TableCell>{r.item_count}</TableCell>
                        <TableCell className="text-right font-mono">
                          R$ {Number(r.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[r.status]}>{statusLabels[r.status]}</Badge>
                        </TableCell>
                        <TableCell>{format(new Date(r.created_at), 'dd/MM/yyyy')}</TableCell>
                      </TableRow>
                    ))}
                    {!reports.data?.length && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhum relatório encontrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="groups" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupSummary.data?.map(g => (
                <Card key={g.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{g.group_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-mono font-semibold">R$ {Number(g.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pendente</span>
                      <span className="font-mono text-yellow-600">R$ {Number(g.pending).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Aprovado</span>
                      <span className="font-mono text-blue-600">R$ {Number(g.approved).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pago</span>
                      <span className="font-mono text-green-600">R$ {Number(g.paid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{g.report_count} relatório(s)</div>
                  </CardContent>
                </Card>
              ))}
              {!groupSummary.data?.length && (
                <p className="text-muted-foreground col-span-full text-center py-8">Nenhum grupo com despesas</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Report Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Relatório de Despesas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ex: Viagem São Paulo - Março" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Detalhes da viagem/despesa" />
            </div>
            <div>
              <Label className="text-base font-semibold">Itens de Despesa</Label>
              {newItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mt-2 items-end">
                  <div className="col-span-3">
                    <Label className="text-xs">Categoria</Label>
                    <Select value={item.category} onValueChange={v => {
                      const copy = [...newItems]; copy[idx].category = v; setNewItems(copy);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Descrição</Label>
                    <Input value={item.description} onChange={e => {
                      const copy = [...newItems]; copy[idx].description = e.target.value; setNewItems(copy);
                    }} placeholder="Detalhe" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input type="number" step="0.01" value={item.amount} onChange={e => {
                      const copy = [...newItems]; copy[idx].amount = e.target.value; setNewItems(copy);
                    }} placeholder="0,00" />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Data</Label>
                    <Input type="date" value={item.expense_date} onChange={e => {
                      const copy = [...newItems]; copy[idx].expense_date = e.target.value; setNewItems(copy);
                    }} />
                  </div>
                  <div className="col-span-1">
                    <Button variant="ghost" size="icon" onClick={() => setNewItems(newItems.filter((_, i) => i !== idx))} disabled={newItems.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setNewItems([...newItems, { category: "combustivel", description: "", amount: "", expense_date: format(new Date(), "yyyy-MM-dd") }])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar Item
              </Button>
            </div>
            <div className="text-right font-semibold">
              Total: R$ {newItems.reduce((s, i) => s + (Number(i.amount) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createReport.isPending}>Criar Relatório</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {showDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {showDetail.title}
                  <Badge className={statusColors[showDetail.status]}>{statusLabels[showDetail.status]}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Usuário:</span> {showDetail.user_name}</div>
                  <div><span className="text-muted-foreground">Grupo:</span> {showDetail.group_name || '-'}</div>
                  <div><span className="text-muted-foreground">Criado em:</span> {format(new Date(showDetail.created_at), 'dd/MM/yyyy HH:mm')}</div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">R$ {Number(showDetail.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                </div>
                {showDetail.description && <p className="text-sm text-muted-foreground">{showDetail.description}</p>}
                {showDetail.rejection_reason && (
                  <div className="bg-destructive/10 rounded p-3 text-sm">
                    <strong>Motivo da rejeição:</strong> {showDetail.rejection_reason}
                  </div>
                )}

                {/* Items table - fetched inline */}
                <ExpenseItemsTable reportId={showDetail.id} status={showDetail.status} onAddItem={() => setShowAddItem(true)} />

                <DialogFooter className="flex-wrap gap-2">
                  {showDetail.status === 'draft' && (
                    <>
                      <Button variant="destructive" size="sm" onClick={() => handleAction('delete', showDetail.id)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Excluir
                      </Button>
                      <Button size="sm" onClick={() => handleAction('submit', showDetail.id)}>
                        <Send className="h-4 w-4 mr-1" /> Enviar para Aprovação
                      </Button>
                    </>
                  )}
                  {showDetail.status === 'submitted' && (
                    <>
                      <Button variant="destructive" size="sm" onClick={() => handleAction('reject', showDetail.id)}>
                        <X className="h-4 w-4 mr-1" /> Rejeitar
                      </Button>
                      <Button size="sm" onClick={() => handleAction('approve', showDetail.id)}>
                        <Check className="h-4 w-4 mr-1" /> Aprovar
                      </Button>
                    </>
                  )}
                  {showDetail.status === 'approved' && (
                    <Button size="sm" onClick={() => handleAction('pay', showDetail.id)}>
                      <DollarSign className="h-4 w-4 mr-1" /> Marcar como Pago
                    </Button>
                  )}
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Categoria</Label>
              <Select value={itemCategory} onValueChange={setItemCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={itemDesc} onChange={e => setItemDesc(e.target.value)} />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={itemAmount} onChange={e => setItemAmount(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <Input type="date" value={itemDate} onChange={e => setItemDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItem(false)}>Cancelar</Button>
            <Button onClick={handleAddItem}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={!!showReject} onOpenChange={() => setShowReject(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar Relatório</DialogTitle></DialogHeader>
          <div>
            <Label>Motivo da rejeição</Label>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Informe o motivo..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

// Sub-component: items table with fetch
function ExpenseItemsTable({ reportId, status, onAddItem }: { reportId: string; status: string; onAddItem: () => void }) {
  const { deleteItem } = useExpenses();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['expense', reportId],
    queryFn: () => api<ExpenseReport>(`/api/expenses/${reportId}`),
    enabled: !!reportId,
  });

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteItem.mutateAsync(itemId);
      toast({ title: "Item removido" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando itens...</p>;

  const items = data?.items || [];
  const catLabel = (cat: string) => EXPENSE_CATEGORIES.find(c => c.value === cat);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-base font-semibold">Itens ({items.length})</Label>
        {status === 'draft' && (
          <Button variant="outline" size="sm" onClick={onAddItem}>
            <Plus className="h-3 w-3 mr-1" /> Adicionar
          </Button>
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            {status === 'draft' && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => {
            const cat = catLabel(item.category);
            return (
              <TableRow key={item.id}>
                <TableCell>{cat?.icon} {cat?.label || item.category}</TableCell>
                <TableCell>{item.description || '-'}</TableCell>
                <TableCell>{format(new Date(item.expense_date), 'dd/MM/yyyy')}</TableCell>
                <TableCell className="text-right font-mono">R$ {Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                {status === 'draft' && (
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {!items.length && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum item</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
