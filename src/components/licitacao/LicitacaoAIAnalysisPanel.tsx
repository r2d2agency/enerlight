import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useLicitacaoAIAnalysis, useAnalyzeEdital, LicitacaoAIAnalysis } from "@/hooks/use-licitacao-ai";
import {
  Sparkles, Loader2, FileText, Calendar, ClipboardList, Package, ShieldCheck, AlertTriangle,
  Lightbulb, RefreshCw, CheckCircle2, XCircle, MinusCircle
} from "lucide-react";
import { cn, safeFormatDate } from "@/lib/utils";

interface Props {
  licitacaoId: string;
  editalUrl?: string | null;
}

export function LicitacaoAIAnalysis({ licitacaoId, editalUrl }: Props) {
  const { toast } = useToast();
  const { data: analysis, isLoading } = useLicitacaoAIAnalysis(licitacaoId);
  const analyzeEdital = useAnalyzeEdital();
  const [editalText, setEditalText] = useState("");
  const [showInput, setShowInput] = useState(false);

  const handleAnalyze = async () => {
    try {
      await analyzeEdital.mutateAsync({ licitacaoId, edital_text: editalText || undefined });
      setShowInput(false);
      setEditalText("");
      toast({ title: "Análise concluída! ✨" });
    } catch (e: any) {
      toast({ title: "Erro na análise", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  // No analysis yet
  if (!analysis) {
    return (
      <div className="space-y-3">
        <div className="text-center py-4 space-y-2">
          <Sparkles className="h-8 w-8 mx-auto text-primary/60" />
          <p className="text-sm font-medium">Análise por IA</p>
          <p className="text-xs text-muted-foreground">
            A IA analisa o edital e extrai: resumo, datas, documentos obrigatórios, itens do edital e conformidade com seus produtos.
          </p>
        </div>

        {!showInput ? (
          <div className="space-y-2">
            <Button onClick={() => setShowInput(true)} className="w-full" size="sm">
              <Sparkles className="h-4 w-4 mr-1" /> Analisar Edital com IA
            </Button>
            {editalUrl && (
              <p className="text-xs text-muted-foreground text-center">
                O edital enviado será utilizado automaticamente
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={editalText}
              onChange={e => setEditalText(e.target.value)}
              rows={6}
              placeholder="Cole aqui o texto completo do edital para análise..."
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {editalUrl ? "Opcional: cole texto adicional. O arquivo do edital já será analisado." : "Cole o texto do edital ou as informações mais relevantes."}
            </p>
            <div className="flex gap-2">
              <Button onClick={handleAnalyze} disabled={analyzeEdital.isPending} size="sm">
                {analyzeEdital.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {analyzeEdital.isPending ? "Analisando..." : "Analisar"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowInput(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Analysis failed
  if (analysis.status === "failed") {
    return (
      <div className="space-y-3">
        <div className="border border-destructive/30 rounded-lg p-3 bg-destructive/5 space-y-2">
          <p className="text-sm font-medium text-destructive flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Erro na análise</p>
          <p className="text-xs text-muted-foreground">{analysis.error_message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowInput(true)}>
          <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
        </Button>
        {showInput && (
          <div className="space-y-2">
            <Textarea value={editalText} onChange={e => setEditalText(e.target.value)} rows={4} placeholder="Cole o texto do edital..." className="text-sm" />
            <Button onClick={handleAnalyze} disabled={analyzeEdital.isPending} size="sm">
              {analyzeEdital.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Analisar
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Processing
  if (analysis.status === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Analisando edital...</p>
        <p className="text-xs text-muted-foreground">Isso pode levar até 1 minuto</p>
      </div>
    );
  }

  // Completed analysis
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Análise Concluída</span>
          {analysis.compliance_score !== null && (
            <Badge variant={analysis.compliance_score >= 70 ? "default" : analysis.compliance_score >= 40 ? "secondary" : "destructive"}
              className={cn("text-xs", analysis.compliance_score >= 70 && "bg-green-600")}>
              {analysis.compliance_score}% compatível
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowInput(true)}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reanalisar
        </Button>
      </div>

      {showInput && (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
          <Textarea value={editalText} onChange={e => setEditalText(e.target.value)} rows={4} placeholder="Cole novo texto do edital..." className="text-sm" />
          <div className="flex gap-2">
            <Button onClick={handleAnalyze} disabled={analyzeEdital.isPending} size="sm">
              {analyzeEdital.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Reanalisar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowInput(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="summary" className="mt-2">
        <TabsList className="w-full flex flex-wrap h-auto gap-1">
          <TabsTrigger value="summary" className="text-xs"><FileText className="h-3 w-3 mr-1" /> Resumo</TabsTrigger>
          <TabsTrigger value="dates" className="text-xs"><Calendar className="h-3 w-3 mr-1" /> Datas</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs"><ClipboardList className="h-3 w-3 mr-1" /> Documentos</TabsTrigger>
          <TabsTrigger value="items" className="text-xs"><Package className="h-3 w-3 mr-1" /> Itens</TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs"><ShieldCheck className="h-3 w-3 mr-1" /> Conformidade</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-3 space-y-3">
          {analysis.summary && (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{analysis.summary}</div>
          )}
          {analysis.risk_assessment && (
            <div className="border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
              <p className="text-sm font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /> Riscos e Atenção</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{analysis.risk_assessment}</p>
            </div>
          )}
          {analysis.recommendations && (
            <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 space-y-1">
              <p className="text-sm font-medium flex items-center gap-1.5 text-blue-700 dark:text-blue-400"><Lightbulb className="h-4 w-4" /> Recomendações</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{analysis.recommendations}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dates" className="mt-3">
          {analysis.dates_extracted && analysis.dates_extracted.length > 0 ? (
            <div className="space-y-2">
              {analysis.dates_extracted.map((d: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg border">
                  <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-sm text-primary">{d.date}</p>
                    {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma data extraída</p>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-3">
          {analysis.required_documents && analysis.required_documents.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-2">{analysis.required_documents.length} documentos obrigatórios identificados. Eles foram adicionados automaticamente ao checklist.</p>
              {analysis.required_documents.map((doc: any, i: number) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded border text-sm">
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{typeof doc === "string" ? doc : doc.name || doc.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento obrigatório identificado</p>
          )}
        </TabsContent>

        <TabsContent value="items" className="mt-3">
          {analysis.edital_items && analysis.edital_items.length > 0 ? (
            <div className="space-y-1">
              {analysis.edital_items.map((item: any, i: number) => (
                <div key={i} className="p-2 rounded border text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    {item.item_number && <Badge variant="outline" className="text-[10px]">Item {item.item_number}</Badge>}
                    <span className="font-medium">{item.description}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {item.quantity && <span>Qtd: {item.quantity}</span>}
                    {item.unit && <span>Und: {item.unit}</span>}
                    {item.estimated_value && <span>Valor: {item.estimated_value}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum item extraído</p>
          )}

          {/* Product matches */}
          {analysis.product_matches && analysis.product_matches.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><Package className="h-4 w-4 text-primary" /> Compatibilidade de Produtos</p>
              {analysis.product_matches.map((match: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded border text-sm">
                  {match.match_level === "total" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />}
                  {match.match_level === "parcial" && <MinusCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                  {(match.match_level === "não atende" || match.match_level === "nao_atende") && <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="font-medium">{match.edital_item}</p>
                    <p className="text-xs text-muted-foreground">
                      {match.product_name && <span className="text-primary">{match.product_name}</span>}
                      {match.notes && <span> — {match.notes}</span>}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] shrink-0",
                    match.match_level === "total" && "border-green-600 text-green-600",
                    match.match_level === "parcial" && "border-amber-500 text-amber-500",
                    (match.match_level === "não atende" || match.match_level === "nao_atende") && "border-destructive text-destructive",
                  )}>
                    {match.match_level === "total" ? "Atende" : match.match_level === "parcial" ? "Parcial" : "Não atende"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="compliance" className="mt-3 space-y-3">
          {analysis.compliance_score !== null && (
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div className={cn(
                "h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0",
                (analysis.compliance_score ?? 0) >= 70 ? "bg-green-600" : (analysis.compliance_score ?? 0) >= 40 ? "bg-amber-500" : "bg-destructive"
              )}>
                {analysis.compliance_score}%
              </div>
              <div>
                <p className="text-sm font-medium">Score de Conformidade</p>
                <p className="text-xs text-muted-foreground">
                  {(analysis.compliance_score ?? 0) >= 70 ? "Alta compatibilidade com o edital" : (analysis.compliance_score ?? 0) >= 40 ? "Compatibilidade parcial" : "Baixa compatibilidade"}
                </p>
              </div>
            </div>
          )}
          {analysis.compliance_analysis && (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{analysis.compliance_analysis}</div>
          )}
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-muted-foreground text-right">
        Analisado em {safeFormatDate(analysis.created_at, "dd/MM/yyyy HH:mm")} • {analysis.tokens_used} tokens • {analysis.model_used}
      </p>
    </div>
  );
}
