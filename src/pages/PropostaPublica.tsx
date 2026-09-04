import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { comercialPublicApi, ComercialQuote, ComercialQuoteItem } from '@/lib/comercial-api';
import { generateQuotePDF } from '@/lib/pdf-generator';
import { Loader2, FileWarning, Download, Briefcase } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const statusLabel: Record<string, string> = {
  enviado: 'Enviado',
  visualizado: 'Visualizado',
  em_negociacao: 'Em negociação',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  expirado: 'Expirado',
  convertido: 'Convertido em venda',
};

export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<ComercialQuote | null>(null);
  const [items, setItems] = useState<ComercialQuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    comercialPublicApi.getProposal(token)
      .then((res) => {
        setQuote(res.quote);
        setItems(res.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Proposta não encontrada'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleDownloadPdf = () => {
    if (!quote) return;
    generateQuotePDF(
      {
        id: quote.id,
        client_name: quote.client_name,
        client_document: quote.client_document,
        client_email: quote.client_email,
        client_phone: quote.client_phone,
        valid_until: quote.valid_until,
        payment_terms: quote.payment_terms,
        shipping_type: 'cif',
        shipping_value: quote.freight_value,
        notes: quote.notes,
        total_value: quote.total_value,
        include_images: true,
        items: items.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_type: 'percentage',
          discount_value: i.discount_percent,
          total_price: i.total_price,
          image_url: i.image_url,
        })),
      },
      { name: quote.organization_name, logo_url: quote.organization_logo_url }
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3 text-center px-4">
        <FileWarning className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">{error || 'Proposta não encontrada ou link inválido.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {quote.organization_logo_url ? (
              <img src={quote.organization_logo_url} alt={quote.organization_name} className="h-10 w-10 rounded object-contain bg-white" />
            ) : (
              <div className="gradient-primary p-2 rounded-full">
                <Briefcase className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
            <div>
              <p className="font-semibold">{quote.organization_name}</p>
              <p className="text-xs text-muted-foreground">{quote.quote_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusLabel[quote.status] && <Badge>{statusLabel[quote.status]}</Badge>}
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-1" />
              Baixar PDF
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Proposta para {quote.client_name}</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {quote.client_document && <p>Documento: {quote.client_document}</p>}
            {quote.client_email && <p>Email: {quote.client_email}</p>}
            {quote.payment_terms && <p>Condição de pagamento: {quote.payment_terms}</p>}
            {quote.delivery_time && <p>Prazo de entrega: {quote.delivery_time}</p>}
            {quote.valid_until && <p>Validade: {new Date(quote.valid_until).toLocaleDateString('pt-BR')}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Unitário</TableHead>
                  <TableHead className="text-right">Desc.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.product_name}
                      {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                    <TableCell className="text-right">{item.discount_percent}%</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.total_price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(quote.subtotal_value)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{formatCurrency(quote.discount_value)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{formatCurrency(quote.freight_value)}</span></div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{formatCurrency(quote.total_value)}</span></div>
          </CardContent>
        </Card>

        {quote.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Observações</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.notes}</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
