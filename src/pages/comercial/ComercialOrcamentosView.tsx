import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ComercialCustomer, ComercialQuote, ComercialQuoteListItem, ComercialQuoteStatus } from '@/lib/comercial-api';
import { Loader2, Plus, FileText } from 'lucide-react';

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
  createQuote: (body: { customer_id: string }) => Promise<{ quote: ComercialQuote }>;
  listCustomers: () => Promise<{ customers: ComercialCustomer[] }>;
}

export default function ComercialOrcamentosView({ basePath, listQuotes, createQuote, listCustomers }: Props) {
  const [quotes, setQuotes] = useState<ComercialQuoteListItem[]>([]);
  const [customers, setCustomers] = useState<ComercialCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [creating, setCreating] = useState(false);
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
    setDialogOpen(true);
    if (customers.length === 0) {
      listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
    }
  };

  const handleCreate = async () => {
    if (!selectedCustomerId) {
      toast({ title: 'Selecione um cliente', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await createQuote({ customer_id: selectedCustomerId });
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
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Selecione o cliente para iniciar o orçamento.</p>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Continuar
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
