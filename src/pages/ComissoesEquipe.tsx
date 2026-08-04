import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Users, Wallet } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useCommissionSummary } from "@/hooks/use-commission";
import { exportToExcel } from "@/lib/xlsx-export";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function ComissoesEquipe() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [redbarFilter, setRedbarFilter] = useState<"all" | "only" | "exclude">("all");

  const { data: summary, isLoading } = useCommissionSummary({ start_date: startDate, end_date: endDate });

  const handleExport = () => {
    if (!summary?.users?.length) return;
    const exportData = summary.users.map((u: any) => ({
      'Vendedor': u.user_name || u.name,
      'Email': u.email,
      'Faturamento Validado': u.net_total || 0,
      'Comissão Validada': (u.commission?.regular?.total || 0) + (u.commission?.redbar?.total || 0),
      'Comissão Red Bar': u.commission?.redbar?.total || 0,
      'Comissão Normal': u.commission?.regular?.total || 0,
      'Projeção Faturamento': u.projected_net_total || 0,
      'Projeção Comissão Total': (u.projected_commission?.regular?.total || 0) + (u.projected_commission?.redbar?.total || 0),
      'Projeção Comissão Normal': u.projected_commission?.regular?.total || 0,
      'Projeção Comissão Red Bar': u.projected_commission?.redbar?.total || 0
    }));
    exportToExcel(exportData, `Comissoes_Equipe_${startDate}_${endDate}`);
  };

  const users = summary?.users || [];

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Comissões da Equipe
            </h1>
            <p className="text-muted-foreground text-sm">Resumo consolidado de comissões validadas por vendedor.</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!users.length || isLoading}>
            <FileText className="h-4 w-4 mr-2" /> Exportar XLSX
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Filtro Red Bar</Label>
              <select 
                className="w-full border rounded p-2 text-sm"
                value={redbarFilter}
                onChange={(e) => setRedbarFilter(e.target.value as any)}
              >
                <option value="all">Ver Tudo</option>
                <option value="only">Somente Red Bar</option>
                <option value="exclude">Sem Red Bar</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Comissão Normal</TableHead>
                  <TableHead className="text-right">Comissão Red Bar</TableHead>
                  <TableHead className="text-right font-bold">Total Comissão</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u: any) => (
                  <TableRow key={u.user_id || u.id}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-2">
                        {u.user_name || u.name}
                        {u.is_manager && (
                          <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase">
                            Gerente ({u.managed_channel})
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{u.user_email || u.email}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">{fmt(u.net_total || 0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(u.commission?.regular?.total || 0)}</TableCell>
                    <TableCell className="text-right text-red-600">{fmt(u.commission?.redbar?.total || 0)}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{fmt((u.commission?.regular?.total || 0) + (u.commission?.redbar?.total || 0))}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="link" 
                        size="sm"
                        onClick={() => {
                          const sp = new URLSearchParams();
                          sp.set("user_id", u.id);
                          sp.set("start_date", startDate);
                          sp.set("end_date", endDate);
                          sp.set("status", "validated");
                          window.location.href = `/comissoes/validacao?${sp.toString()}`;
                        }}
                      >
                        Ver detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!users.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Nenhum dado encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
