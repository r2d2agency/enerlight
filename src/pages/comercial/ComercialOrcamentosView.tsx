import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ComercialCustomer, ComercialMyPriceList, ComercialQuote, ComercialQuoteListItem, ComercialQuoteStatus } from '@/lib/comercial-api';
import { Loader2, Plus, FileText, Search, UserPlus } from 'lucide-react';

const statusConfig: Record<ComercialQuoteStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  em_elaboracao: { label: 'Em elaboração', variant: 'secondary' },
  enviado: { label: 'Enviado', variant: 'default' },
  visualizado: { label: 'Visualizado', variant: 'default' },
  em_negociacao: { label: 'Em negociação', variant: 'outline' },
  aguardando_aprovacao: { label: 'Aguardando aprovação', variant: 'destructive' },
  aprovado: { label: 'Aprovado', variant: 'default' },
  recusado: { label: 'Recusado', variant: 'destructive' },
  expirado: { label: 'Expirado', variant: 'secondary' },
  convertido: { label: 'Convertido em venda', variant: 'default' },
  cancelado: { label: 'Cancelado', variant: 'secondary' },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

interface Props {
  basePath: string;
  listQuotes: () => Promise<{ quotes: ComercialQuoteListItem[] }>;
  createQuote: (body: { customer_id: string; price_list_id?: string }) => Promise<{ quote: ComercialQuote }>;
  listCustomers: () => Promise<{ customers: ComercialCustomer[] }>;
  createCustomer: (body: Partial<ComercialCustomer>) => Promise<{ customer: ComercialCustomer }>;
  listMyPriceLists: () => Promise<{ price_lists: ComercialMyPriceList[] }>;
}

export default function ComercialOrcamentosView({ basePath, listQuotes, createQuote, listCustomers, createCustomer, listMyPriceLists }: Props) {
  const [quotes, setQuotes] = useState<ComercialQuoteListItem[]>([]);
  const [customers, setCustomers] = useState<ComercialCustomer[]>([]);
  const [priceLists, setPriceLists] = useState<ComercialMyPriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedPriceListId, setSelectedPriceListId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ company_name: '', cnpj: '', email: '', phone: '' });
  const [creating, setCreating] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    listQuotes()
      .then((res) => setQuotes(res.quotes))
      .catch((error) => toast({ title: 'Erro ao carregar orçamentos', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setSelectedCustomerId('');
    setCustomerSearch('');
    setSelectedPriceListId('');
    setDialogOpen(true);
    Promise.all([
      customers.length === 0 ? listCustomers() : Promise.resolve({ customers }),
      priceLists.length === 0 ? listMyPriceLists() : Promise.resolve({ price_lists: priceLists }),
    ]).then(([customerResponse, priceListResponse]) => {
      setCustomers(customerResponse.customers);
      setPriceLists(priceListResponse.price_lists);
      if (priceListResponse.price_lists.length === 1) setSelectedPriceListId(priceListResponse.price_lists[0].id);
      else setSelectedPriceListId(priceListResponse.price_lists.find((list) => list.is_default)?.id || '');
    }).catch(() => {});
  };

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) => [customer.company_name, customer.trade_name, customer.cnpj, customer.cpf, customer.email].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [customers, customerSearch]);

  const handleSaveCustomer = async () => {
    if (!newCustomer.company_name.trim()) {
      toast({ title: 'Informe o nome do cliente', variant: 'destructive' });
      return;
    }
    setSavingCustomer(true);
    try {
      const response = await createCustomer({ ...newCustomer, type: 'pj', status: 'active' });
      setCustomers((current) => [response.customer, ...current]);
      setSelectedCustomerId(response.customer.id);
      setNewCustomerOpen(false);
      setNewCustomer({ company_name: '', cnpj: '', email: '', phone: '' });
      toast({ title: 'Cliente cadastrado' });
    } catch (error) {
      toast({ title: 'Não foi possível cadastrar o cliente', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally { setSavingCustomer(false); }
  };

  const handleCreate = async () => {
    if (!selectedCustomerId) {
      toast({ title: 'Selecione um cliente', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await createQuote({ customer_id: selectedCustomerId, price_list_id: selectedPriceListId || undefined });
      setDialogOpen(false);
      navigate(`${basePath}/${res.quote.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar orçamento', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Crie e acompanhe suas propostas comerciais.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Novo orçamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo orçamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Pesquise por nome, CNPJ ou e-mail para iniciar o orçamento.</p>
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Nome, CNPJ ou e-mail" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} /></div>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>{filteredCustomers.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}{c.cnpj ? ` · ${c.cnpj}` : ''}</SelectItem>)}</SelectContent>
              </Select>
              {filteredCustomers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
              <Button type="button" variant="outline" className="w-full" onClick={() => setNewCustomerOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Cadastrar novo cliente</Button>
              {priceLists.length > 1 && <Select value={selectedPriceListId} onValueChange={setSelectedPriceListId}><SelectTrigger><SelectValue placeholder="Selecione a tabela de preço" /></SelectTrigger><SelectContent>{priceLists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}{list.is_default ? ' · padrão' : ''}</SelectItem>)}</SelectContent></Select>}
              {priceLists.length === 1 && <p className="text-xs text-muted-foreground">Tabela aplicada: {priceLists[0].name}</p>}
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Continuar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar cliente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Nome / razão social" value={newCustomer.company_name} onChange={(event) => setNewCustomer({ ...newCustomer, company_name: event.target.value })} />
              <Input placeholder="CNPJ" value={newCustomer.cnpj} onChange={(event) => setNewCustomer({ ...newCustomer, cnpj: event.target.value })} />
              <Input placeholder="E-mail" type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} />
              <Input placeholder="Telefone" value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} />
            </div>
            <DialogFooter><Button onClick={handleSaveCustomer} disabled={savingCustomer}>{savingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar cliente</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum orçamento criado ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`${basePath}/${q.id}`)}>
                    <TableCell className="font-medium">{q.quote_number || '—'}</TableCell>
                    <TableCell>{q.customer_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{q.actor_name || '—'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(q.total_value)}</TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[q.status]?.variant || 'secondary'}>{statusConfig[q.status]?.label || q.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(q.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export { statusConfig as quoteStatusConfig, formatCurrency };
