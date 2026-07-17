import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, ShieldCheck, Mail, Camera, FileSignature,
  CheckCircle2, Lock, ScanFace, IdCard, RefreshCw,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useDocumentSignatures } from "@/hooks/use-document-signatures";
import SignatureCanvas from "react-signature-canvas";

const FACEAPI_CDN = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

type Step = "otp" | "read" | "biometric" | "sign" | "done";

export default function PublicSigningPage() {
  const { token } = useParams<{ token: string }>();
  const {
    getSigningInfo, requestSignOtp, verifySignOtp,
    uploadBiometric, submitSignSignature,
  } = useDocumentSignatures();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("otp");
  const [session, setSession] = useState<string | null>(null);

  // OTP
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  // biometrics
  const [selfie, setSelfie] = useState<string | null>(null);
  const [docFront, setDocFront] = useState<string | null>(null);
  const [docBack, setDocBack] = useState<string | null>(null);
  const [faceReady, setFaceReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [faceMeta, setFaceMeta] = useState<{ score: number; distance: number | null; faces: number } | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // signature
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [cpf, setCpf] = useState("");
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!token) return;
    getSigningInfo(token).then((d) => {
      setInfo(d);
      setCpf("");
      if (d.already_signed) setStep("done");
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token, getSigningInfo]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  const handleRequestOtp = async () => {
    if (!token) return;
    setOtpBusy(true);
    try {
      const r = await requestSignOtp(token);
      setOtpSent(true);
      setOtpCooldown(30);
      toast.success(`Código enviado para ${r.recipient_email_masked}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setOtpBusy(false); }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || otpCode.length !== 6) return;
    setOtpBusy(true);
    try {
      const r = await verifySignOtp(token, otpCode);
      setSession(r.session_token);
      setStep("read");
      toast.success("Acesso liberado");
    } catch (err: any) { toast.error(err.message); }
    finally { setOtpBusy(false); }
  };

  // ============ Face API ============
  const loadFaceApi = useCallback(async () => {
    if (faceReady) return;
    const faceapi = await import("face-api.js");
    await faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_CDN);
    await faceapi.nets.faceLandmark68Net.loadFromUri(FACEAPI_CDN);
    await faceapi.nets.faceRecognitionNet.loadFromUri(FACEAPI_CDN);
    setFaceReady(true);
  }, [faceReady]);

  useEffect(() => { if (step === "biometric") loadFaceApi().catch((e) => { console.error(e); toast.error("Falha ao carregar módulo biométrico"); }); }, [step, loadFaceApi]);

  // Camera capture helper
  const captureFromCamera = async (facing: "user" | "environment"): Promise<string | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.playsInline = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 500));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (e: any) { toast.error("Não foi possível acessar a câmera: " + e.message); return null; }
  };

  // Modal-style camera preview + capture button
  const CameraCapture = ({ facing, label, hint, onCapture, current }: {
    facing: "user" | "environment"; label: string; hint: string; onCapture: (d: string) => void; current: string | null;
  }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [streaming, setStreaming] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);

    const start = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play(); }
        setStreaming(true);
      } catch (e: any) { toast.error("Câmera: " + e.message); }
    };
    const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setStreaming(false); };
    const shoot = () => {
      const v = videoRef.current; if (!v) return;
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      onCapture(c.toDataURL("image/jpeg", 0.85));
      stop();
    };
    useEffect(() => () => stop(), []);

    return (
      <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
        <div className="flex items-center gap-2">
          {facing === "user" ? <ScanFace className="h-4 w-4" /> : <IdCard className="h-4 w-4" />}
          <span className="font-medium text-sm">{label}</span>
          {current && <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />}
        </div>
        <p className="text-xs text-muted-foreground">{hint}</p>

        <div className="relative aspect-video bg-black rounded overflow-hidden">
          {current ? (
            <img src={current} alt={label} className="absolute inset-0 w-full h-full object-contain" />
          ) : (
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
          )}
        </div>

        <div className="flex gap-2">
          {!current && !streaming && <Button size="sm" onClick={start} className="flex-1"><Camera className="h-4 w-4 mr-1" />Abrir câmera</Button>}
          {streaming && <Button size="sm" onClick={shoot} className="flex-1">Capturar</Button>}
          {current && <Button size="sm" variant="outline" onClick={() => onCapture("")} className="flex-1"><RefreshCw className="h-4 w-4 mr-1" />Refazer</Button>}
        </div>
      </div>
    );
  };

  const analyzeBiometrics = async () => {
    if (!selfie || !docFront || !docBack) { toast.error("Capture selfie e documento (frente e verso)"); return; }
    if (!token || !session) return;
    setAnalyzing(true);
    try {
      const faceapi = await import("face-api.js");
      const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const selfieImg = await loadImg(selfie);
      const docImg = await loadImg(docFront);

      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });
      const selfieDet = await faceapi.detectSingleFace(selfieImg, opts).withFaceLandmarks().withFaceDescriptor();
      if (!selfieDet) { toast.error("Nenhum rosto detectado na selfie. Tente novamente com melhor iluminação."); setAnalyzing(false); return; }
      const score = selfieDet.detection.score;
      let distance: number | null = null;
      const docDet = await faceapi.detectSingleFace(docImg, opts).withFaceLandmarks().withFaceDescriptor();
      if (docDet) distance = faceapi.euclideanDistance(selfieDet.descriptor as any, docDet.descriptor as any);
      setFaceMeta({ score, distance, faces: 1 });

      if (score < 0.5) { toast.error("Selfie de baixa qualidade. Refaça com boa iluminação."); setAnalyzing(false); return; }
      if (distance != null && distance > 0.62) { toast.error(`Rosto da selfie não confere com o documento (distância ${distance.toFixed(2)}).`); setAnalyzing(false); return; }

      setBiometricLoading(true);
      await uploadBiometric(token, session, {
        selfie, doc_front: docFront, doc_back: docBack,
        face_match_score: score, faces_detected: 1, distance,
      });
      toast.success("Biometria validada com sucesso");
      setStep("sign");
    } catch (e: any) { toast.error(e.message || "Falha na validação biométrica"); }
    finally { setAnalyzing(false); setBiometricLoading(false); }
  };

  const handleSign = async () => {
    if (!token || !session || !sigRef.current) return;
    if (sigRef.current.isEmpty()) { toast.error("Desenhe sua assinatura"); return; }
    const dataUrl = sigRef.current.toDataURL("image/png");
    let geo = "";
    try {
      const pos = await new Promise<GeolocationPosition>((r, j) => navigator.geolocation.getCurrentPosition(r, j, { timeout: 5000 }));
      geo = `${pos.coords.latitude},${pos.coords.longitude}`;
    } catch { /* opcional */ }
    setSigning(true);
    try {
      await submitSignSignature(token, session, { signature_data: dataUrl, cpf: cpf || undefined, geolocation: geo || undefined });
      setStep("done");
      toast.success("Contrato assinado!");
    } catch (e: any) { toast.error(e.message); }
    finally { setSigning(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !info) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full"><CardContent className="pt-6 text-center space-y-3">
        <Lock className="h-12 w-12 text-destructive mx-auto" />
        <p className="font-semibold">Link indisponível</p>
        <p className="text-sm text-muted-foreground">{error || "Este link não é válido."}</p>
      </CardContent></Card>
    </div>
  );

  if (step === "done") return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full"><CardContent className="pt-8 text-center space-y-4">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-xl font-bold">Assinatura registrada</h2>
        <p className="text-muted-foreground text-sm">Sua assinatura tem validade jurídica (MP 2.200-2/2001).</p>
        <p className="text-xs text-muted-foreground">O contrato final poderá ser baixado após todos os signatários assinarem.</p>
        {info.tracking_slug && (
          <Button asChild variant="outline"><Link to={`/rastreio/${info.tracking_slug}`}>Acompanhar assinaturas</Link></Button>
        )}
      </CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2"><FileSignature className="h-4 w-4" />{info.document_title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Assinante: <strong>{info.signer_name}</strong> ({info.signer_role || "Signatário"})</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3 w-3" />MP 2.200-2/2001</div>
            </div>
            {/* Stepper */}
            <div className="flex items-center gap-1 mt-4 text-[11px]">
              {[
                { k: "otp", l: "Código" },
                { k: "read", l: "Contrato" },
                { k: "biometric", l: "Biometria" },
                { k: "sign", l: "Assinar" },
              ].map((s, i) => (
                <div key={s.k} className={`flex-1 py-1 px-2 rounded text-center ${step === s.k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {i + 1}. {s.l}
                </div>
              ))}
            </div>
          </CardHeader>
        </Card>

        {/* STEP: OTP */}
        {step === "otp" && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />Código de acesso</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Um código de 6 dígitos será enviado ao e-mail <strong>{info.signer_email_masked}</strong> a cada tentativa de acesso.
              </p>
              {!otpSent ? (
                <Button onClick={handleRequestOtp} disabled={otpBusy} className="w-full">
                  {otpBusy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Enviar código
                </Button>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    ✉️ Código enviado. Verifique caixa de entrada e spam.
                  </div>
                  <div>
                    <Label>Código de 6 dígitos</Label>
                    <Input inputMode="numeric" maxLength={6} value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000" autoFocus className="text-center text-2xl tracking-[0.5em] font-mono" />
                  </div>
                  <Button type="submit" disabled={otpBusy || otpCode.length !== 6} className="w-full">
                    {otpBusy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Validar código
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="w-full text-xs"
                    disabled={otpBusy || otpCooldown > 0} onClick={handleRequestOtp}>
                    {otpCooldown > 0 ? `Reenviar em ${otpCooldown}s` : "Não recebi — reenviar"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* STEP: Leitura */}
        {step === "read" && session && (
          <Card>
            <CardHeader><CardTitle className="text-base">Leia o contrato</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded overflow-hidden border" style={{ height: 500 }}>
                <iframe
                  title="Contrato"
                  src={`${API_URL}/api/document-signatures/sign/${token}/file?session=${encodeURIComponent(session)}#toolbar=0&navpanes=0&view=FitH`}
                  className="w-full h-full bg-white" style={{ border: 0 }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                O contrato está em modo somente-leitura e com marca d'água até que a assinatura seja concluída. O download só será liberado após todas as assinaturas.
              </div>
              <Button onClick={() => setStep("biometric")} className="w-full">Li e concordo — prosseguir</Button>
            </CardContent>
          </Card>
        )}

        {/* STEP: Biometria */}
        {step === "biometric" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ScanFace className="h-4 w-4" />Verificação biométrica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!faceReady && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Carregando modelos biométricos…</div>}

              <CameraCapture facing="user" label="Selfie" hint="Enquadre bem seu rosto, com boa iluminação." current={selfie} onCapture={(d) => setSelfie(d || null)} />
              <CameraCapture facing="environment" label="Documento — Frente" hint="RG ou CNH com foto e nome visíveis." current={docFront} onCapture={(d) => setDocFront(d || null)} />
              <CameraCapture facing="environment" label="Documento — Verso" hint="Verso do mesmo documento, ou mesmo lado se for CNH." current={docBack} onCapture={(d) => setDocBack(d || null)} />

              {faceMeta && (
                <div className="text-xs rounded-md bg-muted p-2">
                  Score detecção: {(faceMeta.score * 100).toFixed(1)}% · Distância selfie×doc: {faceMeta.distance != null ? faceMeta.distance.toFixed(3) : "—"}
                </div>
              )}
              <Button className="w-full" disabled={!selfie || !docFront || !docBack || !faceReady || analyzing || biometricLoading} onClick={analyzeBiometrics}>
                {(analyzing || biometricLoading) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Validar biometria e continuar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* STEP: Assinar */}
        {step === "sign" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Assinar</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>CPF (opcional)</Label>
                <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Sua assinatura</Label>
                <div className="border rounded-md bg-white">
                  <SignatureCanvas ref={sigRef} canvasProps={{ className: "w-full h-40" }} penColor="black" />
                </div>
                <div className="flex justify-between mt-1">
                  <Button size="sm" variant="ghost" onClick={() => sigRef.current?.clear()}>Limpar</Button>
                  <span className="text-[11px] text-muted-foreground">Desenhe usando dedo, mouse ou caneta</span>
                </div>
              </div>
              <Button className="w-full" onClick={handleSign} disabled={signing}>
                {signing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Assinar contrato
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Ao assinar, você concorda que esta assinatura eletrônica tem validade jurídica (MP 2.200-2/2001).
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
