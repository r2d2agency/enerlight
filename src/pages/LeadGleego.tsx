import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const LeadGleego = () => {
  const [loading, setLoading] = useState(false);

  const handleOpenLeadGleego = async () => {
    setLoading(true);
    try {
      const data = await api<{ redirect_url: string }>("/api/organizations/lead-gleego/sso", {
        method: "POST",
      });
      
      if (data.redirect_url) {
        window.open(data.redirect_url, "_blank");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao acessar Lead Gleego");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-foreground">Lead Gleego</h1>
          <p className="mt-1 text-muted-foreground">
            Acesse o sistema de prospecção de leads integrado
          </p>
        </div>

        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md animate-fade-in shadow-card">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Lead Gleego</CardTitle>
              <CardDescription>
                Clique no botão abaixo para acessar o sistema de prospecção com login automático (SSO)
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button
                onClick={handleOpenLeadGleego}
                disabled={loading}
                size="lg"
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-5 w-5" />
                    Acessar Lead Gleego
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default LeadGleego;
