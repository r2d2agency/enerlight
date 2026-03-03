import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";

interface SyncStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

interface SyncProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  connectionName: string;
  type: "contacts" | "chats";
}

function formatDebug(debug: any): string {
  if (!debug) return '';
  const lines: string[] = [];
  
  if (debug.endpointResults) {
    lines.push('Endpoints tentados:');
    for (const ep of debug.endpointResults) {
      lines.push(`  ${ep.endpoint} → HTTP ${ep.statusCode} | ${ep.contactsFound} contatos`);
      if (ep.sample && ep.contactsFound === 0) {
        lines.push(`    Resposta: ${ep.sample.substring(0, 200)}`);
      }
    }
  }
  
  if (debug.chatFallback) {
    lines.push(`\nFallback via chats: ${debug.chatFallback.success ? 'OK' : 'Falha'} | ${debug.chatFallback.chatsCount || 0} chats`);
    if (debug.chatFallback.error) lines.push(`  Erro: ${debug.chatFallback.error}`);
  }
  
  if (debug.message) lines.push(`\n${debug.message}`);
  if (debug.instanceId) lines.push(`Instance: ${debug.instanceId}`);
  
  return lines.join('\n') || JSON.stringify(debug, null, 2);
}

export function SyncProgressDialog({ open, onOpenChange, connectionId, connectionName, type }: SyncProgressDialogProps) {
  const [steps, setSteps] = useState<SyncStep[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [chatPeriod, setChatPeriod] = useState("30");

  const updateStep = useCallback((id: string, updates: Partial<SyncStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const addStep = useCallback((step: SyncStep) => {
    setSteps(prev => [...prev, step]);
  }, []);

  const startSync = useCallback(async () => {
    setRunning(true);
    setFinished(false);
    setSteps([]);

    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const token = localStorage.getItem('token');

    // Step 1: Connecting
    const step1: SyncStep = { id: "connect", label: "Conectando ao W-API...", status: "running" };
    addStep(step1);

    try {
      // Step 1: Verify connection status
      const statusResult = await api<{ status: string; phoneNumber?: string }>(`/api/evolution/${connectionId}/status`);
      
      if (statusResult.status !== 'connected') {
        updateStep("connect", { status: "error", detail: "Conexão não está conectada ao WhatsApp" });
        setRunning(false);
        setFinished(true);
        return;
      }
      updateStep("connect", { status: "done", detail: `Conectado: ${statusResult.phoneNumber || 'OK'}` });

      if (type === "contacts") {
        await syncContacts();
      } else {
        await syncChats();
      }
    } catch (err: any) {
      updateStep("connect", { status: "error", detail: err.message || "Erro ao verificar conexão" });
      setRunning(false);
      setFinished(true);
    }
  }, [connectionId, type, chatPeriod]);

  const syncContacts = async () => {
    // Step 2: Fetching contacts
    const step2: SyncStep = { id: "fetch", label: "Buscando contatos no WhatsApp...", status: "running" };
    setSteps(prev => [...prev, step2]);

    try {
      const result = await api<{
        success: boolean;
        total: number;
        imported: number;
        updated: number;
        skipped: number;
        error?: string;
        debug?: any;
      }>(`/api/wapi/${connectionId}/sync-contacts`, { method: 'POST' });

      if (!result.success) {
        setSteps(prev => prev.map(s => s.id === "fetch" ? { ...s, status: "error", detail: result.error || "Falha ao buscar contatos" } : s));
        
        if (result.debug) {
          setSteps(prev => [...prev, {
            id: "debug",
            label: "Diagnóstico detalhado",
            status: "error",
            detail: formatDebug(result.debug)
          }]);
        }
        setRunning(false);
        setFinished(true);
        return;
      }

      setSteps(prev => prev.map(s => s.id === "fetch" ? {
        ...s,
        status: result.total > 0 ? "done" : "error",
        detail: result.total > 0 
          ? `${result.total} contatos encontrados`
          : `0 contatos encontrados (nenhum endpoint retornou dados)`
      } : s));

      // Step 3: Import results
      setSteps(prev => [...prev, {
        id: "import",
        label: "Sincronização concluída",
        status: result.total > 0 ? "done" : "error",
        detail: result.total > 0 
          ? `✅ ${result.imported} novos | 🔄 ${result.updated} atualizados | ⏭️ ${result.skipped} ignorados`
          : `Nenhum contato foi importado`
      }]);

      // Show debug info if 0 contacts
      if (result.total === 0 && result.debug) {
        setSteps(prev => [...prev, {
          id: "debug",
          label: "Diagnóstico - Respostas da W-API",
          status: "error",
          detail: formatDebug(result.debug)
        }]);
      }

      setRunning(false);
      setFinished(true);
    } catch (err: any) {
      setSteps(prev => prev.map(s => s.id === "fetch" ? { ...s, status: "error", detail: err.message } : s));
      setRunning(false);
      setFinished(true);
    }
  };

  const syncChats = async () => {
    // Step 2: Fetching chats
    const step2: SyncStep = { id: "fetch", label: "Buscando conversas no WhatsApp...", status: "running" };
    setSteps(prev => [...prev, step2]);

    try {
      const result = await api<{
        success: boolean;
        total: number;
        imported: number;
        updated: number;
        skipped: number;
        error?: string;
        debug?: any;
      }>(`/api/wapi/${connectionId}/sync-chats`, {
        method: 'POST',
        body: { maxDays: parseInt(chatPeriod) },
      });

      if (!result.success) {
        setSteps(prev => prev.map(s => s.id === "fetch" ? { ...s, status: "error", detail: result.error || "Falha ao buscar conversas" } : s));
        
        if (result.debug) {
          setSteps(prev => [...prev, {
            id: "debug",
            label: "Diagnóstico detalhado",
            status: "error",
            detail: formatDebug(result.debug)
          }]);
        }
        setRunning(false);
        setFinished(true);
        return;
      }

      setSteps(prev => prev.map(s => s.id === "fetch" ? {
        ...s,
        status: "done",
        detail: `${result.total} conversas encontradas`
      } : s));

      // Step 3: Import results
      setSteps(prev => [...prev, {
        id: "import",
        label: "Sincronização concluída",
        status: "done",
        detail: `✅ ${result.imported} novas | 🔄 ${result.updated} atualizadas | ⏭️ ${result.skipped} ignoradas`
      }]);

      setRunning(false);
      setFinished(true);
    } catch (err: any) {
      setSteps(prev => prev.map(s => s.id === "fetch" ? { ...s, status: "error", detail: err.message } : s));
      setRunning(false);
      setFinished(true);
    }
  };

  const handleClose = () => {
    if (!running) {
      setSteps([]);
      setFinished(false);
      onOpenChange(false);
    }
  };

  const stepIcon = (status: SyncStep["status"]) => {
    switch (status) {
      case "pending": return <div className="w-5 h-5 rounded-full border-2 border-muted" />;
      case "running": return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      case "done": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "error": return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const progressValue = steps.length === 0 ? 0 : 
    Math.round((steps.filter(s => s.status === "done" || s.status === "error").length / Math.max(steps.length, 3)) * 100);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {type === "contacts" ? "Sincronizar Contatos" : "Sincronizar Conversas"}
          </DialogTitle>
          <DialogDescription>
            {connectionName}
          </DialogDescription>
        </DialogHeader>

        {!running && !finished && (
          <div className="space-y-4">
            {type === "chats" && (
              <div className="space-y-2">
                <Label>Período de sincronização</Label>
                <Select value={chatPeriod} onValueChange={setChatPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="15">Últimos 15 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="60">Últimos 2 meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {type === "contacts" 
                ? "Irá buscar todos os contatos salvos no WhatsApp e sincronizar com o sistema."
                : `Irá buscar as conversas dos últimos ${chatPeriod} dias e criar/atualizar no sistema.`
              }
            </div>

            <Button onClick={startSync} className="w-full">
              Iniciar Sincronização
            </Button>
          </div>
        )}

        {(running || finished) && (
          <div className="space-y-4">
            <Progress value={progressValue} className="h-2" />
            
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-3">
                {steps.map((step) => (
                  <div key={step.id} className="flex gap-3 items-start">
                    <div className="mt-0.5 flex-shrink-0">
                      {stepIcon(step.status)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{step.label}</p>
                      {step.detail && (
                        <p className={`text-xs mt-0.5 ${
                          step.status === "error" ? "text-destructive" : "text-muted-foreground"
                        } ${step.id === "debug" ? "font-mono whitespace-pre-wrap break-all" : ""}`}>
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {finished && (
              <Button onClick={handleClose} variant="outline" className="w-full">
                Fechar
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
