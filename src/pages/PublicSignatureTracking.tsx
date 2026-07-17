import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Download, FileSignature, MapPin, ScanFace, ShieldCheck, XCircle, Loader2 } from "lucide-react";
import { useDocumentSignatures } from "@/hooks/use-document-signatures";

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Rascunho", cls: "bg-muted text-foreground" },
    pending: { label: "Aguardando assinaturas", cls: "bg-yellow-100 text-yellow-800" },
    partially_signed: { label: "Parcialmente assinado", cls: "bg-blue-100 text-blue-800" },
    completed: { label: "Concluído", cls: "bg-green-100 text-green-800" },
    cancelled: { label: "Cancelado", cls: "bg-red-100 text-red-800" },
  };
  const m = map[status] || { label: status, cls: "bg-muted" };
  return <Badge className={m.cls} variant="outline">{m.label}</Badge>;
};

export default function PublicSignatureTracking() {
  const { slug } = useParams<{ slug: string }>();
  const { getTracking } = useDocumentSignatures();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getTracking(slug).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [slug, getTracking]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full"><CardContent className="pt-6 text-center space-y-3">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="font-semibold">Documento não encontrado</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-xl flex items-center gap-2"><FileSignature className="h-5 w-5" />{data.title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Rastreio público de assinaturas</p>
              </div>
              <StatusBadge status={data.status} />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Criado em</div>
              <div>{new Date(data.created_at).toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Concluído em</div>
              <div>{data.completed_at ? new Date(data.completed_at).toLocaleString("pt-BR") : "—"}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Hash de integridade (SHA-256)</div>
              <code className="text-[10px] break-all">{data.document_hash || "—"}</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Signatários</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.signers.map((s: any, i: number) => (
              <div key={i} className="border rounded-md p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{s.name} <span className="text-xs text-muted-foreground">— {s.role || "Signatário"}</span></div>
                    <div className="text-xs text-muted-foreground">{s.email_masked}</div>
                  </div>
                  {s.status === "signed" ? (
                    <div className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle2 className="h-4 w-4" />Assinado</div>
                  ) : (
                    <div className="flex items-center gap-1 text-yellow-600 text-sm"><Clock className="h-4 w-4" />Pendente</div>
                  )}
                </div>
                {s.status === "signed" && (
                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1 pt-1">
                    <div>Em: {s.signed_at ? new Date(s.signed_at).toLocaleString("pt-BR") : "—"}</div>
                    <div>IP: {s.ip || "—"}</div>
                    <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.geolocation || "—"}</div>
                    <div className="flex items-center gap-1"><ScanFace className="h-3 w-3" />Biometria: {s.biometric_status === "passed" ? "✓ Validada" : s.biometric_status || "—"}</div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {data.is_completed && data.download_url && (
          <Card>
            <CardContent className="pt-6 text-center">
              <Button asChild>
                <a href={data.download_url} target="_blank" rel="noopener" download>
                  <Download className="h-4 w-4 mr-2" />Baixar contrato assinado
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Auditoria</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs">
              {data.audit_log.map((a: any, i: number) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-40">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                  <code className="bg-muted px-1 rounded">{a.action}</code>
                  {a.ip_address && <span className="text-muted-foreground">{a.ip_address}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-6">
          Documento com validade jurídica conforme MP 2.200-2/2001, Art. 10, §2º.
        </p>
      </div>
    </div>
  );
}
