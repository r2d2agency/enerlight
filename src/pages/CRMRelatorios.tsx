import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import {
  useCRMSalesReport,
  useCRMConversionReport,
  useWinLossAnalysis,
  usePipelineVelocity,
} from "@/hooks/use-crm-reports";
import { useCRMFunnels, useCRMMyTeam } from "@/hooks/use-crm";
import { useERPBillingSummary, useERPBillingRecords, useERPBillingMutations } from "@/hooks/use-erp-billing";
import { ERPBillingImportDialog } from "@/components/crm/ERPBillingImportDialog";
import {
  CalendarIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Users,
  Loader2,
  BarChart3,
  PieChartIcon,
  Activity,
  FileSpreadsheet,
  Upload,
  ShoppingCart,
  Filter,
  Filter as FilterIcon,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

const STATUS_COLORS = {
  open: "hsl(var(--primary))",
  won: "#22c55e",
  lost: "#ef4444",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CRMRelatorios() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [selectedFunnel, setSelectedFunnel] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [activeTab, setActiveTab] = useState("overview");
  const [showBillingImport, setShowBillingImport] = useState(false);
  const [billingRecordsPage, setBillingRecordsPage] = useState(1);
  const [filterUserId, setFilterUserId] = useState<string>("all");

  const { data: funnels } = useCRMFunnels();
  const { data: teamMembers } = useCRMMyTeam();

  const billingStartDate = dateRange?.from?.toISOString().split("T")[0];
  const billingEndDate = dateRange?.to?.toISOString().split("T")[0];
  const { data: billingSummary } = useERPBillingSummary({
    startDate: billingStartDate,
    endDate: billingEndDate,
  });
  const { data: billingRecords } = useERPBillingRecords({
    startDate: billingStartDate,
    endDate: billingEndDate,
    page: billingRecordsPage,
  });
  const { deleteRecord, dedup } = useERPBillingMutations();

  const { data: salesData, isLoading } = useCRMSalesReport({
    startDate: dateRange?.from?.toISOString().split("T")[0],
    endDate: dateRange?.to?.toISOString().split("T")[0],
    funnelId: selectedFunnel !== "all" ? selectedFunnel : undefined,
    groupBy,
  });

  const { data: conversionData } = useCRMConversionReport({
    funnelId: selectedFunnel !== "all" ? selectedFunnel : funnels?.[0]?.id || "",
    startDate: dateRange?.from?.toISOString().split("T")[0],
    endDate: dateRange?.to?.toISOString().split("T")[0],
  });

  // Trend data
  const { data: winLossData } = useWinLossAnalysis({
    startDate: dateRange?.from?.toISOString().split("T")[0],
    endDate: dateRange?.to?.toISOString().split("T")[0],
    funnelId: selectedFunnel !== "all" ? selectedFunnel : undefined,
  });

  const { data: velocityData } = usePipelineVelocity(
    selectedFunnel !== "all" ? selectedFunnel : undefined
  );

  const handlePreset = (days: number) => {
    setDateRange({
      from: subDays(new Date(), days - 1),
      to: new Date(),
    });
  };

  const summary = salesData?.summary || {
    open: { count: 0, value: 0 },
    won: { count: 0, value: 0 },
    lost: { count: 0, value: 0 },
    winRate: 0,
    totalValue: 0,
  };

  // Pie chart data
  const pieData = [
    { name: "Em aberto", value: summary.open.count, color: STATUS_COLORS.open },
    { name: "Ganhas", value: summary.won.count, color: STATUS_COLORS.won },
    { name: "Perdidas", value: summary.lost.count, color: STATUS_COLORS.lost },
  ].filter((d) => d.value > 0);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6" />
              Relatórios de Vendas
            </h1>
            <p className="text-muted-foreground">
              Acompanhe o desempenho das suas negociações
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM", { locale: ptBR })} -{" "}
                        {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                    )
                  ) : (
                    "Período"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 border-b flex gap-2 flex-wrap">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.days}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreset(preset.days)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>

            {/* Funnel Filter */}
            <Select value={selectedFunnel} onValueChange={setSelectedFunnel}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os funis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funis</SelectItem>
                {funnels?.map((funnel) => (
                  <SelectItem key={funnel.id} value={funnel.id}>
                    {funnel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* User Filter */}
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos usuários" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos usuários</SelectItem>
                {teamMembers?.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Group By */}
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Por dia</SelectItem>
                <SelectItem value="week">Por semana</SelectItem>
                <SelectItem value="month">Por mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPI Cards - Row 1: Orçamentos, Pedidos, Faturamento */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Orçamentos no Mês</p>
                      <p className="text-2xl font-bold text-blue-600">{summary.quotes?.total || 0}</p>
                      <p className="text-sm text-blue-600">{formatCurrency(summary.quotes?.totalValue || 0)}</p>
                      <div className="flex gap-2 text-xs mt-0.5">
                        <span className="text-green-600">{summary.quotes?.won || 0} confirmados</span>
                        <span className="text-muted-foreground">{summary.quotes?.open || 0} abertos</span>
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <FileSpreadsheet className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pedidos no Mês</p>
                      <p className="text-2xl font-bold text-green-600">{summary.quotes?.won || 0}</p>
                      <p className="text-sm text-green-600">{formatCurrency(summary.quotes?.wonValue || 0)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(summary.quotes?.total || 0) > 0
                          ? `${(((summary.quotes?.won || 0) / (summary.quotes?.total || 1)) * 100).toFixed(0)}% conversão`
                          : "—"}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                      <ShoppingCart className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Faturamento ERP</p>
                      <p className="text-2xl font-bold text-amber-600">{formatCurrency(billingSummary?.total?.value || 0)}</p>
                      <p className="text-sm text-muted-foreground">{billingSummary?.total?.orders || 0} pedidos</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* KPI Cards - Row 2: Negociações */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Negociações</p>
                  <p className="text-2xl font-bold">{summary.open.count + summary.won.count + summary.lost.count}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(summary.totalValue)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Ganhas</p>
                  <p className="text-2xl font-bold text-green-600">{summary.won.count}</p>
                  <p className="text-xs text-green-600">{formatCurrency(summary.won.value)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Perdidas</p>
                  <p className="text-2xl font-bold text-red-600">{summary.lost.count}</p>
                  <p className="text-xs text-red-600">{formatCurrency(summary.lost.value)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Taxa Conversão</p>
                  <p className="text-2xl font-bold">{summary.winRate}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Sales Funnel Visualization */}
            {salesData?.salesFunnel && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FilterIcon className="h-5 w-5" />
                    Funil de Vendas
                  </CardTitle>
                  <CardDescription>Negociações → Orçamentos → Pedidos (Vendas)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Negociações (Prospects)", count: salesData.salesFunnel.deals.count, value: salesData.salesFunnel.deals.value, color: "hsl(var(--primary))", pct: 100 },
                      { label: "Orçamentos (Qualificados)", count: salesData.salesFunnel.quotes.count, value: salesData.salesFunnel.quotes.value, color: "#3b82f6", pct: salesData.salesFunnel.deals.count > 0 ? (salesData.salesFunnel.quotes.count / salesData.salesFunnel.deals.count) * 100 : 0 },
                      { label: "Pedidos (Vendas)", count: salesData.salesFunnel.orders.count, value: salesData.salesFunnel.orders.value, color: "#22c55e", pct: salesData.salesFunnel.deals.count > 0 ? (salesData.salesFunnel.orders.count / salesData.salesFunnel.deals.count) * 100 : 0 },
                    ].map((step, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{step.label}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-bold">{step.count}</span>
                            <span className="text-muted-foreground">{formatCurrency(step.value)}</span>
                            {i > 0 && <Badge variant="outline">{step.pct.toFixed(0)}%</Badge>}
                          </div>
                        </div>
                        <div
                          className="h-10 rounded-md flex items-center px-3 transition-all"
                          style={{
                            width: `${Math.max(step.pct, 15)}%`,
                            backgroundColor: step.color + "25",
                            borderLeft: `4px solid ${step.color}`,
                          }}
                        >
                          <span className="text-xs text-muted-foreground">{formatCurrency(step.value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quotes by Channel */}
            {salesData?.quotesByChannel && salesData.quotesByChannel.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Orçamentos por Canal</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-center">Orçamentos</TableHead>
                        <TableHead className="text-center">Pedidos</TableHead>
                        <TableHead className="text-center">Abertos</TableHead>
                        <TableHead className="text-center">Conversão</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-right">Valor Vendido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesData.quotesByChannel.map((ch) => (
                        <TableRow key={ch.channel}>
                          <TableCell className="font-medium">{ch.channel}</TableCell>
                          <TableCell className="text-center">{ch.total}</TableCell>
                          <TableCell className="text-center text-green-600 font-medium">{ch.won}</TableCell>
                          <TableCell className="text-center">{ch.open}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">
                              {ch.total > 0 ? ((ch.won / ch.total) * 100).toFixed(0) : 0}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(ch.totalValue)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatCurrency(ch.wonValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Visão Geral
                </TabsTrigger>
                <TabsTrigger value="trends" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Tendências
                </TabsTrigger>
                <TabsTrigger value="funnels" className="gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  Por Funil
                </TabsTrigger>
                <TabsTrigger value="team" className="gap-2">
                  <Users className="h-4 w-4" />
                  Equipe
                </TabsTrigger>
                <TabsTrigger value="billing" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Faturamento
                </TabsTrigger>
                <TabsTrigger value="lossReasons" className="gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Motivos de Perda
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Timeline Chart */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Evolução das Negociações</CardTitle>
                      <CardDescription>
                        Quantidade de negociações por período
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {salesData?.timeline && salesData.timeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={salesData.timeline}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="period"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(v) => {
                                if (groupBy === "day") {
                                  const parts = v.split("-");
                                  return `${parts[2]}/${parts[1]}`;
                                }
                                return v;
                              }}
                            />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                            <Legend />
                            <Bar
                              dataKey="won"
                              name="Ganhas"
                              fill={STATUS_COLORS.won}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="lost"
                              name="Perdidas"
                              fill={STATUS_COLORS.lost}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="open"
                              name="Em aberto"
                              fill={STATUS_COLORS.open}
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                          Nenhum dado no período selecionado
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Pie Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Distribuição</CardTitle>
                      <CardDescription>Por status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                              labelLine={false}
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                          Nenhum dado
                        </div>
                      )}
                      <div className="space-y-2 mt-4">
                        {pieData.map((item) => (
                          <div key={item.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-sm">{item.name}</span>
                            </div>
                            <span className="font-medium">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Value Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Valor das Negociações</CardTitle>
                    <CardDescription>Evolução do valor por período</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {salesData?.timeline && salesData.timeline.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={salesData.timeline}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="period"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => {
                              if (groupBy === "day") {
                                const parts = v.split("-");
                                return `${parts[2]}/${parts[1]}`;
                              }
                              return v;
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => formatCurrency(v)}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                            formatter={(value: number) => formatCurrency(value)}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="wonValue"
                            name="Valor Ganho"
                            stroke={STATUS_COLORS.won}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="lostValue"
                            name="Valor Perdido"
                            stroke={STATUS_COLORS.lost}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        Nenhum dado no período selecionado
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Funnels Tab */}
              <TabsContent value="funnels" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Funnel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Desempenho por Funil</CardTitle>
                      <CardDescription>Comparativo entre funis</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {salesData?.byFunnel && salesData.byFunnel.length > 0 ? (
                        <div className="space-y-4">
                          {salesData.byFunnel.map((funnel) => {
                            const total = funnel.open + funnel.won + funnel.lost;
                            const wonPercent = total > 0 ? (funnel.won / total) * 100 : 0;
                            return (
                              <div key={funnel.funnelId} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: funnel.funnelColor }}
                                    />
                                    <span className="font-medium">{funnel.funnelName}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-green-600 font-medium">
                                      {formatCurrency(funnel.wonValue)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Progress value={wonPercent} className="h-2 flex-1" />
                                  <span className="text-sm text-muted-foreground w-12 text-right">
                                    {wonPercent.toFixed(0)}%
                                  </span>
                                </div>
                                <div className="flex gap-4 text-sm text-muted-foreground">
                                  <span>
                                    <span className="text-green-600">{funnel.won}</span> ganhas
                                  </span>
                                  <span>
                                    <span className="text-red-600">{funnel.lost}</span> perdidas
                                  </span>
                                  <span>{funnel.open} em aberto</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                          Nenhum dado disponível
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Conversion Funnel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Funil de Conversão</CardTitle>
                      <CardDescription>
                        {selectedFunnel !== "all"
                          ? funnels?.find((f) => f.id === selectedFunnel)?.name
                          : "Selecione um funil para ver o detalhamento"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {conversionData && conversionData.length > 0 ? (
                        <div className="space-y-3">
                          {conversionData.map((stage, index) => {
                            const maxCount = Math.max(...conversionData.map((s) => s.dealCount));
                            const width = maxCount > 0 ? (stage.dealCount / maxCount) * 100 : 0;
                            return (
                              <div key={stage.stageId} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span>{stage.stageName}</span>
                                  <span className="font-medium">{stage.dealCount}</span>
                                </div>
                                <div
                                  className="h-8 rounded-md flex items-center px-3 transition-all"
                                  style={{
                                    width: `${Math.max(width, 20)}%`,
                                    backgroundColor: stage.stageColor + "30",
                                    borderLeft: `4px solid ${stage.stageColor}`,
                                  }}
                                >
                                  <span className="text-xs text-muted-foreground">
                                    {formatCurrency(stage.totalValue)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                          {selectedFunnel === "all"
                            ? "Selecione um funil específico"
                            : "Nenhum dado disponível"}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Team Tab */}
              <TabsContent value="team" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Desempenho por Funcionário</CardTitle>
                    <CardDescription>Orçamentos, pedidos, vendas e conversão por vendedor</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {salesData?.byOwner && salesData.byOwner.length > 0 ? (
                      <div className="overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]">#</TableHead>
                              <TableHead>Vendedor</TableHead>
                              <TableHead className="text-center">Negociações</TableHead>
                              <TableHead className="text-center">Orçamentos</TableHead>
                              <TableHead className="text-center">Pedidos</TableHead>
                              <TableHead className="text-center">Conversão</TableHead>
                              <TableHead className="text-right">Valor Vendas</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {salesData.byOwner.map((owner, index) => {
                              const convRate = owner.quoteCount > 0
                                ? ((owner.orderCount / owner.quoteCount) * 100).toFixed(0)
                                : "—";
                              return (
                                <TableRow key={owner.userId}>
                                  <TableCell>
                                    <Badge
                                      variant={index < 3 ? "default" : "secondary"}
                                      className={cn(
                                        index === 0 && "bg-yellow-500",
                                        index === 1 && "bg-gray-400",
                                        index === 2 && "bg-amber-600"
                                      )}
                                    >
                                      {index + 1}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-medium">{owner.userName}</TableCell>
                                  <TableCell className="text-center">{owner.totalDeals}</TableCell>
                                  <TableCell className="text-center text-blue-600 font-medium">{owner.quoteCount}</TableCell>
                                  <TableCell className="text-center text-green-600 font-medium">{owner.orderCount}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="outline">{convRate}{convRate !== "—" ? "%" : ""}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-green-600">
                                    {formatCurrency(owner.orderValue)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                        Nenhum vendedor com negociações no período
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Trends Tab */}
              <TabsContent value="trends" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Win/Loss Trend Chart */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                        Tendência de Ganhos vs Perdas
                      </CardTitle>
                      <CardDescription>
                        Evolução mensal do desempenho de vendas
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {winLossData?.trend && winLossData.trend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={350}>
                          <ComposedChart data={winLossData.trend}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(v) => {
                                const [year, month] = v.split("-");
                                const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                                return `${months[parseInt(month) - 1]}/${year.slice(2)}`;
                              }}
                            />
                            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                            <YAxis
                              yAxisId="right"
                              orientation="right"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(v) => formatCurrency(v)}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number, name: string) => {
                                if (name.includes("Valor")) return formatCurrency(value);
                                return value;
                              }}
                            />
                            <Legend />
                            <Bar
                              yAxisId="left"
                              dataKey="won_count"
                              name="Negociações Ganhas"
                              fill={STATUS_COLORS.won}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              yAxisId="left"
                              dataKey="lost_count"
                              name="Negociações Perdidas"
                              fill={STATUS_COLORS.lost}
                              radius={[4, 4, 0, 0]}
                            />
                            <Line
                              yAxisId="right"
                              type="monotone"
                              dataKey="won_value"
                              name="Valor Ganho"
                              stroke="#10b981"
                              strokeWidth={3}
                              dot={{ r: 5, fill: "#10b981" }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                          Nenhum dado de tendência disponível
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Win Rate Trend */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Taxa de Conversão ao Longo do Tempo</CardTitle>
                      <CardDescription>Evolução da taxa de fechamento</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {winLossData?.trend && winLossData.trend.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                          <AreaChart
                            data={winLossData.trend.map((t) => ({
                              ...t,
                              winRate:
                                t.won_count + t.lost_count > 0
                                  ? ((t.won_count / (t.won_count + t.lost_count)) * 100).toFixed(1)
                                  : 0,
                            }))}
                          >
                            <defs>
                              <linearGradient id="winRateGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(v) => {
                                const [, month] = v.split("-");
                                const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
                                return months[parseInt(month) - 1];
                              }}
                            />
                            <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number) => [`${value}%`, "Taxa de Conversão"]}
                            />
                            <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: "Meta 50%", fontSize: 10, fill: "#f59e0b" }} />
                            <Area
                              type="monotone"
                              dataKey="winRate"
                              stroke="#10b981"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#winRateGradient)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                          Nenhum dado disponível
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Pipeline Velocity */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" />
                        Velocidade do Pipeline
                      </CardTitle>
                      <CardDescription>Receita potencial por dia</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {velocityData ? (
                        <div className="space-y-6">
                          <div className="text-center">
                            <div className="text-4xl font-bold text-primary">
                              {formatCurrency(velocityData.velocity || 0)}
                            </div>
                            <p className="text-sm text-muted-foreground">por dia</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="text-center p-3 bg-muted/50 rounded-lg">
                              <div className="text-lg font-semibold">{velocityData.metrics.open_deals}</div>
                              <p className="text-xs text-muted-foreground">Deals Abertos</p>
                            </div>
                            <div className="text-center p-3 bg-muted/50 rounded-lg">
                              <div className="text-lg font-semibold">{velocityData.metrics.won_deals}</div>
                              <p className="text-xs text-muted-foreground">Deals Ganhos</p>
                            </div>
                            <div className="text-center p-3 bg-muted/50 rounded-lg">
                              <div className="text-lg font-semibold">{formatCurrency(velocityData.metrics.avg_deal_value)}</div>
                              <p className="text-xs text-muted-foreground">Ticket Médio</p>
                            </div>
                            <div className="text-center p-3 bg-muted/50 rounded-lg">
                              <div className="text-lg font-semibold">{velocityData.metrics.avg_cycle_days}d</div>
                              <p className="text-xs text-muted-foreground">Ciclo Médio</p>
                            </div>
                          </div>

                          <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                            <div className="text-2xl font-bold text-green-600">{velocityData.metrics.win_rate}%</div>
                            <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                          Calculando velocidade...
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Stage Time Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle>Tempo Médio por Etapa</CardTitle>
                    <CardDescription>
                      Quanto tempo as negociações permanecem em cada etapa do funil
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {velocityData?.stage_time && velocityData.stage_time.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={velocityData.stage_time} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}d`} />
                          <YAxis
                            type="category"
                            dataKey="stage_name"
                            tick={{ fontSize: 12 }}
                            width={120}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                            formatter={(value: number) => [`${value} dias`, "Tempo médio"]}
                          />
                          <Bar
                            dataKey="avg_days_in_stage"
                            fill="hsl(var(--primary))"
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                        Nenhum dado de tempo por etapa disponível
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Loss Reasons */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-red-500" />
                      Motivos de Perda
                    </CardTitle>
                    <CardDescription>
                      Análise dos principais motivos de negociações perdidas
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {winLossData?.loss_reasons && winLossData.loss_reasons.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie
                              data={winLossData.loss_reasons}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="count"
                              nameKey="reason"
                            >
                              {winLossData.loss_reasons.map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={`hsl(${(index * 45) % 360}, 70%, 50%)`}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-3">
                          {winLossData.loss_reasons.map((reason, index) => (
                            <div key={reason.reason} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: `hsl(${(index * 45) % 360}, 70%, 50%)` }}
                                />
                                <span className="text-sm">{reason.reason || "Não especificado"}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-medium">{reason.count}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({formatCurrency(reason.lost_value)})
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                        Nenhum motivo de perda registrado
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              {/* Billing Tab */}
              <TabsContent value="billing" className="mt-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Faturamento ERP</h3>
                    <p className="text-sm text-muted-foreground">
                      Dados importados da planilha de faturamento do ERP
                    </p>
                  </div>
                  <Button onClick={() => setShowBillingImport(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Planilha
                  </Button>
                </div>

                {billingSummary ? (
                  <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-muted-foreground">Total Faturado</p>
                          <p className="text-2xl font-bold">{formatCurrency(billingSummary.total.value)}</p>
                          <p className="text-sm text-muted-foreground">{billingSummary.total.orders} pedidos</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-muted-foreground">Vendedores</p>
                          <p className="text-2xl font-bold">{new Set(billingSummary.bySeller.map(s => s.seller_name)).size}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <p className="text-sm text-muted-foreground">Canais</p>
                          <p className="text-2xl font-bold">{billingSummary.byChannel.length}</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* By Seller */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Ranking de Faturamento por Vendedor</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {billingSummary.bySeller.length > 0 ? (
                          <>
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart data={billingSummary.bySeller.reduce((acc, s) => {
                                const existing = acc.find(a => a.seller_name === s.seller_name);
                                if (existing) {
                                  existing.total_value += s.total_value;
                                  existing.order_count += s.order_count;
                                } else {
                                  acc.push({ ...s });
                                }
                                return acc;
                              }, [] as typeof billingSummary.bySeller).sort((a, b) => b.total_value - a.total_value)}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="seller_name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={80} />
                                <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                                <Bar dataKey="total_value" fill="hsl(var(--primary))" name="Faturado" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>

                            <Table className="mt-4">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Vendedor</TableHead>
                                  <TableHead>Canal</TableHead>
                                  <TableHead className="text-right">Pedidos</TableHead>
                                  <TableHead className="text-right">Total Faturado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {billingSummary.bySeller.map((s, i) => (
                                  <TableRow key={`${s.seller_name}-${s.channel}-${i}`}>
                                    <TableCell className="font-medium">{s.user_name || s.seller_name}</TableCell>
                                    <TableCell>
                                      {s.channel && <Badge variant="outline">{s.channel}</Badge>}
                                    </TableCell>
                                    <TableCell className="text-right">{s.order_count}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(s.total_value)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                            Nenhum dado de faturamento importado para o período
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* By Channel + Timeline */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Por Canal</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {billingSummary.byChannel.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                              <PieChart>
                                <Pie
                                  data={billingSummary.byChannel}
                                  dataKey="total_value"
                                  nameKey="channel"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={80}
                                  label={({ channel, total_value }) => `${channel}: ${formatCurrency(total_value)}`}
                                >
                                  {billingSummary.byChannel.map((_, i) => (
                                    <Cell key={i} fill={`hsl(${(i * 60 + 200) % 360}, 70%, 50%)`} />
                                  ))}
                                </Pie>
                                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                              Sem dados
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Faturamento Diário</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {billingSummary.timeline.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                              <AreaChart data={billingSummary.timeline}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                                <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                                <Area type="monotone" dataKey="total_value" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" name="Faturado" />
                              </AreaChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                              Sem dados
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* By State */}
                    {billingSummary.byState.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Por Estado (UF)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {billingSummary.byState.map(s => (
                              <div key={s.state} className="p-3 border rounded-lg text-center">
                                <p className="font-bold text-lg">{s.state}</p>
                                <p className="text-sm text-muted-foreground">{s.order_count} pedidos</p>
                                <p className="text-sm font-medium">{formatCurrency(s.total_value)}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <FileSpreadsheet className="h-16 w-16 text-muted-foreground" />
                    <p className="text-muted-foreground">Importe sua planilha de faturamento do ERP para visualizar os dados aqui.</p>
                    <Button onClick={() => setShowBillingImport(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Importar Planilha
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Loss Reasons Tab */}
              <TabsContent value="lossReasons" className="mt-6 space-y-6">
                {salesData?.lossReasons && salesData.lossReasons.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Distribuição por Motivo</CardTitle>
                        <CardDescription>Motivos de perda das negociações no período</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={salesData.lossReasons.map((lr, i) => ({
                                name: lr.reason,
                                value: lr.count,
                                fill: ['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#84cc16'][i % 8],
                              }))}
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              dataKey="value"
                              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            >
                              {salesData.lossReasons.map((_, i) => (
                                <Cell key={i} fill={['#ef4444', '#f97316', '#eab308', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#84cc16'][i % 8]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [value, 'Negociações']} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Detalhamento</CardTitle>
                        <CardDescription>Quantidade e valor por motivo de perda</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Motivo</TableHead>
                              <TableHead className="text-right">Qtd</TableHead>
                              <TableHead className="text-right">Valor Perdido</TableHead>
                              <TableHead className="text-right">%</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {salesData.lossReasons.map((lr) => {
                              const totalLost = salesData.lossReasons.reduce((s, r) => s + r.count, 0);
                              return (
                                <TableRow key={lr.reason}>
                                  <TableCell className="font-medium">{lr.reason}</TableCell>
                                  <TableCell className="text-right">{lr.count}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(lr.totalValue)}</TableCell>
                                  <TableCell className="text-right">
                                    {totalLost > 0 ? ((lr.count / totalLost) * 100).toFixed(1) : 0}%
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <TrendingDown className="h-16 w-16 text-muted-foreground" />
                    <p className="text-muted-foreground">Nenhuma negociação perdida no período selecionado.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <ERPBillingImportDialog open={showBillingImport} onOpenChange={setShowBillingImport} />
    </MainLayout>
  );
}
