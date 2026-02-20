import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ExternalLink, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface SystemSetting {
  key: string;
  value: string;
}

export function IntegrationsTab() {
  const [cnpjApiUrl, setCnpjApiUrl] = useState("https://cnpj.gleego.com.br");
  const [cnpjApiToken, setCnpjApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await api<SystemSetting[]>("/api/admin/settings");
      for (const s of settings) {
        if (s.key === "cnpj_api_url") setCnpjApiUrl(s.value || "https://cnpj.gleego.com.br");
        if (s.key === "cnpj_api_token") setCnpjApiToken(s.value || "");
      }
    } catch {
      // Settings might not exist yet
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Consulta de CNPJ
            <a
              href="https://cnpj.gleego.com.br/api-docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardTitle>
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
              placeholder="https://cnpj.gleego.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label>Token da API</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? "text" : "password"}
                  value={cnpjApiToken}
                  onChange={(e) => setCnpjApiToken(e.target.value)}
                  placeholder="Seu token de API..."
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Obtenha seu token em{" "}
              <a href="https://cnpj.gleego.com.br" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
                cnpj.gleego.com.br
              </a>{" "}
              na seção Credenciais API. Sem token configurado, será usado a BrasilAPI (gratuita, sem sócios).
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Configurações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
