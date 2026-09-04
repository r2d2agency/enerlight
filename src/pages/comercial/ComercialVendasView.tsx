import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ComercialSaleListItem } from '@/lib/comercial-api';
import { Loader2, ShoppingCart } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

interface Props {
  basePath: string;
  listSales: () => Promise<{ sales: ComercialSaleListItem[] }>;
}

export default function ComercialVendasView({ basePath, listSales }: Props) {
  const [sales, setSales] = useState<ComercialSaleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    listSales()
      .then((res) => setSales(res.sales))
      .catch((error) => toast({ title: 'Erro ao carregar vendas', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Vendas</h1>
        <p className="text-sm text-muted-foreground">Orçamentos convertidos em venda.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhuma venda registrada ainda.</p>
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
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`${basePath}/${s.id}`)}>
                    <TableCell className="font-medium">{s.sale_number || '—'}</TableCell>
                    <TableCell>{s.customer_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.actor_name || '—'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(s.total_value)}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === 'confirmed' ? 'default' : 'secondary'}>{s.status === 'confirmed' ? 'Confirmada' : 'Cancelada'}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(s.sale_date).toLocaleDateString('pt-BR')}</TableCell>
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
