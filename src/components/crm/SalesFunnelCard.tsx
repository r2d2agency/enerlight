import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

interface SalesFunnelCardProps {
  quotesValue: number;
  quotesCount: number;
  ordersValue: number;
  ordersCount: number;
  billingValue?: number;
  billingCount?: number;
  title?: string;
  quotesGoal?: number;
  ordersGoal?: number;
  billingGoal?: number;
}

export function SalesFunnelCard({
  quotesValue,
  quotesCount,
  ordersValue,
  ordersCount,
  billingValue,
  billingCount,
  title = "Funil de Vendas",
  quotesGoal,
  ordersGoal,
  billingGoal,
}: SalesFunnelCardProps) {
  const conversionRate = quotesCount > 0 ? (ordersCount / quotesCount) * 100 : 0;
  const billingRate = ordersCount > 0 && billingCount != null ? (billingCount / ordersCount) * 100 : 0;

  const hasGoals = !!(quotesGoal || ordersGoal || billingGoal);

  const steps = [
    {
      label: "Orçamentos",
      value: quotesValue,
      count: quotesCount,
      goal: quotesGoal,
      color: "bg-blue-500",
      bgColor: "bg-blue-100 dark:bg-blue-950",
      textColor: "text-blue-600",
    },
    {
      label: "Pedidos",
      value: ordersValue,
      count: ordersCount,
      goal: ordersGoal,
      color: "bg-green-500",
      bgColor: "bg-green-100 dark:bg-green-950",
      textColor: "text-green-600",
    },
  ];

  if (billingValue != null && billingCount != null) {
    steps.push({
      label: "Faturamento",
      value: billingValue,
      count: billingCount,
      goal: billingGoal,
      color: "bg-amber-500",
      bgColor: "bg-amber-100 dark:bg-amber-950",
      textColor: "text-amber-600",
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingDown className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => {
          // If goal exists, bar width = value/goal; otherwise relative to quotes
          const goalRef = hasGoals && step.goal && step.goal > 0 ? step.goal : null;
          const pct = goalRef
            ? Math.min((step.value / goalRef) * 100, 100)
            : (i === 0 ? 100 : quotesValue > 0 ? Math.max((step.value / quotesValue) * 100, 15) : 15);
          const pctLabel = goalRef ? ((step.value / goalRef) * 100).toFixed(1) : null;

          return (
            <div key={step.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${step.textColor}`}>{step.label}</span>
                <span className="text-muted-foreground">
                  {step.count} • {fmt(step.value)}
                  {goalRef ? ` / ${fmt(goalRef)}` : ""}
                </span>
              </div>
              <div className={`w-full ${goalRef ? step.bgColor : "bg-muted"} rounded-full h-7 overflow-hidden`}>
                <div
                  className={`${step.color} h-full rounded-full flex items-center justify-center text-white text-xs font-bold transition-all`}
                  style={{ width: `${Math.max(pct, 5)}%`, minWidth: "60px" }}
                >
                  {pctLabel ? `${pctLabel}%` : fmt(step.value)}
                </div>
              </div>
              {/* Conversion arrow between steps */}
              {i === 0 && (
                <div className="flex items-center justify-center gap-1 py-1">
                  <span className="text-xs text-muted-foreground">Taxa de Conversão:</span>
                  <span className={`text-sm font-bold ${conversionRate >= 30 ? "text-green-600" : conversionRate >= 15 ? "text-amber-600" : "text-red-600"}`}>
                    {conversionRate.toFixed(1)}%
                  </span>
                </div>
              )}
              {i === 1 && billingValue != null && (
                <div className="flex items-center justify-center gap-1 py-1">
                  <span className="text-xs text-muted-foreground">Pedido → Faturado:</span>
                  <span className={`text-sm font-bold ${billingRate >= 70 ? "text-green-600" : billingRate >= 40 ? "text-amber-600" : "text-red-600"}`}>
                    {billingRate.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
