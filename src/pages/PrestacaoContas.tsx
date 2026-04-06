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
import { Checkbox } from "@/components/ui/checkbox";
import { useExpenses, EXPENSE_CATEGORIES, PAYMENT_TYPES, ExpenseReport, ExpenseItem } from "@/hooks/use-expenses";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Send, Check, X, DollarSign, FileText, Users, Trash2, Receipt, Package, FolderPlus } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("items");
  const {
    reports, ungroupedItems, groupSummary,
    createItem, deleteItem, groupItems,
    submitReport, approveReport, rejectReport, payReport, deleteReport
  } = useExpenses(statusFilter ? { status: statusFilter } : undefined);

  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showDetail, setShowDetail] = useState<ExpenseReport | null>(null);
  const [showReject, setShowReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDesc, setGroupDesc] = useState("");

  // Create item form
  const [itemCategory, setItemCategory] = useState("combustivel");
  const [itemDesc, setItemDesc] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemDate, setItemDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [itemTime, setItemTime] = useState("");
  const [itemPaymentType, setItemPaymentType] = useState("");
  const [itemLocation, setItemLocation] = useState("");
  const [itemEstablishment, setItemEstablishment] = useState("");
  const [itemCnpj, setItemCnpj] = useState("");

  const resetItemForm = () => {
    setItemCategory("combustivel");
    setItemDesc("");
    setItemAmount("");
    setItemDate(format(new Date(), "yyyy-MM-dd"));
    setItemTime("");
    setItemPaymentType("");
    setItemLocation("");
    setItemEstablishment("");
    setItemCnpj("");
  };

  const handleCreateItem = async () => {
    if (!itemAmount || Number(itemAmount) <= 0) return;
    try {
      await createItem.mutateAsync({
        category: itemCategory,
        description: itemDesc,
        amount: Number(itemAmount),
        expense_date: itemDate,
        expense_time: itemTime || undefined,
        payment_type: itemPaymentType || undefined,
        location: itemLocation || undefined,
        establishment: itemEstablishment || undefined,
        cnpj: itemCnpj || undefined,
      });
      toast({ title: "Despesa lançada com sucesso" });
      setShowCreateItem(false);
      resetItemForm();
    } catch (err: any) {
      toast({ title: "Erro ao lançar", description: err.message, variant: "destructive" });
    }
  };

  const handleGroupItems = async () => {
    if (!groupTitle.trim() || !selectedItems.length) return;
    try {
      await groupItems.mutateAsync({ title: groupTitle, description: groupDesc, item_ids: selectedItems });
      toast({ title: "Relatório criado com os itens selecionados" });
      setShowGroupDialog(false);
      setSelectedItems([]);
      setGroupTitle("");
      setGroupDesc("");
    } catch (err: any) {
      toast({ title: "Erro ao agrupar", description: err.message, variant: "destructive" });
    }
  };

  const toggleItem = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    const items = ungroupedItems.data || [];
    if (selectedItems.length === items.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map(i => i.id));
    }
  };

  const handleAction = async (action: string, id: string) => {
    try {
      switch (action) {
        case 'submit': await submitReport.mutateAsync(id); toast({ title: "Enviado para aprovação" }); break;
        case 'approve': await approveReport.mutateAsync(id); toast({ title: "Aprovado" }); break;
        case 'reject': setShowReject(id); return;
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
  const ungroupedTotal = ungroupedItems.data?.reduce((s, i) => s + Number(i.amount), 0) || 0;

  const catLabel = (cat: string) => EXPENSE_CATEGORIES.find(c => c.value === cat);
  const payLabel = (pay: string) => PAYMENT_TYPES.find(p => p.value === pay);

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Não Agrupados</span>
              </div>
              <p className="text-2xl font-bold mt-1">R$ {ungroupedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">{ungroupedItems.data?.length || 0} itens</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total Relatórios</span>
              </div>
              <p className="text-2xl font-bold mt-1">R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Pendente</span>
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
              <TabsTrigger value="items">
                <Receipt className="h-4 w-4 mr-1" />
                Despesas ({ungroupedItems.data?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="reports">
                <FileText className="h-4 w-4 mr-1" />
                Relatórios
              </TabsTrigger>
              <TabsTrigger value="groups">
                <Users className="h-4 w-4 mr-1" />
                Por Grupo
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              {activeTab === 'items' && selectedItems.length > 0 && (
                <Button variant="secondary" onClick={() => setShowGroupDialog(true)}>
                  <FolderPlus className="h-4 w-4 mr-1" /> Agrupar ({selectedItems.length})
                </Button>
              )}
              {activeTab === 'reports' && (
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
              )}
              {activeTab === 'items' && (
                <Button onClick={() => setShowCreateItem(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Lançar Despesa
                </Button>
              )}
            </div>
          </div>

          {/* ITEMS TAB - Item-first */}
          <TabsContent value="items" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={ungroupedItems.data?.length ? selectedItems.length === ungroupedItems.data.length : false}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Estabelecimento</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ungroupedItems.data?.map(item => {
                      const cat = catLabel(item.category);
                      const pay = item.payment_type ? payLabel(item.payment_type) : null;
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedItems.includes(item.id)}
                              onCheckedChange={() => toggleItem(item.id)}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{cat?.icon} {cat?.label || item.category}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.description || '-'}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{item.establishment || '-'}</TableCell>
                          <TableCell>{pay?.label || item.payment_type || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(item.expense_date), 'dd/MM/yyyy')}
                            {item.expense_time && <span className="text-muted-foreground text-xs ml-1">{item.expense_time.slice(0,5)}</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono whitespace-nowrap">
                            R$ {Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-sm">{item.user_name}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => deleteItem.mutateAsync(item.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!ungroupedItems.data?.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Nenhuma despesa avulsa. Clique em "Lançar Despesa" para registrar.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {(ungroupedItems.data?.length || 0) > 0 && (
                  <div className="p-3 border-t flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      {selectedItems.length > 0 ? `${selectedItems.length} selecionado(s)` : `${ungroupedItems.data?.length} item(ns)`}
                    </span>
                    <span className="font-mono font-semibold">
                      Total: R$ {ungroupedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* REPORTS TAB */}
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
                          Nenhum relatório. Selecione despesas e agrupe-as.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* GROUPS TAB */}
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
                    <div className="text-xs text-muted-foreground">{g.item_count} item(ns)</div>
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

      {/* Create Item Dialog */}
      <Dialog open={showCreateItem} onOpenChange={setShowCreateItem}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar Despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={itemAmount} onChange={e => setItemAmount(e.target.value)} placeholder="0,00" />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="Detalhe do gasto" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={itemDate} onChange={e => setItemDate(e.target.value)} />
              </div>
              <div>
                <Label>Hora</Label>
                <Input type="time" value={itemTime} onChange={e => setItemTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Tipo de Pagamento</Label>
              <Select value={itemPaymentType} onValueChange={setItemPaymentType}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estabelecimento</Label>
              <Input value={itemEstablishment} onChange={e => setItemEstablishment(e.target.value)} placeholder="Nome do estabelecimento" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Local</Label>
                <Input value={itemLocation} onChange={e => setItemLocation(e.target.value)} placeholder="Cidade/Local" />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={itemCnpj} onChange={e => setItemCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateItem(false)}>Cancelar</Button>
            <Button onClick={handleCreateItem} disabled={createItem.isPending}>Lançar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Items Dialog */}
      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agrupar em Relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedItems.length} item(ns) selecionado(s) — Total: R$ {(ungroupedItems.data?.filter(i => selectedItems.includes(i.id)).reduce((s, i) => s + Number(i.amount), 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <div>
              <Label>Título do Relatório</Label>
              <Input value={groupTitle} onChange={e => setGroupTitle(e.target.value)} placeholder="Ex: Viagem São Paulo - Abril" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={groupDesc} onChange={e => setGroupDesc(e.target.value)} placeholder="Detalhes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGroupDialog(false)}>Cancelar</Button>
            <Button onClick={handleGroupItems} disabled={groupItems.isPending}>Criar Relatório</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Detail Dialog */}
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

                <ExpenseItemsTable reportId={showDetail.id} />

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

// Sub-component: items table for report detail
function ExpenseItemsTable({ reportId }: { reportId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['expense', reportId],
    queryFn: () => api<ExpenseReport>(`/api/expenses/${reportId}`),
    enabled: !!reportId,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando itens...</p>;

  const items = data?.items || [];
  const catLabel = (cat: string) => EXPENSE_CATEGORIES.find(c => c.value === cat);
  const payLabel = (pay: string) => PAYMENT_TYPES.find(p => p.value === pay);

  return (
    <div>
      <Label className="text-base font-semibold mb-2 block">Itens ({items.length})</Label>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Estabelecimento</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => {
            const cat = catLabel(item.category);
            const pay = item.payment_type ? payLabel(item.payment_type) : null;
            return (
              <TableRow key={item.id}>
                <TableCell>{cat?.icon} {cat?.label || item.category}</TableCell>
                <TableCell>{item.description || '-'}</TableCell>
                <TableCell>{item.establishment || '-'}</TableCell>
                <TableCell>{pay?.label || item.payment_type || '-'}</TableCell>
                <TableCell>
                  {format(new Date(item.expense_date), 'dd/MM/yyyy')}
                  {item.expense_time && <span className="text-muted-foreground text-xs ml-1">{item.expense_time.slice(0,5)}</span>}
                </TableCell>
                <TableCell className="text-right font-mono">R$ {Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
              </TableRow>
            );
          })}
          {!items.length && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum item</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
