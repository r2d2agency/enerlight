import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Batch {
  batch_id: string;
  data_type: string;
  row_count: number;
  total_value: number;
  created_at: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  orcamento: { label: "Orçamento", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  pedido: { label: "Pedido", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  faturamento: { label: "Faturamento", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

export function ImportBatchList({ onDeleted }: { onDeleted: () => void }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery<Batch[]>({
    queryKey: ["goals-import-batches"],
    queryFn: () => api("/api/crm/goals/import/batches"),
  });

  const handleDelete = async (batchId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta importação? Todos os registros serão removidos.")) return;
    setDeleting(batchId);
    try {
      await api(`/api/crm/goals/import/batch/${batchId}`, { method: "DELETE" });
      toast.success("Importação excluída com sucesso!");
      qc.invalidateQueries({ queryKey: ["goals-import-batches"] });
      onDeleted();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (!batches?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>Nenhuma importação realizada ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Histórico de importações. Você pode excluir uma importação caso tenha sido feita incorretamente.</p>
      {batches.map(b => {
        const typeInfo = TYPE_LABELS[b.data_type] || { label: b.data_type, color: "" };
        return (
          <Card key={b.batch_id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
                    <span className="text-sm font-medium">{b.row_count} registros</span>
                    <span className="text-sm text-muted-foreground">•</span>
                    <span className="text-sm font-medium">{fmt(Number(b.total_value))}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Importado em {format(new Date(b.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive h-8 w-8"
                onClick={() => handleDelete(b.batch_id)}
                disabled={deleting === b.batch_id}
              >
                {deleting === b.batch_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
