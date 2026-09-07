import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { comercialAdminApi, ComercialAuditLog } from '@/lib/comercial-api';
import { Loader2, History } from 'lucide-react';

const ACTION_LABEL: Record<string, string> = {
  actor_linked: 'Usuário interno vinculado',
  actor_invited: 'Representante/parceiro convidado',
  actor_blocked: 'Acesso bloqueado',
  actor_unblocked: 'Acesso desbloqueado',
  actor_price_lists_updated: 'Tabelas de preço do usuário atualizadas',
  price_list_item_set: 'Produto adicionado/atualizado em tabela de preço',
  price_list_item_updated: 'Preço de item atualizado',
  customer_transferred: 'Cliente transferido',
  quote_discount_approved: 'Desconto de orçamento aprovado',
  quote_discount_rejected: 'Desconto de orçamento recusado',
  sale_created: 'Venda registrada',
  commission_status_changed: 'Status de comissão alterado',
};

export default function AdminComercialAuditTab() {
  const [logs, setLogs] = useState<ComercialAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    comercialAdminApi.listAuditLogs()
      .then((res) => setLogs(res.logs))
      .catch((error) => toast({ title: 'Erro ao carregar auditoria', description: error?.message, variant: 'destructive' }))
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
    <Card>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma atividade registrada ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ação</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{ACTION_LABEL[log.action] || log.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.actor_name || log.user_name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.ip_address || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(log.created_at).toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
