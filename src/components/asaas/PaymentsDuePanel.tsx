import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Calendar, AlertTriangle, Clock, ChevronRight, ExternalLink, Phone, Mail, RefreshCw } from "lucide-react";
import { useAsaas } from "@/hooks/use-asaas";
import { format, isToday, isTomorrow, addDays, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface PaymentsDuePanelProps {
  organizationId: string;
}

interface Payment {
  id: string;
  asaas_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  value: number;
  due_date: string;
  billing_type: string;
  status: string;
  payment_link: string;
  invoice_url: string;
  bank_slip_url: string;
}

type TabType = 'today' | 'tomorrow' | 'week' | 'overdue';

export function PaymentsDuePanel({ organizationId }: PaymentsDuePanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const { getPayments } = useAsaas(organizationId);

  const loadPayments = async () => {
    setLoading(true);
    try {
      // Load all pending/overdue payments
      const [pending, overdue] = await Promise.all([
        getPayments({ status: 'PENDING' }),
        getPayments({ status: 'OVERDUE' })
      ]);
      setPayments([...pending, ...overdue]);
    } catch (err) {
      console.error('Error loading payments:', err);
      toast.error("Erro ao carregar boletos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [organizationId]);

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);

  const groupedPayments = {
    today: payments.filter(p => {
      const dueDate = parseISO(p.due_date);
      return isToday(dueDate) && p.status === 'PENDING';
    }),
    tomorrow: payments.filter(p => {
      const dueDate = parseISO(p.due_date);
      return isTomorrow(dueDate) && p.status === 'PENDING';
    }),
    week: payments.filter(p => {
      const dueDate = parseISO(p.due_date);
      const daysUntil = differenceInDays(dueDate, today);
      return daysUntil >= 2 && daysUntil <= 7 && p.status === 'PENDING';
    }),
    overdue: payments.filter(p => p.status === 'OVERDUE').sort((a, b) => {
      return parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
    })
  };

  const totals = {
    today: groupedPayments.today.reduce((sum, p) => sum + p.value, 0),
    tomorrow: groupedPayments.tomorrow.reduce((sum, p) => sum + p.value, 0),
    week: groupedPayments.week.reduce((sum, p) => sum + p.value, 0),
    overdue: groupedPayments.overdue.reduce((sum, p) => sum + p.value, 0)
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const getDaysOverdue = (dueDate: string) => {
    const days = differenceInDays(today, parseISO(dueDate));
    return days;
  };

  const renderPaymentTable = (paymentList: Payment[], showDaysOverdue = false) => {
    if (paymentList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mb-4 opacity-50" />
          <p>Nenhum boleto encontrado</p>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Vencimento</TableHead>
              {showDaysOverdue && <TableHead>Atraso</TableHead>}
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentList.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium max-w-[200px] truncate">
                  {payment.customer_name}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {payment.customer_phone && (
                      <a 
                        href={`https://wa.me/${payment.customer_phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {formatPhone(payment.customer_phone)}
                      </a>
                    )}
                    {payment.customer_email && (
                      <a 
                        href={`mailto:${payment.customer_email}`}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {payment.customer_email}
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {format(parseISO(payment.due_date), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                </TableCell>
                {showDaysOverdue && (
                  <TableCell>
                    <Badge variant="destructive" className="text-xs">
                      {getDaysOverdue(payment.due_date)} dias
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="text-right font-semibold">
                  {formatCurrency(payment.value)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {payment.invoice_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(payment.invoice_url, '_blank')}
                        title="Ver fatura"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {payment.payment_link && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          navigator.clipboard.writeText(payment.payment_link);
                          toast.success("Link copiado!");
                        }}
                        title="Copiar link de pagamento"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    );
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Boletos por Vencimento
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadPayments}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="today" className="relative">
              <Clock className="h-4 w-4 mr-1" />
              Hoje
              {groupedPayments.today.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {groupedPayments.today.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tomorrow">
              Amanhã
              {groupedPayments.tomorrow.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {groupedPayments.tomorrow.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="week">
              Próx. 7 dias
              {groupedPayments.week.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {groupedPayments.week.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="overdue" className="text-destructive">
              <AlertTriangle className="h-4 w-4 mr-1" />
              Vencidos
              {groupedPayments.overdue.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                  {groupedPayments.overdue.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div 
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeTab === 'today' ? 'bg-primary/10 border-primary' : 'bg-muted/50'}`}
              onClick={() => setActiveTab('today')}
            >
              <p className="text-xs text-muted-foreground">Hoje</p>
              <p className="text-lg font-bold">{formatCurrency(totals.today)}</p>
              <p className="text-xs text-muted-foreground">{groupedPayments.today.length} boletos</p>
            </div>
            <div 
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeTab === 'tomorrow' ? 'bg-primary/10 border-primary' : 'bg-muted/50'}`}
              onClick={() => setActiveTab('tomorrow')}
            >
              <p className="text-xs text-muted-foreground">Amanhã</p>
              <p className="text-lg font-bold">{formatCurrency(totals.tomorrow)}</p>
              <p className="text-xs text-muted-foreground">{groupedPayments.tomorrow.length} boletos</p>
            </div>
            <div 
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeTab === 'week' ? 'bg-primary/10 border-primary' : 'bg-muted/50'}`}
              onClick={() => setActiveTab('week')}
            >
              <p className="text-xs text-muted-foreground">Próx. 7 dias</p>
              <p className="text-lg font-bold">{formatCurrency(totals.week)}</p>
              <p className="text-xs text-muted-foreground">{groupedPayments.week.length} boletos</p>
            </div>
            <div 
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeTab === 'overdue' ? 'bg-destructive/10 border-destructive' : 'bg-muted/50'}`}
              onClick={() => setActiveTab('overdue')}
            >
              <p className="text-xs text-destructive">Vencidos</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totals.overdue)}</p>
              <p className="text-xs text-muted-foreground">{groupedPayments.overdue.length} boletos</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <TabsContent value="today" className="mt-0">
                {renderPaymentTable(groupedPayments.today)}
              </TabsContent>
              <TabsContent value="tomorrow" className="mt-0">
                {renderPaymentTable(groupedPayments.tomorrow)}
              </TabsContent>
              <TabsContent value="week" className="mt-0">
                {renderPaymentTable(groupedPayments.week)}
              </TabsContent>
              <TabsContent value="overdue" className="mt-0">
                {renderPaymentTable(groupedPayments.overdue, true)}
              </TabsContent>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
