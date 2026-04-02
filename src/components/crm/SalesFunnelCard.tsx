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
}

export function SalesFunnelCard({
  quotesValue,
  quotesCount,
  ordersValue,
  ordersCount,
  billingValue,
  billingCount,
  title = "Funil de Vendas",
}: SalesFunnelCardProps) {
  const conversionRate = quotesCount > 0 ? (ordersCount / quotesCount) * 100 : 0;
  const billingRate = ordersCount > 0 && billingCount != null ? (billingCount / ordersCount) * 100 : 0;

  const steps = [
    {
      label: "Orçamentos",
      value: quotesValue,
      count: quotesCount,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      width: "100%",
    },
    {
      label: "Pedidos",
      value: ordersValue,
      count: ordersCount,
      color: "bg-green-500",
      textColor: "text-green-600",
      width: quotesValue > 0 ? `${Math.max((ordersValue / quotesValue) * 100, 15)}%` : "15%",
    },
  ];

  if (billingValue != null && billingCount != null) {
    steps.push({
      label: "Faturamento",
      value: billingValue,
      count: billingCount,
      color: "bg-amber-500",
      textColor: "text-amber-600",
      width: quotesValue > 0 ? `${Math.max((billingValue / quotesValue) * 100, 10)}%` : "10%",
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
        {steps.map((step, i) => (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium ${step.textColor}`}>{step.label}</span>
              <span className="text-muted-foreground">
                {step.count} • {fmt(step.value)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-7 overflow-hidden">
              <div
                className={`${step.color} h-full rounded-full flex items-center justify-center text-white text-xs font-bold transition-all`}
                style={{ width: step.width, minWidth: "60px" }}
              >
                {fmt(step.value)}
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
        ))}
      </CardContent>
    </Card>
  );
}
