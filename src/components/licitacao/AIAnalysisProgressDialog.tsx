import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, Brain, Sparkles, CheckCircle2, XCircle, Loader2,
  ClipboardList, Calendar, Package, AlertTriangle
} from "lucide-react";

export type AIAnalysisStep = {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  steps: AIAnalysisStep[];
  logs: string[];
  error?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
}

export const AI_STEPS = {
  upload: (status: AIAnalysisStep["status"], detail?: string): AIAnalysisStep => ({
    id: "upload", label: "Enviando arquivo", icon: <Upload className="h-4 w-4" />, status, detail,
  }),
  extract: (status: AIAnalysisStep["status"], detail?: string): AIAnalysisStep => ({
    id: "extract", label: "Extraindo texto do PDF", icon: <FileText className="h-4 w-4" />, status, detail,
  }),
  analyze: (status: AIAnalysisStep["status"], detail?: string): AIAnalysisStep => ({
    id: "analyze", label: "Analisando com IA", icon: <Brain className="h-4 w-4" />, status, detail,
  }),
  fields: (status: AIAnalysisStep["status"], detail?: string): AIAnalysisStep => ({
    id: "fields", label: "Preenchendo campos", icon: <Sparkles className="h-4 w-4" />, status, detail,
  }),
  checklist: (status: AIAnalysisStep["status"], detail?: string): AIAnalysisStep => ({
    id: "checklist", label: "Gerando checklist e tarefas", icon: <ClipboardList className="h-4 w-4" />, status, detail,
  }),
  compliance: (status: AIAnalysisStep["status"], detail?: string): AIAnalysisStep => ({
    id: "compliance", label: "Análise de conformidade", icon: <Package className="h-4 w-4" />, status, detail,
  }),
  creating: (status: AIAnalysisStep["status"], detail?: string): AIAnalysisStep => ({
    id: "creating", label: "Criando licitação", icon: <Calendar className="h-4 w-4" />, status, detail,
  }),
};

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span className="h-1 w-1 rounded-full bg-primary animate-[pulse_1s_ease-in-out_infinite]" />
      <span className="h-1 w-1 rounded-full bg-primary animate-[pulse_1s_ease-in-out_0.2s_infinite]" />
      <span className="h-1 w-1 rounded-full bg-primary animate-[pulse_1s_ease-in-out_0.4s_infinite]" />
    </span>
  );
}

function CircularProgress({ steps }: { steps: AIAnalysisStep[] }) {
  const total = steps.length;
  const done = steps.filter(s => s.status === "done").length;
  const hasError = steps.some(s => s.status === "error");
  const progress = total > 0 ? (done / total) * 100 : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={hasError ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
          strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {hasError ? (
          <AlertTriangle className="h-8 w-8 text-destructive" />
        ) : done === total ? (
          <CheckCircle2 className="h-8 w-8 text-primary animate-scale-in" />
        ) : (
          <span className="text-lg font-bold text-foreground">{Math.round(progress)}%</span>
        )}
      </div>
    </div>
  );
}

export function AIAnalysisProgressDialog({ open, onOpenChange, steps, logs, error, onRetry, onCancel }: Props) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const allDone = steps.length > 0 && steps.every(s => s.status === "done");
  const hasError = !!error || steps.some(s => s.status === "error");

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !hasError && !allDone) return; onOpenChange(v); }}>
      <DialogContent className="max-w-md" onPointerDownOutside={e => { if (!hasError && !allDone) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasError ? (
              <><AlertTriangle className="h-5 w-5 text-destructive" /> Erro na Análise</>
            ) : allDone ? (
              <><Sparkles className="h-5 w-5 text-primary" /> Análise Concluída!</>
            ) : (
              <><Brain className="h-5 w-5 text-primary" /> Analisando Edital<PulsingDots /></>
            )}
          </DialogTitle>
        </DialogHeader>

        <CircularProgress steps={steps} />

        {/* Steps */}
        <div className="space-y-1.5 mt-2">
          {steps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg transition-all duration-300",
                step.status === "running" && "bg-primary/5 border border-primary/20",
                step.status === "done" && "opacity-70",
                step.status === "error" && "bg-destructive/5 border border-destructive/20",
              )}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300",
                step.status === "pending" && "bg-muted text-muted-foreground",
                step.status === "running" && "bg-primary/10 text-primary",
                step.status === "done" && "bg-green-100 text-green-600 dark:bg-green-950/30 dark:text-green-400",
                step.status === "error" && "bg-destructive/10 text-destructive",
              )}>
                {step.status === "running" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : step.status === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : step.status === "error" ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-[10px] font-medium">{i + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm transition-all",
                  step.status === "running" && "font-medium text-primary",
                  step.status === "done" && "text-muted-foreground line-through",
                  step.status === "error" && "font-medium text-destructive",
                )}>
                  {step.label}
                  {step.status === "running" && <PulsingDots />}
                </p>
                {step.detail && (
                  <p className="text-[11px] text-muted-foreground truncate">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Log area */}
        {logs.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">Log</p>
            <ScrollArea className="h-24 rounded-lg border bg-muted/30 p-2">
              <div className="space-y-0.5 font-mono text-[10px] text-muted-foreground">
                {logs.map((log, i) => (
                  <div key={i} className="animate-fade-in flex gap-1.5">
                    <span className="text-primary/50 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                    <span className={cn(log.startsWith("❌") && "text-destructive", log.startsWith("✅") && "text-green-600 dark:text-green-400")}>
                      {log}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mt-1">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Actions */}
        {(hasError || allDone) && (
          <div className="flex gap-2 mt-2 justify-end">
            {hasError && onRetry && (
              <Button size="sm" variant="outline" onClick={onRetry}>
                Tentar novamente
              </Button>
            )}
            {hasError && onCancel && (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Criar manualmente
              </Button>
            )}
            {allDone && (
              <Button size="sm" onClick={() => onOpenChange(false)} className="animate-scale-in">
                <CheckCircle2 className="h-4 w-4 mr-1" /> Concluído
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
