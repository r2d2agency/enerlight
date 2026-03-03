import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Eye, EyeOff, Zap, Webhook } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface SystemSetting {
  key: string;
  value: string;
}

const WEBHOOK_KEYS = [
  { key: "wapi_webhook_connected", label: "Conectado (onWebhookConnected)", placeholder: "https://..." },
  { key: "wapi_webhook_disconnected", label: "Desconectado (onWhatsappDisconnected)", placeholder: "https://..." },
  { key: "wapi_webhook_message_received", label: "Recebimento (onMessageReceived)", placeholder: "https://..." },
  { key: "wapi_webhook_message_send", label: "Envio (onMessageSend)", placeholder: "https://..." },
  { key: "wapi_webhook_message_status", label: "Status da Mensagem (onMessageStatusChanges)", placeholder: "https://..." },
];

export function IntegrationsTab() {
  const [cnpjApiUrl, setCnpjApiUrl] = useState("");
  const [cnpjApiToken, setCnpjApiToken] = useState("");
  const [showCnpjToken, setShowCnpjToken] = useState(false);

  const [wapiIntegratorToken, setWapiIntegratorToken] = useState("");
  const [showWapiToken, setShowWapiToken] = useState(false);

  const [webhookUrls, setWebhookUrls] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWapi, setSavingWapi] = useState(false);
  const [savingWebhooks, setSavingWebhooks] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await api<SystemSetting[]>("/api/admin/settings");
      const wh: Record<string, string> = {};
      for (const s of settings) {
        if (s.key === "cnpj_api_url") setCnpjApiUrl(s.value || "");
        if (s.key === "cnpj_api_token") setCnpjApiToken(s.value || "");
        if (s.key === "wapi_integrator_token") setWapiIntegratorToken(s.value || "");
        if (s.key.startsWith("wapi_webhook_")) wh[s.key] = s.value || "";
      }
      setWebhookUrls(wh);
    } catch {
      // Settings might not exist yet
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCnpj = async () => {
    setSaving(true);
    try {
      await Promise.all([
        api("/api/admin/settings/cnpj_api_url", { method: "PATCH", body: { value: cnpjApiUrl } }),
        api("/api/admin/settings/cnpj_api_token", { method: "PATCH", body: { value: cnpjApiToken } }),
      ]);
      toast.success("Configurações de CNPJ salvas com sucesso!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWapi = async () => {
    setSavingWapi(true);
    try {
      await api("/api/admin/settings/wapi_integrator_token", {
        method: "PATCH",
        body: { value: wapiIntegratorToken },
      });
      toast.success("Token W-API Integrador salvo com sucesso!");
    } catch {
      toast.error("Erro ao salvar token W-API");
    } finally {
      setSavingWapi(false);
    }
  };

  const handleSaveWebhooks = async () => {
    setSavingWebhooks(true);
    try {
      await Promise.all(
        WEBHOOK_KEYS.map(({ key }) =>
          api(`/api/admin/settings/${key}`, {
            method: "PATCH",
            body: { value: webhookUrls[key] || "" },
          })
        )
      );
      toast.success("URLs de Webhooks salvos com sucesso!");
    } catch {
      toast.error("Erro ao salvar webhooks");
    } finally {
      setSavingWebhooks(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* W-API Integrator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle>W-API Integrador</CardTitle>
          </div>
          <CardDescription>
            Configure o token de integrador da W-API para criar instâncias automaticamente ao adicionar novas conexões WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Token do Integrador</Label>
            <div className="relative">
              <Input
                type={showWapiToken ? "text" : "password"}
                value={wapiIntegratorToken}
                onChange={(e) => setWapiIntegratorToken(e.target.value)}
                placeholder="Seu token de integrador W-API..."
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowWapiToken(!showWapiToken)}
              >
                {showWapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtenha seu token de integrador em{" "}
              <a href="https://w-api.app" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                w-api.app
              </a>
            </p>
          </div>

          <Button onClick={handleSaveWapi} disabled={savingWapi}>
            {savingWapi ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Token W-API
          </Button>
        </CardContent>
      </Card>

      {/* W-API Webhooks */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <CardTitle>Webhooks W-API</CardTitle>
          </div>
          <CardDescription>
            Configure as URLs dos webhooks que serão ativados automaticamente ao criar novas instâncias W-API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {WEBHOOK_KEYS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label className="text-sm">{label}</Label>
              <Input
                value={webhookUrls[key] || ""}
                onChange={(e) => setWebhookUrls((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
              />
            </div>
          ))}

          <Button onClick={handleSaveWebhooks} disabled={savingWebhooks}>
            {savingWebhooks ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Webhooks
          </Button>
        </CardContent>
      </Card>

      {/* CNPJ */}
      <Card>
        <CardHeader>
          <CardTitle>Consulta de CNPJ</CardTitle>
          <CardDescription>
            Configure a API de consulta de CNPJ para preencher automaticamente dados de empresas e sócios ao criar negociações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL da API</Label>
            <Input
              value={cnpjApiUrl}
              onChange={(e) => setCnpjApiUrl(e.target.value)}
              placeholder="https://sua-api-cnpj.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label>Token da API</Label>
            <div className="relative">
              <Input
                type={showCnpjToken ? "text" : "password"}
                value={cnpjApiToken}
                onChange={(e) => setCnpjApiToken(e.target.value)}
                placeholder="Seu token de API..."
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowCnpjToken(!showCnpjToken)}
              >
                {showCnpjToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure a URL e o token da sua API de consulta CNPJ. Sem token configurado, será usado a BrasilAPI (gratuita, sem sócios).
            </p>
          </div>

          <Button onClick={handleSaveCnpj} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Configurações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
