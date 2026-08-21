import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardList, Search, Filter, FileDown, Eye, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function RepManagerQuotes() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");

  const { data: quotes, isLoading } = useQuery({
    queryKey: ["admin-quotes", search, statusFilter, repFilter],
    queryFn: () => api<any[]>(`/api/representatives/admin/all-quotes?search=${search}&status=${statusFilter}&rep_id=${repFilter}`)
  });

  const { data: representatives } = useQuery({
    queryKey: ["admin-reps-list"],
    queryFn: () => api<any[]>("/api/representatives/admin/list")
  });

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'rascunho': return <Badge variant="outline">Rascunho</Badge>;
      case 'enviado': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Enviado</Badge>;
      case 'em análise': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">Em Análise</Badge>;
      case 'convertido': return <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20">Convertido</Badge>;
      case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
      default: return <Badge variant="outline">{status || 'Aberto'}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestão Global de Orçamentos</h1>
        <p className="text-muted-foreground">Visualize e monitore todas as propostas geradas pelos representantes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por título, cliente ou código..." 
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={repFilter} onValueChange={setRepFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Representante" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Representantes</SelectItem>
            {representatives?.map(rep => (
              <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="enviado">Enviado</SelectItem>
            <SelectItem value="convertido">Convertido</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Representante</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                    Carregando orçamentos globais...
                  </TableCell>
                </TableRow>
              ) : quotes?.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(quote.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{quote.rep_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{quote.customer_name || quote.company_name || "N/A"}</TableCell>
                  <TableCell>{getStatusBadge(quote.status)}</TableCell>
                  <TableCell className="text-right font-bold text-sm">
                    R$ {Number(quote.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" title="Ver Detalhes">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Exportar">
                        <FileDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
