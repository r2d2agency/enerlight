import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClipboardList, Search, Filter, FileDown, Share2, Eye, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function RepQuotes() {
  const [search, setSearch] = useState("");
  const [dealToConvert, setDealToConvert] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const convertMutation = useMutation({
    mutationFn: (dealId: string) => api.post(`/api/representatives/quotes/${dealId}/convert`, {}),
    onSuccess: () => {
      toast.success("Orçamento convertido em venda com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["rep-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["rep-stats"] });
      setDealToConvert(null);
    },
    onError: (error: any) => {
      toast.error(`Erro ao converter orçamento: ${error.message}`);
    }
  });

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

  const handleDownloadPDF = async (dealId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/representatives/quotes/${dealId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Erro ao gerar PDF');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orcamento-${dealId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
      toast.success("PDF gerado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar o PDF do orçamento.");
    }
  };

  const handlePreviewPDF = (dealId: string) => {
    const url = `${import.meta.env.VITE_API_URL}/api/representatives/quotes/${dealId}/pdf?token=${localStorage.getItem('token')}`;
    window.open(url, '_blank');
  };

  const handleShare = async (dealId: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/representatives/quotes/${dealId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Erro ao gerar PDF');
      
      const blob = await response.blob();
      const file = new File([blob], `orcamento-${dealId}.pdf`, { type: 'application/pdf' });
      
      if (navigator.share) {
        await navigator.share({
          files: [file],
          title: `Orçamento #${dealId}`,
          text: 'Confira o orçamento em anexo.'
        });
      } else {
        toast.info("Compartilhamento não suportado neste navegador. Use o botão de download.");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao compartilhar o orçamento.");
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
                <TableHead className="text-center w-[150px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
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
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {quote.status !== 'convertido' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Converter em Venda"
                            onClick={() => setDealToConvert(quote.id)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Visualizar PDF"
                          onClick={() => handlePreviewPDF(quote.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Baixar PDF"
                          onClick={() => handleDownloadPDF(quote.id)}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Compartilhar"
                          onClick={() => handleShare(quote.id)}
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground italic">
                    <ClipboardList className="h-8 w-8 mx-auto opacity-20 mb-2" />
                    Nenhum orçamento encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!dealToConvert} onOpenChange={(open) => !open && setDealToConvert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Conversão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja converter este orçamento em uma venda concluída? Esta ação notificará a equipe interna e registrará sua comissão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => dealToConvert && convertMutation.mutate(dealToConvert)}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirmar Venda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}