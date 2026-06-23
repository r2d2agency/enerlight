import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDevolucaoSlaConfig, useDevolucaoSlaConfigMutations, STATUS_LABELS, DevolucaoStatus } from "@/hooks/use-devolucoes";
import { DEFAULT_SLA_HOURS } from "@/lib/devolucao-sla";
import { Clock, Loader2, RotateCcw, Save } from "lucide-react";

const EDITABLE_STATUSES: DevolucaoStatus[] = [
  'solicitado',
  'aguardando_nf_produto',
  'recebido',
  'em_analise',
  'cliente_notificado',
  'aguardando_nf_retorno',
  'troca_conserto',
  'enviado',
];

export function DevolucaoSLAConfigPanel() {
  const { data: savedConfig, isLoading } = useDevolucaoSlaConfig();
  const saveMutation = useDevolucaoSlaConfigMutations();
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    if (savedConfig) {
      setValues({ ...DEFAULT_SLA_HOURS, ...savedConfig });
    }
  }, [savedConfig]);

  const handleChange = (status: string, raw: string) => {
    const hours = parseInt(raw.replace(/\D/g, ''), 10);
    setValues(prev => ({ ...prev, [status]: Number.isNaN(hours) ? 0 : hours }));
  };

  const handleReset = () => {
    setValues({ ...DEFAULT_SLA_HOURS });
  };

  const handleSave = () => {
    const payload: Record<string, number> = {};
    for (const status of EDITABLE_STATUSES) {
      const h = values[status];
      if (typeof h === 'number' && h >= 1) payload[status] = h;
    }
    saveMutation.mutate(payload);
  };

  const hasChanges = savedConfig && EDITABLE_STATUSES.some(s => (savedConfig[s] ?? DEFAULT_SLA_HOURS[s]) !== values[s]);

  if (isLoading) {
    return (
      <Card className="animate-fade-in shadow-card">
        <CardContent className="py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
          <span className="text-muted-foreground">Carregando configurações de SLA...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          SLA de Devoluções (RMA)
        </CardTitle>
        <CardDescription>
          Defina o tempo máximo (em horas) que cada etapa do processo de devolução pode permanecer sem movimentação.
          Os alertas de "vencendo" aparecem quando restam menos de 25% do prazo configurado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EDITABLE_STATUSES.map(status => (
            <div key={status} className="space-y-2 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor={`sla-${status}`} className="text-sm font-medium">
                  {STATUS_LABELS[status]}
                </Label>
                {values[status] !== DEFAULT_SLA_HOURS[status] && (
                  <Badge variant="outline" className="text-[10px]">Alterado</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id={`sla-${status}`}
                  type="number"
                  min={1}
                  value={values[status] ?? DEFAULT_SLA_HOURS[status]}
                  onChange={(e) => handleChange(status, e.target.value)}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">horas</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Padrão: {DEFAULT_SLA_HOURS[status]}h
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            As mudanças são aplicadas imediatamente no kanban, lista e contadores de SLA.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} disabled={saveMutation.isPending}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar padrão
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending || !hasChanges}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar SLA
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
