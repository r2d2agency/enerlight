import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { comercialPublicApi, ComercialQuote, ComercialQuoteItem } from '@/lib/comercial-api';
import { generateQuotePDF } from '@/lib/pdf-generator';
import { resolveMediaUrl } from '@/lib/media';
import SignatureCanvas from 'react-signature-canvas';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileWarning, Download, Briefcase, CheckCircle2, PenLine } from 'lucide-react';

const ACCEPTABLE_STATUSES = ['enviado', 'visualizado', 'em_negociacao'];

// Data/hora, IP e navegador ficam a cargo do backend; só a geolocalização depende
// do navegador do cliente. Ela é opcional: se ele negar a permissão seguimos sem ela.
const captureGeolocation = () =>
  new Promise<string | null>((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });

function AcceptanceDialog({ token, open, onOpenChange, onAccepted }: { token: string; open: boolean; onOpenChange: (open: boolean) => void; onAccepted: () => void }) {
  const { toast } = useToast();
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [geolocation, setGeolocation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capturedAt] = useState(() => new Date());
  const userAgent = navigator.userAgent;

  // A geolocalização só é pedida quando o popup abre, junto do gesto do usuário —
  // pedir no carregamento da página seria negado pelo navegador.
  useEffect(() => {
    if (!open) return;
    setGeolocation(null);
    let cancelled = false;
    captureGeolocation().then((value) => { if (!cancelled) setGeolocation(value); });
    return () => { cancelled = true; };
  }, [open]);

  const handleConfirm = async () => {
    if (!name.trim() || !document.trim()) {
      toast({ title: 'Informe nome e documento', description: 'São obrigatórios para registrar o aceite.', variant: 'destructive' });
      return;
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast({ title: 'Assine no campo indicado', description: 'Desenhe sua assinatura para confirmar o aceite.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await comercialPublicApi.acceptProposal(token, {
        accepted_by_name: name.trim(),
        accepted_by_document: document.trim(),
        accepted_by_email: email.trim(),
        signature_data: sigRef.current.toDataURL('image/png'),
        geolocation,
      });
      toast({ title: 'Proposta aceita', description: 'Em breve nossa equipe entrará em contato.' });
      onAccepted();
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Não foi possível registrar o aceite', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aceitar proposta</DialogTitle>
          <DialogDescription>
            Preencha seus dados e assine para confirmar o aceite desta proposta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="accept-name">Nome completo</Label>
            <Input id="accept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="accept-doc">CPF/CNPJ</Label>
            <Input id="accept-doc" value={document} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="accept-email">E-mail (opcional)</Label>
            <Input id="accept-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          </div>
          <div className="space-y-1">
            <Label>Assinatura</Label>
            <div className="border rounded-md bg-white">
              <SignatureCanvas ref={sigRef} canvasProps={{ className: 'w-full h-40' }} penColor="black" />
            </div>
            <div className="flex justify-between items-center mt-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => sigRef.current?.clear()}>Limpar</Button>
              <span className="text-[11px] text-muted-foreground">Desenhe usando dedo, mouse ou caneta</span>
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-[11px] text-muted-foreground space-y-0.5">
            <p>Data e hora: {capturedAt.toLocaleString('pt-BR')}</p>
            <p>Navegador: {userAgent}</p>
            <p>Localização: {geolocation || 'não informada'}</p>
            <p>O IP e os demais dados de acesso são registrados no servidor.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Aceito a proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [acceptOpen, setAcceptOpen] = useState(false);

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

  const handleAccepted = () => {
    // A resposta do aceite é a venda gerada, não o orçamento — por isso a proposta
    // é recarregada para refletir o status "aceito pelo cliente".
    comercialPublicApi.getProposal(token)
      .then((res) => { setQuote(res.quote); setItems(res.items); })
      .catch(() => {});
  };

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
        shipping_type: quote.shipping_type || 'cif',
        shipping_value: quote.freight_value,
        notes: quote.notes,
        total_value: quote.total_value,
        template: quote.template
          ? {
              ...quote.template,
              cover_url: resolveMediaUrl(quote.template.cover_url),
              logo_url: resolveMediaUrl(quote.template.logo_url),
            }
          : undefined,
        template_cover: resolveMediaUrl(quote.template_cover),
        primary_color: quote.primary_color,
        accent_color: quote.accent_color,
        text_color: quote.text_color,
        legal_text: quote.legal_text,
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
      { name: quote.organization_name, logo_url: resolveMediaUrl(quote.organization_logo_url) }
    ).catch((error) => {
      console.error('[PDF] Falha ao gerar proposta pública:', error);
      toast({
        title: 'Erro ao gerar PDF',
        description: error instanceof Error ? error.message : 'Não foi possível gerar o PDF.',
        variant: 'destructive',
        duration: 15000,
      });
    });
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
            {quote.acceptance_status === 'accepted' ? (
              <Badge className="bg-green-600 hover:bg-green-700">Aceito pelo cliente</Badge>
            ) : (
              statusLabel[quote.status] && <Badge>{statusLabel[quote.status]}</Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-1" />
              Baixar PDF
            </Button>
            {ACCEPTABLE_STATUSES.includes(quote.status) && (
              <Button size="sm" onClick={() => setAcceptOpen(true)}>
                <PenLine className="h-4 w-4 mr-1" />
                Aceito a proposta
              </Button>
            )}
          </div>
        </div>

        {quote.acceptance_status === 'accepted' && (
          <Card className="border-green-600/40 bg-green-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-green-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Proposta aceita
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              {quote.accepted_by_name && <p>Aceite de {quote.accepted_by_name}{quote.accepted_by_document ? ` · ${quote.accepted_by_document}` : ''}</p>}
              {quote.accepted_at && <p>Em {new Date(quote.accepted_at).toLocaleString('pt-BR')}</p>}
              {quote.acceptance_geolocation && <p>Localização: {quote.acceptance_geolocation}</p>}
              {quote.acceptance_ip && <p>IP: {quote.acceptance_ip}</p>}
              {quote.acceptance_user_agent && <p className="break-all">Navegador: {quote.acceptance_user_agent}</p>}
              {quote.acceptance_signature && (
                <div>
                  <p className="mb-1">Assinatura:</p>
                  <img src={quote.acceptance_signature} alt="Assinatura do cliente" className="border rounded bg-white max-h-24" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

        <AcceptanceDialog token={token} open={acceptOpen} onOpenChange={setAcceptOpen} onAccepted={handleAccepted} />
      </div>
    </div>
  );
}
