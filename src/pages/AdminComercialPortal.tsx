import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  comercialAdminApi, ComercialAdminActor, ComercialTeam, ComercialProfile,
  ComercialAdminProduct, ComercialActorPriceListEntry, ComercialTransferRequest, ComercialQuoteApproval,
  ComercialAdminPriceList, ComercialPriceListItem,
} from '@/lib/comercial-api';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import {
  Loader2, Plus, Briefcase, Send, Lock, Unlock, UserPlus, Users2, Package, Tag, ArrowRightLeft, Check, X,
  ShieldAlert, Upload, Trash2, List,
} from 'lucide-react';

interface OrgMember { id: string; name: string; email: string; is_active: boolean }

const emptyProductForm = {
  sku: '', name: '', description: '', category: '', subcategory: '', unit: 'un',
  cost_price: '', base_price: '',
};

interface ImportRow { sku: string; sale_price: number; cost_price?: number }

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  blocked: { label: 'Bloqueado', variant: 'destructive' },
};

const profileLabel: Record<ComercialProfile, string> = {
  admin: 'Administrador',
  gerente: 'Gerente Comercial',
  vendedor: 'Vendedor',
  parceiro: 'Parceiro Comercial',
};

export default function AdminComercialPortal() {
  const { userPermissions, user } = useAuth();
  const canManage = user?.is_superadmin || ['owner', 'admin'].includes(user?.role || '') || userPermissions?.can_manage_comercial_portal;

  const [actors, setActors] = useState<ComercialAdminActor[]>([]);
  const [teams, setTeams] = useState<ComercialTeam[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [products, setProducts] = useState<ComercialAdminProduct[]>([]);
  const [transferRequests, setTransferRequests] = useState<ComercialTransferRequest[]>([]);
  const [quoteApprovals, setQuoteApprovals] = useState<ComercialQuoteApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [priceListDialogActor, setPriceListDialogActor] = useState<ComercialAdminActor | null>(null);
  const [actorPriceLists, setActorPriceLists] = useState<ComercialActorPriceListEntry[]>([]);
  const [selectedPriceListIds, setSelectedPriceListIds] = useState<Set<string>>(new Set());
  const [defaultPriceListId, setDefaultPriceListId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [linkForm, setLinkForm] = useState<{ user_id: string; profile: ComercialProfile }>({ user_id: '', profile: 'vendedor' });
  const [inviteForm, setInviteForm] = useState<{ name: string; email: string; phone: string; profile: ComercialProfile }>({
    name: '', email: '', phone: '', profile: 'parceiro',
  });
  const [teamForm, setTeamForm] = useState({ name: '' });
  const [editingProduct, setEditingProduct] = useState<ComercialAdminProduct | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm);

  const [priceLists, setPriceLists] = useState<ComercialAdminPriceList[]>([]);
  const [newPriceListDialogOpen, setNewPriceListDialogOpen] = useState(false);
  const [newPriceListForm, setNewPriceListForm] = useState({ name: '', description: '' });
  const [managingPriceList, setManagingPriceList] = useState<ComercialAdminPriceList | null>(null);
  const [priceListItems, setPriceListItems] = useState<ComercialPriceListItem[]>([]);
  const [loadingPriceListItems, setLoadingPriceListItems] = useState(false);
  const [addItemForm, setAddItemForm] = useState({ product_id: '', sale_price: '', cost_price: '' });
  const [importPreview, setImportPreview] = useState<Array<ImportRow & { found: boolean; product_name?: string }>>([]);
  const [importing, setImporting] = useState(false);

  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      comercialAdminApi.listActors(),
      comercialAdminApi.listTeams(),
      api<OrgMember[]>('/api/crm/org-members'),
      comercialAdminApi.listProducts(),
      comercialAdminApi.listTransferRequests(),
      comercialAdminApi.listQuoteApprovals(),
      comercialAdminApi.listPriceLists(),
    ])
      .then(([actorsRes, teamsRes, members, productsRes, transfersRes, approvalsRes, priceListsRes]) => {
        setActors(actorsRes.actors);
        setTeams(teamsRes.teams);
        setOrgMembers(members);
        setProducts(productsRes.products);
        setTransferRequests(transfersRes.transfer_requests);
        setQuoteApprovals(approvalsRes.approvals);
        setPriceLists(priceListsRes.price_lists);
      })
      .catch((error) => toast({ title: 'Erro ao carregar Portal Comercial', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canManage) load();
    else setLoading(false);
  }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canManage) {
    return (
      <MainLayout>
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Você não tem permissão para acessar o Portal Comercial.
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const linkedUserIds = new Set(actors.filter((a) => a.user_id).map((a) => a.user_id));
  const availableMembers = orgMembers.filter((m) => m.is_active && !linkedUserIds.has(m.id));

  const handleLinkInternal = async () => {
    if (!linkForm.user_id) {
      toast({ title: 'Selecione um usuário', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.linkInternal(linkForm);
      toast({ title: 'Acesso liberado', description: 'O usuário já pode acessar o Portal Comercial com a conta atual.' });
      setLinkForm({ user_id: '', profile: 'vendedor' });
      setLinkDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao vincular usuário', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleInviteExternal = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      toast({ title: 'Nome e email são obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.inviteExternal(inviteForm);
      toast({ title: 'Convite enviado', description: 'Um email de ativação foi enviado.' });
      setInviteForm({ name: '', email: '', phone: '', profile: 'parceiro' });
      setInviteDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao convidar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamForm.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.createTeam(teamForm);
      toast({ title: 'Equipe criada' });
      setTeamForm({ name: '' });
      setTeamDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar equipe', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvite = async (actor: ComercialAdminActor) => {
    setActionLoadingId(actor.id);
    try {
      await comercialAdminApi.resendInvite(actor.id);
      toast({ title: 'Convite reenviado' });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao reenviar convite', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleBlock = async (actor: ComercialAdminActor) => {
    setActionLoadingId(actor.id);
    try {
      if (actor.status === 'blocked') {
        await comercialAdminApi.unblock(actor.id);
        toast({ title: 'Acesso liberado' });
      } else {
        await comercialAdminApi.block(actor.id);
        toast({ title: 'Acesso bloqueado' });
      }
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar status', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleActorTeamChange = async (actor: ComercialAdminActor, teamId: string) => {
    setActionLoadingId(actor.id);
    try {
      await comercialAdminApi.updateActor(actor.id, { team_id: teamId === 'none' ? null : teamId });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar equipe', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const openCreateProduct = () => {
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductDialogOpen(true);
  };

  const openEditProduct = (p: ComercialAdminProduct) => {
    setEditingProduct(p);
    setProductForm({
      sku: p.sku || '', name: p.name, description: p.description || '', category: p.category || '',
      subcategory: p.subcategory || '', unit: p.unit, cost_price: String(p.cost_price ?? ''), base_price: String(p.base_price ?? ''),
    });
    setProductDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!productForm.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...productForm,
        cost_price: productForm.cost_price ? Number(productForm.cost_price) : 0,
        base_price: productForm.base_price ? Number(productForm.base_price) : 0,
      };
      if (editingProduct) {
        await comercialAdminApi.updateProduct(editingProduct.id, body);
        toast({ title: 'Produto atualizado' });
      } else {
        await comercialAdminApi.createProduct(body);
        toast({ title: 'Produto cadastrado' });
      }
      setProductDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao salvar produto', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProductStatus = async (p: ComercialAdminProduct) => {
    setActionLoadingId(p.id);
    try {
      await comercialAdminApi.updateProduct(p.id, { status: p.status === 'active' ? 'inactive' : 'active' });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar produto', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const openPriceListDialog = async (actor: ComercialAdminActor) => {
    setPriceListDialogActor(actor);
    try {
      const res = await comercialAdminApi.getActorPriceLists(actor.id);
      setActorPriceLists(res.price_lists);
      setSelectedPriceListIds(new Set(res.price_lists.filter((pl) => pl.granted).map((pl) => pl.id)));
      setDefaultPriceListId(res.price_lists.find((pl) => pl.is_default)?.id || null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao carregar tabelas de preço', description: message, variant: 'destructive' });
      setPriceListDialogActor(null);
    }
  };

  const togglePriceListSelection = (id: string, checked: boolean) => {
    setSelectedPriceListIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
    if (!checked && defaultPriceListId === id) setDefaultPriceListId(null);
  };

  const handleSavePriceLists = async () => {
    if (!priceListDialogActor) return;
    setSaving(true);
    try {
      await comercialAdminApi.setActorPriceLists(priceListDialogActor.id, {
        price_list_ids: Array.from(selectedPriceListIds),
        default_price_list_id: defaultPriceListId,
      });
      toast({ title: 'Tabelas de preço atualizadas' });
      setPriceListDialogActor(null);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao salvar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResolveTransfer = async (tr: ComercialTransferRequest, approve: boolean) => {
    setActionLoadingId(tr.id);
    try {
      if (approve) {
        await comercialAdminApi.approveTransferRequest(tr.id);
        toast({ title: 'Transferência aprovada' });
      } else {
        await comercialAdminApi.rejectTransferRequest(tr.id);
        toast({ title: 'Transferência recusada' });
      }
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao processar solicitação', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolveQuoteApproval = async (approval: ComercialQuoteApproval, approve: boolean) => {
    setActionLoadingId(approval.id);
    try {
      if (approve) {
        await comercialAdminApi.approveQuote(approval.id);
        toast({ title: 'Orçamento aprovado e enviado ao cliente' });
      } else {
        await comercialAdminApi.rejectQuote(approval.id);
        toast({ title: 'Orçamento recusado, voltou para elaboração' });
      }
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao processar aprovação', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreatePriceList = async () => {
    if (!newPriceListForm.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.createPriceList(newPriceListForm);
      toast({ title: 'Tabela de preço criada' });
      setNewPriceListForm({ name: '', description: '' });
      setNewPriceListDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar tabela', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openManagePriceList = async (pl: ComercialAdminPriceList) => {
    setManagingPriceList(pl);
    setAddItemForm({ product_id: '', sale_price: '', cost_price: '' });
    setImportPreview([]);
    setLoadingPriceListItems(true);
    try {
      const res = await comercialAdminApi.listPriceListItems(pl.id);
      setPriceListItems(res.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao carregar itens', description: message, variant: 'destructive' });
    } finally {
      setLoadingPriceListItems(false);
    }
  };

  const handleAddPriceListItem = async () => {
    if (!managingPriceList) return;
    if (!addItemForm.product_id || !addItemForm.sale_price) {
      toast({ title: 'Produto e preço são obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.addPriceListItem(managingPriceList.id, {
        product_id: addItemForm.product_id,
        sale_price: Number(addItemForm.sale_price),
        cost_price: addItemForm.cost_price ? Number(addItemForm.cost_price) : undefined,
      });
      setAddItemForm({ product_id: '', sale_price: '', cost_price: '' });
      openManagePriceList(managingPriceList);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao adicionar produto', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePriceListItem = async (itemId: string) => {
    if (!managingPriceList) return;
    try {
      await comercialAdminApi.deletePriceListItem(managingPriceList.id, itemId);
      openManagePriceList(managingPriceList);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao remover item', description: message, variant: 'destructive' });
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false });

        const knownSkus = new Set(products.map((p) => p.sku).filter(Boolean));
        const productBySku = new Map(products.map((p) => [p.sku, p]));

        const parsed = rows.map((row) => {
          const entries = Object.entries(row);
          const findCol = (aliases: string[]) => {
            const hit = entries.find(([h]) => aliases.some((a) => h.toLowerCase().trim().includes(a)));
            return hit ? String(hit[1]) : '';
          };
          const sku = findCol(['sku', 'codigo', 'código']).trim();
          const salePriceRaw = findCol(['preço', 'preco', 'valor', 'price']);
          const costPriceRaw = findCol(['custo', 'cost']);
          const salePrice = Number(String(salePriceRaw).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
          const costPrice = costPriceRaw ? Number(String(costPriceRaw).replace(/[^\d,.-]/g, '').replace(',', '.')) || undefined : undefined;
          return {
            sku, sale_price: salePrice, cost_price: costPrice,
            found: knownSkus.has(sku), product_name: productBySku.get(sku)?.name,
          };
        }).filter((r) => r.sku);

        setImportPreview(parsed);
      } catch (error) {
        toast({ title: 'Erro ao ler planilha', description: 'Verifique se o arquivo é um XLSX/CSV válido.', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!managingPriceList || importPreview.length === 0) return;
    setImporting(true);
    try {
      const res = await comercialAdminApi.importPriceListItems(
        managingPriceList.id,
        importPreview.filter((r) => r.found).map((r) => ({ sku: r.sku, sale_price: r.sale_price, cost_price: r.cost_price }))
      );
      toast({
        title: `${res.imported_count} produto(s) importado(s)`,
        description: res.not_found.length > 0 ? `${res.not_found.length} SKU(s) não encontrado(s) no catálogo.` : undefined,
      });
      setImportPreview([]);
      openManagePriceList(managingPriceList);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao importar', description: message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-3 mb-6">
        <Briefcase className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Portal Comercial</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie usuários, equipes e permissões do módulo comercial.
          </p>
        </div>
      </div>

      <Tabs defaultValue="atores">
        <TabsList>
          <TabsTrigger value="atores">Usuários</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="tabelas-preco">Tabelas de Preço</TabsTrigger>
          <TabsTrigger value="transferencias">
            Transferências{transferRequests.length > 0 ? ` (${transferRequests.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="aprovacoes">
            Aprovações de Desconto{quoteApprovals.length > 0 ? ` (${quoteApprovals.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="atores" className="space-y-4 mt-4">
          <div className="flex justify-end gap-2 flex-wrap">
            <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="h-4 w-4 mr-1" />
                  Vincular usuário interno
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vincular usuário interno</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    O usuário continua logando com a mesma conta do CRM — sem senha nova.
                  </p>
                  <div className="space-y-1">
                    <Label>Usuário *</Label>
                    <Select value={linkForm.user_id} onValueChange={(v) => setLinkForm({ ...linkForm, user_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                      <SelectContent>
                        {availableMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name} ({m.email})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Perfil</Label>
                    <Select value={linkForm.profile} onValueChange={(v) => setLinkForm({ ...linkForm, profile: v as ComercialProfile })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(profileLabel) as ComercialProfile[]).map((p) => (
                          <SelectItem key={p} value={p}>{profileLabel[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleLinkInternal} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Liberar acesso
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Convidar representante/parceiro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar representante/parceiro</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Nome *</Label>
                    <Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email *</Label>
                    <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone</Label>
                    <Input value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Perfil</Label>
                    <Select value={inviteForm.profile} onValueChange={(v) => setInviteForm({ ...inviteForm, profile: v as ComercialProfile })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vendedor">{profileLabel.vendedor}</SelectItem>
                        <SelectItem value="parceiro">{profileLabel.parceiro}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Um email com o link de ativação será enviado automaticamente.
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={handleInviteExternal} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Cadastrar e convidar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : actors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum usuário do Portal Comercial ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actors.map((actor) => {
                      const cfg = statusConfig[actor.status] || statusConfig.pending;
                      const isBusy = actionLoadingId === actor.id;
                      return (
                        <TableRow key={actor.id}>
                          <TableCell className="font-medium">{actor.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{actor.email}</TableCell>
                          <TableCell className="text-sm">{profileLabel[actor.profile] || actor.profile}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {actor.user_id ? 'Interno (login CRM)' : 'Externo'}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={actor.team_id || 'none'}
                              onValueChange={(v) => handleActorTeamChange(actor, v)}
                              disabled={isBusy}
                            >
                              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem equipe</SelectItem>
                                {teams.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="sm" onClick={() => openPriceListDialog(actor)}>
                              <Tag className="h-4 w-4 mr-1" />
                              Tabelas de preço
                            </Button>
                            {!actor.user_id && actor.status === 'pending' && (
                              <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleResendInvite(actor)}>
                                <Send className="h-4 w-4 mr-1" />
                                Reenviar convite
                              </Button>
                            )}
                            {actor.status !== 'pending' && (
                              <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleToggleBlock(actor)}>
                                {actor.status === 'blocked' ? (
                                  <><Unlock className="h-4 w-4 mr-1" />Desbloquear</>
                                ) : (
                                  <><Lock className="h-4 w-4 mr-1" />Bloquear</>
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipes" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova equipe
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova equipe</DialogTitle>
                </DialogHeader>
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input value={teamForm.name} onChange={(e) => setTeamForm({ name: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateTeam} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Criar equipe
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : teams.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma equipe cadastrada ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Membros</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teams.map((team) => (
                      <TableRow key={team.id}>
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{team.members_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="produtos" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateProduct}>
                  <Plus className="h-4 w-4 mr-1" />
                  Novo produto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? 'Editar produto' : 'Novo produto'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>SKU</Label>
                      <Input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Unidade</Label>
                      <Input value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Nome *</Label>
                    <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Descrição</Label>
                    <Textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Categoria</Label>
                      <Input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Subcategoria</Label>
                      <Input value={productForm.subcategory} onChange={(e) => setProductForm({ ...productForm, subcategory: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Custo</Label>
                      <Input type="number" step="0.01" value={productForm.cost_price} onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Preço base</Label>
                      <Input type="number" step="0.01" value={productForm.base_price} onChange={(e) => setProductForm({ ...productForm, base_price: e.target.value })} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSaveProduct} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    {editingProduct ? 'Salvar alterações' : 'Cadastrar produto'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum produto cadastrado ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Preço base</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEditProduct(p)}>
                        <TableCell className="text-sm text-muted-foreground">{p.sku || '—'}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{[p.category, p.subcategory].filter(Boolean).join(' / ') || '—'}</TableCell>
                        <TableCell className="text-right">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.base_price) || 0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{p.status === 'active' ? 'Ativo' : 'Inativo'}</Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" disabled={actionLoadingId === p.id} onClick={() => handleToggleProductStatus(p)}>
                            {p.status === 'active' ? 'Inativar' : 'Ativar'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tabelas-preco" className="space-y-4 mt-4">
          <div className="flex justify-between items-start gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground max-w-lg">
              Cada tabela pode ter os mesmos produtos do catálogo com preços diferentes.
              Crie uma tabela, adicione os produtos com o preço daquela tabela (ou importe
              uma planilha com SKU e preço) e depois vincule a tabela aos vendedores/representantes na aba Usuários.
            </p>
            <Dialog open={newPriceListDialogOpen} onOpenChange={setNewPriceListDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova tabela
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova tabela de preço</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Nome *</Label>
                    <Input value={newPriceListForm.name} onChange={(e) => setNewPriceListForm({ ...newPriceListForm, name: e.target.value })} placeholder="Ex: Tabela Revenda SP" />
                  </div>
                  <div className="space-y-1">
                    <Label>Descrição</Label>
                    <Input value={newPriceListForm.description} onChange={(e) => setNewPriceListForm({ ...newPriceListForm, description: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreatePriceList} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Criar tabela
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : priceLists.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma tabela de preço cadastrada ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Produtos</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceLists.map((pl) => (
                      <TableRow key={pl.id}>
                        <TableCell className="font-medium">{pl.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{pl.description || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{pl.items_count}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openManagePriceList(pl)}>
                            <List className="h-4 w-4 mr-1" />
                            Gerenciar produtos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transferencias" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : transferRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ArrowRightLeft className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma solicitação de transferência pendente.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Solicitado por</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transferRequests.map((tr) => {
                      const isBusy = actionLoadingId === tr.id;
                      return (
                        <TableRow key={tr.id}>
                          <TableCell className="font-medium">{tr.customer_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{tr.requested_by_name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{tr.target_actor_name || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{tr.note || '—'}</TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="sm" disabled={isBusy || !tr.target_actor_id} onClick={() => handleResolveTransfer(tr, true)}>
                              <Check className="h-4 w-4 mr-1" />
                              Aprovar
                            </Button>
                            <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleResolveTransfer(tr, false)}>
                              <X className="h-4 w-4 mr-1" />
                              Recusar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aprovacoes" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : quoteApprovals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum orçamento aguardando aprovação de desconto.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orçamento</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Desconto solicitado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quoteApprovals.map((qa) => {
                      const isBusy = actionLoadingId === qa.id;
                      return (
                        <TableRow key={qa.id}>
                          <TableCell className="font-medium">{qa.quote_number || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{qa.customer_name || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{qa.actor_name || '—'}</TableCell>
                          <TableCell className="text-right">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(qa.total_value) || 0)}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="text-destructive font-medium">{qa.requested_discount_percent}%</span>
                            <span className="text-muted-foreground"> (limite: {qa.max_allowed_percent}%)</span>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleResolveQuoteApproval(qa, true)}>
                              <Check className="h-4 w-4 mr-1" />
                              Aprovar
                            </Button>
                            <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleResolveQuoteApproval(qa, false)}>
                              <X className="h-4 w-4 mr-1" />
                              Recusar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!managingPriceList} onOpenChange={(open) => !open && setManagingPriceList(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Produtos — {managingPriceList?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-end gap-2 flex-wrap border rounded-md p-3">
              <div className="space-y-1 flex-1 min-w-[180px]">
                <Label className="text-xs">Produto</Label>
                <Select value={addItemForm.product_id} onValueChange={(v) => setAddItemForm({ ...addItemForm, product_id: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                  <SelectContent>
                    {products.filter((p) => p.sku).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 w-28">
                <Label className="text-xs">Preço nesta tabela</Label>
                <Input className="h-9" type="number" step="0.01" value={addItemForm.sale_price} onChange={(e) => setAddItemForm({ ...addItemForm, sale_price: e.target.value })} />
              </div>
              <div className="space-y-1 w-24">
                <Label className="text-xs">Custo</Label>
                <Input className="h-9" type="number" step="0.01" value={addItemForm.cost_price} onChange={(e) => setAddItemForm({ ...addItemForm, cost_price: e.target.value })} />
              </div>
              <Button size="sm" onClick={handleAddPriceListItem} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Adicionar
              </Button>
            </div>

            {loadingPriceListItems ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : priceListItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto nesta tabela ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceListItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.product_name}
                        {item.product_code && <span className="text-xs text-muted-foreground ml-1">({item.product_code})</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.sale_price) || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDeletePriceListItem(item.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Importar planilha (SKU + Preço)</Label>
                <label>
                  <Button variant="outline" size="sm" asChild>
                    <span><Upload className="h-4 w-4 mr-1" />Selecionar arquivo</span>
                  </Button>
                  <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
                </label>
              </div>
              {importPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="max-h-48 overflow-y-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">Preço</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-sm">{row.sku}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.product_name || '—'}</TableCell>
                            <TableCell className="text-right text-sm">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(row.sale_price)}
                            </TableCell>
                            <TableCell>
                              {row.found ? (
                                <Badge variant="default">encontrado</Badge>
                              ) : (
                                <Badge variant="destructive">SKU não cadastrado</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {importPreview.filter((r) => r.found).length} de {importPreview.length} serão importados
                      (produtos não cadastrados no catálogo são ignorados).
                    </p>
                    <Button size="sm" onClick={handleConfirmImport} disabled={importing || importPreview.every((r) => !r.found)}>
                      {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      Confirmar importação
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!priceListDialogActor} onOpenChange={(open) => !open && setPriceListDialogActor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tabelas de preço — {priceListDialogActor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {actorPriceLists.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tabela de preço ativa na organização.</p>
            ) : (
              actorPriceLists.map((pl) => {
                const checked = selectedPriceListIds.has(pl.id);
                return (
                  <div key={pl.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={checked} onCheckedChange={(c) => togglePriceListSelection(pl.id, !!c)} />
                      <span className="text-sm">{pl.name}</span>
                    </div>
                    {checked && (
                      <Button
                        variant={defaultPriceListId === pl.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDefaultPriceListId(pl.id)}
                      >
                        {defaultPriceListId === pl.id ? 'Padrão' : 'Definir como padrão'}
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSavePriceLists} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
