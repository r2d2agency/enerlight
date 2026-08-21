import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wallet, ClipboardList } from "lucide-react";

export default function RepCommissions() {
  const { data: commissions, isLoading } = useQuery({
    queryKey: ["rep-commissions"],
    queryFn: () => api<any[]>("/api/representatives/commissions")
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pago': return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">Pago</Badge>;
      case 'pendente': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pendente</Badge>;
      case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Extrato de Comissões</h1>
        <p className="text-muted-foreground">Acompanhe seus ganhos por cada venda convertida.</p>
      </div>

      <Card className="border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Venda/Orçamento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor Venda</TableHead>
                <TableHead className="text-right">Percentual</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                    Carregando extrato...
                  </TableCell>
                </TableRow>
              ) : commissions && commissions.length > 0 ? (
                commissions.map((comm) => (
                  <TableRow key={comm.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(comm.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">#{comm.deal_id.split('-')[0]}</TableCell>
                    <TableCell>{comm.customer_name || "N/A"}</TableCell>
                    <TableCell className="text-right">
                      R$ {Number(comm.deal_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(comm.commission_percentage).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      R$ {Number(comm.commission_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(comm.status)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground italic">
                    <Wallet className="h-8 w-8 mx-auto opacity-20 mb-2" />
                    Nenhuma comissão registrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}