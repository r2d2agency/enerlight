import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ComercialCatalogProduct, ComercialMyPriceList } from '@/lib/comercial-api';
import { Loader2, Package, Tag } from 'lucide-react';

interface Props {
  listCatalog: () => Promise<{ products: ComercialCatalogProduct[] }>;
  listMyPriceLists: () => Promise<{ price_lists: ComercialMyPriceList[] }>;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

export default function ComercialCatalogoView({ listCatalog, listMyPriceLists }: Props) {
  const [products, setProducts] = useState<ComercialCatalogProduct[]>([]);
  const [priceLists, setPriceLists] = useState<ComercialMyPriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([listCatalog(), listMyPriceLists()])
      .then(([p, pl]) => {
        setProducts(p.products);
        setPriceLists(pl.price_lists);
      })
      .catch((error) => toast({ title: 'Erro ao carregar catálogo', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Catálogo</h1>
        <p className="text-sm text-muted-foreground">Produtos disponíveis e suas tabelas de preço autorizadas.</p>
      </div>

      {priceLists.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Tag className="h-4 w-4" /> Suas tabelas de preço</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {priceLists.map((pl) => (
              <Badge key={pl.id} variant={pl.is_default ? 'default' : 'secondary'}>
                {pl.name}{pl.is_default ? ' (padrão)' : ''}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum produto cadastrado ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tabela</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">{p.sku || '—'}</TableCell>
                    <TableCell className="font-medium">
                      {p.name}
                      {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[p.category, p.subcategory].filter(Boolean).join(' / ') || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.price_list_name || '—'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(p.base_price)}</TableCell>
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
