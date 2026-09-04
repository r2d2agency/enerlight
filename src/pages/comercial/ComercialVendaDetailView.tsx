import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ComercialSale, ComercialSaleItem } from '@/lib/comercial-api';
import { Loader2, ArrowLeft } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

interface Props {
  basePath: string;
  getSale: (id: string) => Promise<{ sale: ComercialSale; items: ComercialSaleItem[] }>;
}

export default function ComercialVendaDetailView({ basePath, getSale }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sale, setSale] = useState<ComercialSale | null>(null);
  const [items, setItems] = useState<ComercialSaleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getSale(id)
      .then((res) => { setSale(res.sale); setItems(res.items); })
      .catch((error) => toast({ title: 'Erro ao carregar venda', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !sale) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(basePath)}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{sale.sale_number || 'Venda'}</h1>
          <p className="text-sm text-muted-foreground">{sale.client_name}</p>
        </div>
        <Badge variant={sale.status === 'confirmed' ? 'default' : 'secondary'}>{sale.status === 'confirmed' ? 'Confirmada' : 'Cancelada'}</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Unitário</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product_name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(item.total_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Totais</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(sale.subtotal_value)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{formatCurrency(sale.discount_value)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{formatCurrency(sale.freight_value)}</span></div>
          <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{formatCurrency(sale.total_value)}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
