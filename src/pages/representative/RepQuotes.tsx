import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardList, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function RepQuotes() {
  const [search, setSearch] = useState("");

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["rep-quotes"],
    queryFn: async () => {
      // Re-using the isolated customer quotes logic or general quotes filtered by rep
      return api<any[]>("/api/crm/representatives/my-deals");
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'rascunho': return <Badge variant="outline">Rascunho</Badge>;
      case 'enviado': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Enviado</Badge>;
      case 'em análise': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Em Análise</Badge>;
      case 'convertido': return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">Convertido</Badge>;
      case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
      case 'expirado': return <Badge variant="outline" className="opacity-50">Expirado</Badge>;
      default: return <Badge variant="outline">{status || 'Aberto'}</Badge>;
    }
  };

  const filteredQuotes = quotes?.filter(q => 
    q.title?.toLowerCase().includes(search.toLowerCase()) || 
    q.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Meus Orçamentos</h1>
          <p className="text-muted-foreground">Acompanhe o status e valores das suas propostas.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por título ou cliente..." 
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="outline" className="h-10 px-4 cursor-pointer hover:bg-accent gap-2">
          <Filter className="h-4 w-4" /> Filtros
        </Badge>
      </div>

      <Card className="border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground italic">
                    Carregando orçamentos...
                  </TableCell>
                </TableRow>
              ) : filteredQuotes && filteredQuotes.length > 0 ? (
                filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(quote.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium">{quote.title}</TableCell>
                    <TableCell>{quote.customer_name || quote.company_name || "N/A"}</TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell className="text-right font-bold">
                      R$ {Number(quote.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground italic">
                    <ClipboardList className="h-8 w-8 mx-auto opacity-20 mb-2" />
                    Nenhum orçamento encontrado.
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