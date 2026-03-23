import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, ShoppingCart, Receipt } from "lucide-react";
import { format, eachDayOfInterval, parseISO, isWeekend, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Goal } from "@/hooks/use-goals";

interface Props {
  startDate: string;
  endDate: string;
  filterUserId?: string;
  filterChannel?: string;
  filterGroupId?: string;
  goals?: Goal[];
}

interface DailyRow {
  data_type: string;
  day: string;
  count: number;
  total_value: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const TYPE_CONFIG = {
  orcamento: { label: "Orçamentos", icon: FileText, metricValue: "quotes_value", metricCount: "quotes_count", color: "text-blue-600" },
  pedido: { label: "Pedidos", icon: ShoppingCart, metricValue: "orders_value", metricCount: "orders_count", color: "text-green-600" },
  faturamento: { label: "Faturamento", icon: Receipt, metricValue: "billing_value", metricCount: "billing_count", color: "text-amber-600" },
};

function countBusinessDays(start: string, end: string): number {
  try {
    const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) });
    return days.filter(d => !isWeekend(d)).length;
  } catch { return 22; }
}

export function DailyEvolutionTable({ startDate, endDate, filterUserId, filterChannel, filterGroupId, goals }: Props) {
  const { data: dailyData, isLoading } = useQuery<DailyRow[]>({
    queryKey: ["crm-goals-daily", startDate, endDate, filterUserId, filterChannel, filterGroupId],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("start_date", startDate);
      sp.set("end_date", endDate);
      if (filterUserId && filterUserId !== "all") sp.set("user_id", filterUserId);
      if (filterChannel && filterChannel !== "all") sp.set("channel", filterChannel);
      if (filterGroupId && filterGroupId !== "all") sp.set("group_id", filterGroupId);
      return api<DailyRow[]>(`/api/crm/goals/data-daily?${sp.toString()}`);
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const allDays = (() => {
    try {
      return eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
    } catch { return []; }
  })();

  const businessDays = countBusinessDays(startDate, endDate);

  const getMonthlyGoalValue = (dataType: keyof typeof TYPE_CONFIG): number => {
    if (!goals) return 0;
    const cfg = TYPE_CONFIG[dataType];
    const matching = goals.filter(g => 
      (g.metric === cfg.metricValue) && g.is_active
    );
    return matching.reduce((s, g) => s + g.target_value, 0);
  };

  const renderTable = (dataType: keyof typeof TYPE_CONFIG) => {
    const cfg = TYPE_CONFIG[dataType];
    const Icon = cfg.icon;
    const typeData = dailyData?.filter(r => r.data_type === dataType) || [];
    const dayMap: Record<string, DailyRow> = {};
    typeData.forEach(r => { dayMap[r.day?.split("T")[0]] = r; });

    const monthlyGoal = getMonthlyGoalValue(dataType);
    const dailyGoal = businessDays > 0 ? monthlyGoal / businessDays : 0;

    let accValue = 0;
    let accCount = 0;
    let accPlanned = 0;

    const rows = allDays.map(d => {
      const key = format(d, "yyyy-MM-dd");
      const dayData = dayMap[key];
      const dayValue = dayData?.total_value || 0;
      const dayCount = dayData?.count || 0;
      const isBizDay = !isWeekend(d);
      const planned = isBizDay ? dailyGoal : 0;

      accValue += dayValue;
      accCount += dayCount;
      accPlanned += planned;

      const ticket = dayCount > 0 ? dayValue / dayCount : 0;
      const met = planned > 0 ? dayValue >= planned : dayValue > 0;

      return { date: d, key, dayValue, dayCount, planned, ticket, isBizDay, met, accValue, accPlanned };
    });

    return (
      <div className="border rounded-lg overflow-auto max-h-[500px]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[100px]">Data</TableHead>
              <TableHead className="w-[60px] text-center">Dia</TableHead>
              <TableHead className="text-right">Planejado</TableHead>
              <TableHead className="text-right">Realizado</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Ticket Médio</TableHead>
              <TableHead className="text-right">Acum. Plan.</TableHead>
              <TableHead className="text-right">Acum. Real.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => {
              const weekend = isWeekend(r.date);
              const dayName = DAY_NAMES[getDay(r.date)];
              const accMet = r.accPlanned > 0 ? r.accValue >= r.accPlanned : true;
              return (
                <TableRow key={r.key} className={weekend ? "bg-muted/30" : ""}>
                  <TableCell className="text-sm font-medium">
                    {format(r.date, "dd/MM", { locale: ptBR })}
                  </TableCell>
                  <TableCell className={`text-center text-xs ${weekend ? "text-muted-foreground" : ""}`}>
                    {dayName}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.isBizDay && dailyGoal > 0 ? fmt(r.planned) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={`text-right text-sm font-medium ${r.dayValue > 0 ? (r.met ? "text-green-600" : "text-red-600") : ""}`}>
                    {r.dayValue > 0 ? fmt(r.dayValue) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.dayCount > 0 ? r.dayCount : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.dayCount > 0 ? fmt(r.ticket) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.accPlanned > 0 ? fmt(r.accPlanned) : "—"}
                  </TableCell>
                  <TableCell className={`text-right text-xs font-medium ${accMet ? "text-green-600" : "text-red-600"}`}>
                    {r.accValue > 0 ? fmt(r.accValue) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Totals row */}
            {rows.length > 0 && (() => {
              const totalValue = rows[rows.length - 1].accValue;
              const totalPlanned = rows[rows.length - 1].accPlanned;
              const totalCount = rows.reduce((s, r) => s + r.dayCount, 0);
              const totalTicket = totalCount > 0 ? totalValue / totalCount : 0;
              const totalMet = totalPlanned > 0 ? totalValue >= totalPlanned : true;
              return (
                <TableRow className="bg-muted/50 font-bold border-t-2">
                  <TableCell colSpan={2} className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-right">{totalPlanned > 0 ? fmt(totalPlanned) : "—"}</TableCell>
                  <TableCell className={`text-right ${totalMet ? "text-green-600" : "text-red-600"}`}>{fmt(totalValue)}</TableCell>
                  <TableCell className="text-right">{totalCount}</TableCell>
                  <TableCell className="text-right">{fmt(totalTicket)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{totalPlanned > 0 ? fmt(totalPlanned) : "—"}</TableCell>
                  <TableCell className={`text-right ${totalMet ? "text-green-600" : "text-red-600"}`}>{fmt(totalValue)}</TableCell>
                </TableRow>
              );
            })()}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📊 Evolução Diária</CardTitle>
        <p className="text-xs text-muted-foreground">
          {businessDays} dias úteis no período • Meta mensal dividida por dia útil
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="orcamento">
          <TabsList className="mb-3">
            <TabsTrigger value="orcamento" className="gap-1"><FileText className="h-3.5 w-3.5" /> Orçamentos</TabsTrigger>
            <TabsTrigger value="pedido" className="gap-1"><ShoppingCart className="h-3.5 w-3.5" /> Pedidos</TabsTrigger>
            <TabsTrigger value="faturamento" className="gap-1"><Receipt className="h-3.5 w-3.5" /> Faturamento</TabsTrigger>
          </TabsList>
          <TabsContent value="orcamento">{renderTable("orcamento")}</TabsContent>
          <TabsContent value="pedido">{renderTable("pedido")}</TabsContent>
          <TabsContent value="faturamento">{renderTable("faturamento")}</TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
