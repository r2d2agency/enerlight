import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDocumentSignatures } from "@/hooks/use-document-signatures";
import { useThemedBranding } from "@/hooks/use-branding";
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
  const { branding } = useThemedBranding();
  const { getDraftInfo, authDraft, requestDraftPassword, respondDraft } = useDocumentSignatures();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ document_title: string; recipient_name: string; recipient_email_masked: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [session, setSession] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<{ name: string; email: string } | null>(null);
  const [response, setResponse] = useState<{ status: "pending" | "accepted" | "objected"; reason?: string | null; at?: string | null }>({ status: "pending" });
  const [showObjectionDialog, setShowObjectionDialog] = useState(false);
  const [objectionReason, setObjectionReason] = useState("");
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [respondingStatus, setRespondingStatus] = useState<null | "accepted" | "objected">(null);

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
      setResponse({
        status: (r.response_status as any) || "pending",
        reason: r.response_reason,
        at: r.responded_at,
      });
      toast.success("Acesso liberado");
    } catch (err: any) {
      toast.error(err.message || "Senha incorreta");
    } finally {
      setSubmitting(false);
    }
  };

  const submitResponse = async (status: "accepted" | "objected", reason?: string) => {
    if (!token || !session) return;
    setRespondingStatus(status);
    try {
      const r = await respondDraft(token, session, status, reason);
      setResponse({ status: r.response_status, reason: r.response_reason, at: r.responded_at });
      setShowObjectionDialog(false);
      setConfirmAccept(false);
      toast.success(status === "accepted" ? "Aceite registrado com sucesso" : "Ressalva registrada com sucesso");
    } catch (err: any) {
      toast.error(err.message || "Falha ao registrar resposta");
    } finally {
      setRespondingStatus(null);
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
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex flex-col items-center py-6 px-3">
      <style>{`
        @media print { body, html { display: none !important; } }
        .minuta-noselect { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        .minuta-watermark {
          position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 5;
        }
        .minuta-watermark span {
          position: absolute; color: rgba(0,0,0,0.10); font-size: 12px; font-weight: 600;
          transform: rotate(-30deg); white-space: nowrap;
        }
      `}</style>

      {/* Header com logo Enerlight */}
      <div className="w-full max-w-4xl flex flex-col items-center gap-3 mb-4">
        {branding.logo_login ? (
          <img src={branding.logo_login} alt={branding.company_name || "Enerlight"} className="h-12 object-contain" />
        ) : (
          <div className="text-2xl font-bold tracking-wide">{branding.company_name || "ENERLIGHT"}</div>
        )}
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <Lock className="h-3 w-3" />
          Minuta confidencial • Somente leitura
        </div>
      </div>

      {/* Caixa central de leitura */}
      <div className="w-full max-w-4xl bg-white text-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-neutral-100 border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-neutral-600 shrink-0" />
            <span className="text-sm font-semibold truncate text-neutral-800">{info.document_title}</span>
          </div>
          <span className="text-[11px] text-neutral-500 shrink-0">Destinatário: {recipient?.name}</span>
        </div>

        <div className="relative minuta-noselect" style={{ height: "min(70vh, 720px)" }}>
          <div className="minuta-watermark">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} style={{ top: `${(i * 110) % 1400}px`, left: `${((i * 280) % 1200) - 60}px` }}>
                {watermarkText}
              </span>
            ))}
          </div>
          <iframe
            title="Minuta"
            src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=1&statusbar=0&messages=0&view=FitH`}
            className="w-full h-full bg-white"
            style={{ border: 0 }}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>

      {/* Barra de resposta sempre visível abaixo da caixa */}
      <div className="w-full max-w-4xl mt-4">
        {response.status === "pending" ? (
          <div className="bg-neutral-800/80 border border-neutral-700 rounded-xl px-4 py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shadow-lg">
            <div className="flex-1 text-xs text-neutral-300 leading-snug">
              Ao final da leitura, registre sua resposta. Esta escolha ficará registrada no histórico da minuta e será enviada a quem emitiu o documento.
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                variant="destructive"
                onClick={() => setShowObjectionDialog(true)}
                disabled={!!respondingStatus}
                className="gap-2"
              >
                <MessageSquareWarning className="h-4 w-4" />
                Registrar ressalva
              </Button>
              <Button
                onClick={() => setConfirmAccept(true)}
                disabled={!!respondingStatus}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <ThumbsUp className="h-4 w-4" />
                Estou de acordo
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={`border rounded-xl px-4 py-3 flex items-start sm:items-center gap-3 shadow-lg ${
              response.status === "accepted"
                ? "bg-emerald-950/70 border-emerald-800 text-emerald-100"
                : "bg-amber-950/70 border-amber-800 text-amber-100"
            }`}
          >
            {response.status === "accepted" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" />
            )}
            <div className="flex-1 text-sm">
              <div className="font-semibold">
                {response.status === "accepted" ? "De acordo com a minuta" : "Ressalva registrada"}
                {response.at && (
                  <span className="ml-2 text-xs opacity-80 font-normal">
                    em {new Date(response.at).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
              {response.status === "objected" && response.reason && (
                <div className="text-xs mt-1 whitespace-pre-wrap opacity-90">
                  <span className="font-medium">Motivo:</span> {response.reason}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-4xl mt-3 text-[11px] text-neutral-500 text-center">
        Documento pessoal para {recipient?.name} — download, impressão e cópia estão desabilitados. Toda visualização é registrada.
      </div>


      {/* Confirmação: De acordo */}
      <Dialog open={confirmAccept} onOpenChange={(o) => !respondingStatus && setConfirmAccept(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar aceite da minuta</DialogTitle>
            <DialogDescription>
              Ao confirmar, você declara estar <strong>de acordo</strong> com o conteúdo desta minuta. Sua resposta será registrada com data, hora e endereço IP e enviada ao emissor. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmAccept(false)} disabled={!!respondingStatus}>
              Cancelar
            </Button>
            <Button
              onClick={() => submitResponse("accepted")}
              disabled={!!respondingStatus}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {respondingStatus === "accepted" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar aceite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ressalva */}
      <Dialog
        open={showObjectionDialog}
        onOpenChange={(o) => {
          if (respondingStatus) return;
          setShowObjectionDialog(o);
          if (!o) setObjectionReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar ressalva</DialogTitle>
            <DialogDescription>
              Descreva o que não está de acordo ou o que sugere alterar. O emissor receberá esta observação junto com data, hora e IP do envio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="objection-reason">Motivo / sugestão de alteração</Label>
            <Textarea
              id="objection-reason"
              value={objectionReason}
              onChange={(e) => setObjectionReason(e.target.value)}
              placeholder="Ex.: Solicito ajustar a cláusula 4ª sobre prazo de pagamento para 30 dias..."
              rows={6}
              maxLength={4000}
              autoFocus
            />
            <div className="text-[11px] text-muted-foreground text-right">
              {objectionReason.trim().length}/4000 (mínimo 5 caracteres)
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowObjectionDialog(false)}
              disabled={!!respondingStatus}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => submitResponse("objected", objectionReason.trim())}
              disabled={!!respondingStatus || objectionReason.trim().length < 5}
            >
              {respondingStatus === "objected" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enviar ressalva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
