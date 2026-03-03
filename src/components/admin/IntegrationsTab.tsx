import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Eye, EyeOff, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface SystemSetting {
  key: string;
  value: string;
}

export function IntegrationsTab() {
  const [cnpjApiUrl, setCnpjApiUrl] = useState("");
  const [cnpjApiToken, setCnpjApiToken] = useState("");
  const [showCnpjToken, setShowCnpjToken] = useState(false);

  const [wapiIntegratorToken, setWapiIntegratorToken] = useState("");
  const [showWapiToken, setShowWapiToken] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWapi, setSavingWapi] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await api<SystemSetting[]>("/api/admin/settings");
      for (const s of settings) {
        if (s.key === "cnpj_api_url") setCnpjApiUrl(s.value || "");
        if (s.key === "cnpj_api_token") setCnpjApiToken(s.value || "");
        if (s.key === "wapi_integrator_token") setWapiIntegratorToken(s.value || "");
      }
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
            Com esse token, o sistema cria a instância na W-API e preenche os dados automaticamente.
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
              . Com ele configurado, novas conexões W-API terão a instância criada automaticamente.
            </p>
          </div>

          <Button onClick={handleSaveWapi} disabled={savingWapi}>
            {savingWapi ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Token W-API
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
