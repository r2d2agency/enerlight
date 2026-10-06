import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ComercialSale, ComercialSaleItem } from '@/lib/comercial-api';
import { Loader2, ArrowLeft, Lock } from 'lucide-react';

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('pt-BR');
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
};

const onlyDigits = (value?: string | null) => String(value || '').replace(/\D/g, '');

const formatDoc = (value?: string | null) => {
  const digits = onlyDigits(value);
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return value || '—';
};

const formatCep = (value?: string | null) => {
  const digits = onlyDigits(value);
  return digits.length === 8 ? digits.replace(/(\d{5})(\d{3})/, '$1-$2') : value || '—';
};

const formatPhone = (value?: string | null) => {
  const digits = onlyDigits(value);
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return value || '—';
};

/** Linha rótulo/valor: some quando não há dado, para não poluir o documento. */
const DataRow = ({ label, value }: { label: string; value?: string | number | null }) => {
  const empty = value === undefined || value === null || value === '';
  if (empty) return null;
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium break-words">{value}</span>
    </div>
  );
};

const customerAddress = (sale: ComercialSale) => {
  const line = [
    sale.customer_address,
    sale.customer_address_number ? `Nº ${sale.customer_address_number}` : null,
    sale.customer_address_complement,
  ].filter(Boolean).join(', ');
  const cityLine = [sale.customer_neighborhood, sale.customer_city, sale.customer_state].filter(Boolean).join(' · ');
  return {
    street: line || null,
    city: cityLine || null,
    zip: sale.customer_zip_code ? formatCep(sale.customer_zip_code) : null,
  };
};

const commissionLabel: Record<string, string> = {
  previsto: 'Prevista',
  liberado: 'Liberada',
  pago: 'Paga',
};

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

  const address = customerAddress(sale);
  const discount = Number(sale.discount_value) || 0;
  const freight = Number(sale.freight_value) || 0;
  const subtotal = Number(sale.subtotal_value) || 0;
  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(basePath)}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{sale.sale_number || 'Venda'}</h1>
          <p className="text-sm text-muted-foreground">{sale.customer_name || sale.client_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
            <Lock className="h-3 w-3" />
            Documento bloqueado
          </Badge>
          <Badge variant={sale.status === 'confirmed' ? 'default' : 'secondary'}>
            {sale.status === 'confirmed' ? 'Confirmada' : 'Cancelada'}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Venda já convertida a partir do orçamento — os dados são apenas para consulta e não podem ser alterados.
      </p>

      {/* Cliente */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-x-8 gap-y-0 md:grid-cols-2">
            <DataRow label="Razão social" value={sale.customer_name || sale.client_name} />
            <DataRow label="Tipo" value={sale.customer_type === 'pf' ? 'Pessoa Física' : sale.customer_type === 'pj' ? 'Pessoa Jurídica' : null} />
            <DataRow label={sale.customer_type === 'pf' ? 'CPF' : 'CNPJ'} value={formatDoc(sale.cnpj || sale.cpf || sale.client_document)} />
            <DataRow label="Inscrição estadual" value={sale.state_registration} />
            <DataRow label="Contato" value={sale.customer_contact_name} />
            <DataRow label="Cargo" value={sale.customer_contact_role} />
            <DataRow label="Telefone" value={sale.customer_phone ? formatPhone(sale.customer_phone) : null} />
            <DataRow label="WhatsApp" value={sale.customer_whatsapp ? formatPhone(sale.customer_whatsapp) : null} />
            <DataRow label="E-mail" value={sale.customer_email} />
            <DataRow label="Endereço" value={address.street} />
            <DataRow label="Bairro / Cidade / UF" value={address.city} />
            <DataRow label="CEP" value={address.zip} />
          </div>
          {!sale.customer_name && !address.street && (
            <p className="text-xs text-muted-foreground">
              O cliente não está vinculado a um cadastro — só os dados copiados do orçamento estão disponíveis.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vendedor */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Vendedor responsável</CardTitle></CardHeader>
        <CardContent className="grid gap-x-8 gap-y-0 text-sm md:grid-cols-2">
          <DataRow label="Nome" value={sale.actor_name} />
          <DataRow label="Perfil" value={sale.actor_profile ? sale.actor_profile.charAt(0).toUpperCase() + sale.actor_profile.slice(1) : null} />
          <DataRow label="E-mail" value={sale.actor_email} />
          <DataRow label="Telefone" value={sale.actor_phone ? formatPhone(sale.actor_phone) : null} />
          <DataRow label="Equipe" value={sale.actor_team_name} />
          <DataRow label="Tabela de preço" value={sale.price_list_name} />
          <DataRow label="Comissão" value={sale.commission_amount !== undefined && sale.commission_amount !== null ? `${formatCurrency(sale.commission_amount)}${sale.commission_percent ? ` (${Number(sale.commission_percent)}%)` : ''}${sale.commission_status ? ` · ${commissionLabel[sale.commission_status] || sale.commission_status}` : ''}` : null} />
        </CardContent>
      </Card>

      {/* Itens */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Unitário</TableHead>
                <TableHead className="text-right">Desc.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.product_name}</div>
                    {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                  </TableCell>
                  <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right">{Number(item.discount_percent) ? `${Number(item.discount_percent)}%` : '—'}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(item.total_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Totais, frete e pagamento */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Totais</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Soma dos itens</span><span>{formatCurrency(itemsTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{formatCurrency(discount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{formatCurrency(freight)}</span></div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold text-base"><span>Total da venda</span><span>{formatCurrency(sale.total_value)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Frete, pagamento e condições</CardTitle></CardHeader>
          <CardContent className="grid gap-x-8 gap-y-0 text-sm">
            <DataRow label="Tipo de frete" value={sale.shipping_type ? (sale.shipping_type === 'fob' ? 'FOB (destinatário)' : sale.shipping_type === 'cif' ? 'CIF (remetente)' : sale.shipping_type.toUpperCase()) : null} />
            <DataRow label="Valor do frete" value={sale.shipping_type || freight ? formatCurrency(freight) : null} />
            <DataRow label="Prazo de entrega" value={sale.delivery_time} />
            <DataRow label="Forma de pagamento" value={sale.quote_payment_method || sale.payment_method} />
            <DataRow label="Condições de pagamento" value={sale.payment_terms} />
            <DataRow label="Orçamento de origem" value={sale.quote_number} />
            <DataRow label="Data da venda" value={formatDate(sale.sale_date)} />
            <DataRow label="Registrada em" value={formatDateTime(sale.created_at)} />
          </CardContent>
        </Card>
      </div>

      {(sale.notes || sale.internal_notes) && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sale.notes && <p className="whitespace-pre-wrap">{sale.notes}</p>}
            {sale.internal_notes && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">Uso interno</p>
                <p className="mt-1 whitespace-pre-wrap">{sale.internal_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
