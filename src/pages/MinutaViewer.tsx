import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDocumentSignatures } from "@/hooks/use-document-signatures";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Lock, ShieldAlert, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, ThumbsUp, MessageSquareWarning } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function MinutaViewer() {
  const { token } = useParams<{ token: string }>();
  const { getDraftInfo, authDraft, requestDraftPassword } = useDocumentSignatures();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ document_title: string; recipient_name: string; recipient_email_masked: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [session, setSession] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<{ name: string; email: string } | null>(null);

  const [passwordSent, setPasswordSent] = useState(false);
  const [sendingPwd, setSendingPwd] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!token) return;
    getDraftInfo(token)
      .then(setInfo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, getDraftInfo]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleRequestPassword = async () => {
    if (!token) return;
    setSendingPwd(true);
    try {
      const r = await requestDraftPassword(token);
      setPasswordSent(true);
      setCooldown(30);
      toast.success(r.message || "Senha enviada para seu e-mail");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar senha");
    } finally {
      setSendingPwd(false);
    }
  };


  // Anti-print / anti-download client-side hardening while viewing
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Bloqueia Ctrl+P (print), Ctrl+S (save), Ctrl+Shift+S, Ctrl+Shift+I (devtools),
      // Ctrl+U (view-source), F12 (devtools), PrintScreen
      if (
        (e.ctrlKey || e.metaKey) && ["p", "s", "u"].includes(k) ||
        (e.ctrlKey && e.shiftKey && ["i", "j", "c", "s"].includes(k)) ||
        k === "f12" ||
        k === "printscreen"
      ) {
        e.preventDefault();
        toast.error("Ação bloqueada nesta minuta");
      }
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    const onBefore = (e: BeforeUnloadEvent) => { /* noop */ };
    const onPrint = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("contextmenu", onCtx, true);
    window.addEventListener("beforeprint", onPrint, true);
    window.addEventListener("beforeunload", onBefore);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("contextmenu", onCtx, true);
      window.removeEventListener("beforeprint", onPrint, true);
      window.removeEventListener("beforeunload", onBefore);
    };
  }, [session]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !password.trim()) return;
    setSubmitting(true);
    try {
      const r = await authDraft(token, password.trim());
      setSession(r.session_token);
      setRecipient({ name: r.recipient_name, email: r.recipient_email });
      toast.success("Acesso liberado");
    } catch (err: any) {
      toast.error(err.message || "Senha incorreta");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <ShieldAlert className="h-14 w-14 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Link indisponível</h2>
            <p className="text-muted-foreground text-sm">{error || "Este link não é válido, foi revogado ou expirou."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============= PASSWORD GATE =============
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary">
              <Lock className="h-5 w-5" />
              <CardTitle className="text-lg">Minuta protegida</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 mb-4">
              <p className="text-sm text-muted-foreground">Documento</p>
              <p className="font-medium">{info.document_title}</p>
            </div>
            <div className="space-y-1 mb-4">
              <p className="text-sm text-muted-foreground">Destinatário</p>
              <p className="font-medium">{info.recipient_name}</p>
              <p className="text-xs text-muted-foreground">{info.recipient_email_masked}</p>
            </div>
            {!passwordSent ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Por segurança, uma nova senha de acesso é gerada e enviada ao seu e-mail
                  <strong className="text-foreground"> {info.recipient_email_masked} </strong>
                  a cada tentativa de abertura.
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleRequestPassword}
                  disabled={sendingPwd}
                >
                  {sendingPwd && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Enviar senha para meu e-mail
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAuth} className="space-y-3">
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  ✉️ Senha enviada para <strong>{info.recipient_email_masked}</strong>. Verifique sua caixa de entrada (e o spam).
                </div>
                <div>
                  <Label>Senha de acesso</Label>
                  <div className="relative">
                    <Input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value.toUpperCase())}
                      placeholder="Informe a senha recebida por e-mail"
                      autoComplete="off"
                      autoFocus
                      className="pr-10 uppercase tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={submitting || !password}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Abrir minuta
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs"
                  onClick={handleRequestPassword}
                  disabled={sendingPwd || cooldown > 0}
                >
                  {cooldown > 0 ? `Reenviar senha em ${cooldown}s` : "Não recebi — reenviar senha"}
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Este documento é <strong>somente leitura</strong>. Download, impressão e cópia estão desativados. Todo acesso é registrado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============= VIEW ONLY =============
  const fileUrl = `${API_URL}/api/document-signatures/draft/${token}/file?session=${encodeURIComponent(session)}`;
  const watermarkText = `${recipient?.name || ""} • ${recipient?.email || ""} • ${new Date().toLocaleString("pt-BR")}`;

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      <style>{`
        @media print { body, html { display: none !important; } }
        .minuta-noselect { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .minuta-watermark {
          position: absolute; inset: 0; pointer-events: none; overflow: hidden;
          background-image: repeating-linear-gradient(
            -30deg,
            transparent 0, transparent 220px,
            rgba(0,0,0,0.06) 220px, rgba(0,0,0,0.06) 221px
          );
          z-index: 5;
        }
        .minuta-watermark span {
          position: absolute; color: rgba(0,0,0,0.14); font-size: 14px; font-weight: 600;
          transform: rotate(-30deg); white-space: nowrap;
        }
      `}</style>

      <div className="bg-neutral-800 px-4 py-3 flex items-center justify-between border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <span className="text-sm font-medium truncate">{info.document_title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Lock className="h-3 w-3" />
          Somente leitura
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden minuta-noselect">
        {/* Watermark tiles */}
        <div className="minuta-watermark">
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              style={{
                top: `${(i * 90) % 2000}px`,
                left: `${((i * 340) % 1600) - 100}px`,
              }}
            >
              {watermarkText}
            </span>
          ))}
        </div>

        {/* Bloqueia interações extras via um overlay transparente (permite scroll do iframe) */}
        <iframe
          title="Minuta"
          src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=1&statusbar=0&messages=0&view=FitH`}
          className="w-full h-full bg-white"
          style={{ border: 0, minHeight: "calc(100vh - 52px)" }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div className="bg-neutral-800 px-4 py-2 text-[11px] text-neutral-400 text-center border-t border-neutral-700">
        Documento pessoal para {recipient?.name} — download, impressão e cópia estão desabilitados. Toda visualização é registrada.
      </div>
    </div>
  );
}
