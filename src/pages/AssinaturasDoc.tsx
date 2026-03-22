import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useDocumentSignatures, SignatureDocument, DocSigner } from "@/hooks/use-document-signatures";
import { useUpload } from "@/hooks/use-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  FileSignature, Plus, Send, Trash2, Copy, Download, Clock, CheckCircle2, 
  XCircle, FileText, Users, Shield, Eye, Link2, ExternalLink, Move 
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { API_URL } from "@/lib/api";

// ============ SIGNATURE PAD ============
function SignaturePad({ onSave }: { onSave: (data: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="space-y-2">
      <Label>Desenhe sua assinatura</Label>
      <div className="border-2 border-dashed rounded-lg p-1 bg-white">
        <canvas ref={canvasRef} width={400} height={150}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clear}>Limpar</Button>
        <Button size="sm" onClick={() => { const d = canvasRef.current?.toDataURL('image/png'); if (d) onSave(d); }}>Confirmar Assinatura</Button>
      </div>
    </div>
  );
}

// ============ PDF VIEWER WITH SIGNATURE PLACEMENT ============
interface SignaturePlacement {
  id: string;
  signerIndex: number;
  signerName: string;
  page: number;
  x: number; // percentage
  y: number; // percentage
  width: number;
  height: number;
}

function PDFSignaturePlacer({ 
  pdfUrl, 
  signers, 
  placements, 
  onPlacementsChange 
}: { 
  pdfUrl: string; 
  signers: { name: string; email: string }[];
  placements: SignaturePlacement[];
  onPlacementsChange: (p: SignaturePlacement[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedSigner, setSelectedSigner] = useState(0);

  const addPlacement = () => {
    const newP: SignaturePlacement = {
      id: crypto.randomUUID(),
      signerIndex: selectedSigner,
      signerName: signers[selectedSigner]?.name || `Signatário ${selectedSigner + 1}`,
      page: 1,
      x: 10,
      y: 70,
      width: 25,
      height: 10,
    };
    onPlacementsChange([...placements, newP]);
  };

  const removePlacement = (id: string) => {
    onPlacementsChange(placements.filter(p => p.id !== id));
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const p = placements.find(pl => pl.id === id);
    if (!p) return;
    const pxX = (p.x / 100) * rect.width;
    const pxY = (p.y / 100) * rect.height;
    setDragOffset({ x: e.clientX - rect.left - pxX, y: e.clientY - rect.top - pxY });
    setDragging(id);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    onPlacementsChange(placements.map(p => 
      p.id === dragging ? { ...p, x: Math.max(0, Math.min(75, x)), y: Math.max(0, Math.min(90, y)) } : p
    ));
  }, [dragging, dragOffset, placements, onPlacementsChange]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  const signerColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-sm font-semibold">Posicionar assinaturas:</Label>
        {signers.map((s, i) => (
          <Button key={i} size="sm" variant={selectedSigner === i ? "default" : "outline"} 
            onClick={() => setSelectedSigner(i)}
            style={selectedSigner === i ? { backgroundColor: signerColors[i % signerColors.length] } : {}}
          >
            {s.name || `Signatário ${i + 1}`}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={addPlacement}>
          <Plus className="h-3 w-3 mr-1" />Adicionar área
        </Button>
      </div>

      <div ref={containerRef} className="relative border rounded-lg overflow-hidden bg-muted" style={{ minHeight: '500px' }}>
        <iframe src={`${pdfUrl}#toolbar=0&navpanes=0`} className="w-full border-0" style={{ height: '500px' }} title="PDF Preview" />
        
        {placements.map(p => (
          <div
            key={p.id}
            className="absolute border-2 border-dashed rounded cursor-move flex flex-col items-center justify-center text-xs select-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.width}%`,
              height: `${p.height}%`,
              borderColor: signerColors[p.signerIndex % signerColors.length],
              backgroundColor: `${signerColors[p.signerIndex % signerColors.length]}20`,
              zIndex: dragging === p.id ? 50 : 10,
            }}
            onMouseDown={e => handleMouseDown(e, p.id)}
          >
            <Move className="h-3 w-3 mb-0.5" style={{ color: signerColors[p.signerIndex % signerColors.length] }} />
            <span className="font-medium truncate px-1" style={{ color: signerColors[p.signerIndex % signerColors.length] }}>
              {p.signerName}
            </span>
            <button 
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] hover:scale-110"
              onClick={(e) => { e.stopPropagation(); removePlacement(p.id); }}
            >×</button>
          </div>
        ))}
      </div>

      {placements.length > 0 && (
        <p className="text-xs text-muted-foreground">Arraste os quadrados para posicionar as assinaturas no documento.</p>
      )}
    </div>
  );
}

// ============ SIGNED DOCUMENT BOX (for print) ============
function SignatureBlock({ signer }: { signer: DocSigner }) {
  return (
    <div className="border-2 border-foreground/20 rounded-lg p-4 bg-card space-y-2 break-inside-avoid">
      <div className="border-b pb-2 mb-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{signer.role || 'Signatário'}</p>
      </div>
      {signer.signature_data ? (
        <img src={signer.signature_data} alt="Assinatura" className="h-16 object-contain mx-auto" />
      ) : (
        <div className="h-16 flex items-center justify-center text-muted-foreground text-sm">
          Assinatura pendente
        </div>
      )}
      <div className="border-t pt-2 space-y-0.5 text-xs">
        <p className="font-semibold">{signer.name}</p>
        <p className="text-muted-foreground">{signer.email}</p>
        {signer.cpf && <p className="text-muted-foreground">CPF: {signer.cpf}</p>}
        {signer.signed_at && (
          <p className="text-muted-foreground">
            Assinado em: {format(new Date(signer.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
        {signer.status === 'signed' && (
          <div className="flex items-center gap-1 text-green-600 mt-1">
            <CheckCircle2 className="h-3 w-3" />
            <span className="font-medium">Verificado</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ STATUS CONFIG ============
const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: FileText },
  pending: { label: 'Aguardando', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  partially_signed: { label: 'Parcial', color: 'bg-blue-100 text-blue-800', icon: FileSignature },
  completed: { label: 'Concluído', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: XCircle },
};

// ============ MAIN COMPONENT ============
export default function AssinaturasDoc() {
  const { token } = useParams<{ token?: string }>();

  const { documents, loading, fetchDocuments, createDocument, sendForSigning, deleteDocument, getDocument, getSigningPage, submitSignature } = useDocumentSignatures();
  const { uploadFile, isUploading } = useUpload();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SignatureDocument | null>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [signers, setSigners] = useState<Omit<DocSigner, 'id' | 'status' | 'signed_at' | 'access_token'>[]>([
    { name: '', email: '', cpf: '', phone: '', role: 'Signatário', sign_order: 1 }
  ]);
  const [signaturePlacements, setSignaturePlacements] = useState<SignaturePlacement[]>([]);

  // Public signing state
  const [pageData, setPageData] = useState<any>(null);
  const [cpf, setCpf] = useState('');
  const [signed, setSigned] = useState(false);
  const [signingLoading, setSigningLoading] = useState(!!token);
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    if (token) {
      getSigningPage(token).then(data => { setPageData(data); setSigningLoading(false); });
    } else {
      fetchDocuments();
    }
  }, [token]);

  // ============ PUBLIC SIGNING FLOW ============
  if (token) {
    const handleSign = async (signatureData: string) => {
      let geo = '';
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        );
        geo = `${pos.coords.latitude},${pos.coords.longitude}`;
      } catch {}
      const ok = await submitSignature(token, { signature_data: signatureData, cpf, geolocation: geo });
      if (ok) { 
        setSigned(true); 
        toast.success('Documento assinado com sucesso!');
        // Reload to get download URL
        const updatedData = await getSigningPage(token);
        if (updatedData?.document_url) setDownloadUrl(updatedData.document_url);
      }
      else toast.error('Erro ao assinar documento');
    };

    if (signingLoading) return <div className="min-h-screen flex items-center justify-center"><p>Carregando...</p></div>;
    if (!pageData) return <div className="min-h-screen flex items-center justify-center"><p>Link inválido ou expirado</p></div>;
    if (signed) return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">Assinatura Registrada!</h2>
          <p className="text-muted-foreground">Sua assinatura tem validade jurídica conforme MP 2.200-2/2001.</p>
          <p className="text-sm text-muted-foreground">Você receberá uma notificação quando todos os signatários assinarem o documento.</p>
          {(downloadUrl || pageData?.document_url) && (
            <Button variant="outline" asChild>
              <a href={downloadUrl || pageData.document_url} target="_blank" rel="noopener">
                <Download className="h-4 w-4 mr-2" />Baixar cópia do documento
              </a>
            </Button>
          )}
        </CardContent></Card>
      </div>
    );

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* PDF Preview */}
          {pageData.document_url && (
            <Card>
              <CardContent className="pt-4">
                <iframe src={`${pageData.document_url}#toolbar=1`} className="w-full border-0 rounded" style={{ height: '400px' }} title="Documento" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" />Assinar Documento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-muted-foreground">Documento</Label><p className="font-medium">{pageData.document_title}</p></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-muted-foreground">Nome</Label><p className="font-medium">{pageData.signer_name}</p></div>
                <div><Label className="text-muted-foreground">Papel</Label><p className="font-medium">{pageData.signer_role || 'Signatário'}</p></div>
              </div>
              <div><Label>CPF (para validação)</Label><Input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" /></div>
              <div className="border-t pt-4"><SignaturePad onSave={handleSign} /></div>
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <Shield className="h-4 w-4 inline mr-1" />
                Ao assinar, você concorda que esta assinatura eletrônica tem validade jurídica conforme a MP 2.200-2/2001 e Art. 10 §2º.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ============ MAIN APP FLOW ============
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { const url = await uploadFile(file); if (url) { setFileUrl(url); setFileName(file.name); } }
    catch (err: any) { toast.error(err.message); }
  };

  const handleCreate = async () => {
    if (!title || !fileUrl) { toast.error('Título e arquivo são obrigatórios'); return; }
    const validSigners = signers.filter(s => s.name && s.email);
    if (!validSigners.length) { toast.error('Adicione ao menos um signatário'); return; }
    const doc = await createDocument({ 
      title, description, original_url: fileUrl, original_filename: fileName, 
      signers: validSigners 
    });
    if (doc) {
      // Save placements if any
      if (signaturePlacements.length > 0 && doc.id) {
        // We'll send placements via update
        // For now placements are visual reference
      }
      toast.success('Documento criado!');
      setCreateOpen(false);
      setTitle(''); setDescription(''); setFileUrl(''); setFileName('');
      setSigners([{ name: '', email: '', cpf: '', phone: '', role: 'Signatário', sign_order: 1 }]);
      setSignaturePlacements([]);
    }
  };

  const handleSend = async (id: string) => {
    const result = await sendForSigning(id);
    if (result?.signing_links) {
      // Refresh the doc to show links in detail
      const doc = await getDocument(id);
      if (doc) { setSelectedDoc(doc); setDetailOpen(true); }
      toast.success('Documento enviado para assinatura!');
    }
    else toast.error('Erro ao enviar');
  };

  const handleViewDetail = async (id: string) => {
    const doc = await getDocument(id);
    if (doc) { setSelectedDoc(doc); setDetailOpen(true); }
  };

  const addSigner = () => setSigners([...signers, { name: '', email: '', cpf: '', phone: '', role: 'Signatário', sign_order: signers.length + 1 }]);
  const updateSigner = (idx: number, field: string, value: string) => { const u = [...signers]; (u[idx] as any)[field] = value; setSigners(u); };
  const removeSigner = (idx: number) => { if (signers.length <= 1) return; setSigners(signers.filter((_, i) => i !== idx)); };
  const copyLink = (link: string) => { 
    const fullUrl = window.location.origin + link;
    navigator.clipboard.writeText(fullUrl); 
    toast.success('Link copiado!'); 
  };

  const getProgressPercent = (doc: SignatureDocument) => {
    const total = doc.total_signers || doc.signers?.length || 0;
    const signed = doc.signed_count || doc.signers?.filter(s => s.status === 'signed').length || 0;
    return total > 0 ? Math.round((signed / total) * 100) : 0;
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><FileSignature className="h-6 w-6" />Assinaturas de Documentos</h1>
            <p className="text-muted-foreground">Envie documentos para assinatura digital com validade jurídica</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Novo Documento</Button>
        </div>

        {/* Documents Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map(doc => {
            const st = statusConfig[doc.status] || statusConfig.draft;
            const Icon = st.icon;
            const progress = getProgressPercent(doc);
            return (
              <Card key={doc.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleViewDetail(doc.id)}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold truncate flex-1">{doc.title}</h3>
                    <Badge className={st.color}><Icon className="h-3 w-3 mr-1" />{st.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{doc.original_filename}</p>
                  
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{doc.signed_count || 0}/{doc.total_signers || 0} assinaram</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div 
                        className="h-1.5 rounded-full transition-all" 
                        style={{ 
                          width: `${progress}%`, 
                          backgroundColor: progress === 100 ? 'hsl(var(--chart-2))' : 'hsl(var(--primary))' 
                        }} 
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{doc.creator_name || ''}</span>
                    <span>{format(new Date(doc.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                  </div>
                  <div className="flex gap-1 pt-1">
                    {doc.status === 'draft' && (
                      <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); handleSend(doc.id); }}>
                        <Send className="h-3 w-3 mr-1" />Enviar
                      </Button>
                    )}
                    {doc.status === 'completed' && (
                      <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); window.open(doc.original_url, '_blank'); }}>
                        <Download className="h-3 w-3 mr-1" />Baixar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); deleteDocument(doc.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!loading && documents.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>Nenhum documento ainda</p>
            </div>
          )}
        </div>

        {/* ========== CREATE DIALOG ========== */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Documento para Assinatura</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Título *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Contrato de Prestação de Serviço" /></div>
                <div><Label>Arquivo (PDF) *</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={handleUpload} disabled={isUploading} />
                  {fileName && <p className="text-sm text-muted-foreground mt-1">📄 {fileName}</p>}
                </div>
              </div>
              <div><Label>Descrição</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Opcional..." rows={2} /></div>
              
              {/* Signers */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">Signatários</Label>
                  <Button size="sm" variant="outline" onClick={addSigner}><Plus className="h-3 w-3 mr-1" />Adicionar</Button>
                </div>
                {signers.map((s, i) => (
                  <div key={i} className="border rounded-lg p-3 mb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Signatário {i + 1}</span>
                      {signers.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeSigner(i)}><Trash2 className="h-3 w-3" /></Button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Nome *</Label><Input value={s.name} onChange={e => updateSigner(i, 'name', e.target.value)} /></div>
                      <div><Label className="text-xs">E-mail *</Label><Input value={s.email} onChange={e => updateSigner(i, 'email', e.target.value)} /></div>
                      <div><Label className="text-xs">CPF</Label><Input value={s.cpf || ''} onChange={e => updateSigner(i, 'cpf', e.target.value)} /></div>
                      <div><Label className="text-xs">Telefone</Label><Input value={s.phone || ''} onChange={e => updateSigner(i, 'phone', e.target.value)} /></div>
                      <div><Label className="text-xs">Papel</Label><Input value={s.role || ''} onChange={e => updateSigner(i, 'role', e.target.value)} placeholder="Contratante, Testemunha..." /></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* PDF Preview with Signature Placement */}
              {fileUrl && signers.filter(s => s.name).length > 0 && (
                <div className="border-t pt-4">
                  <Label className="text-base font-semibold mb-3 block">Posicionar Assinaturas no Documento</Label>
                  <PDFSignaturePlacer 
                    pdfUrl={fileUrl} 
                    signers={signers.filter(s => s.name)} 
                    placements={signaturePlacements}
                    onPlacementsChange={setSignaturePlacements}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={isUploading}>Criar Documento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ========== DETAIL DIALOG ========== */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selectedDoc?.title}</DialogTitle></DialogHeader>
            {selectedDoc && (
              <div className="space-y-4">
                {/* Status Header */}
                <div className="flex items-center gap-3 flex-wrap">
                  {(() => { const st = statusConfig[selectedDoc.status]; const Icon = st.icon; return <Badge className={`${st.color} text-sm px-3 py-1`}><Icon className="h-4 w-4 mr-1" />{st.label}</Badge>; })()}
                  <span className="text-sm text-muted-foreground">{selectedDoc.original_filename}</span>
                  {selectedDoc.status === 'completed' && (
                    <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Todos assinaram</Badge>
                  )}
                  {(selectedDoc.status === 'pending' || selectedDoc.status === 'partially_signed') && (
                    <Badge variant="outline" className="text-orange-600 border-orange-300">
                      <Clock className="h-3 w-3 mr-1" />
                      Faltam {(selectedDoc.signers?.filter(s => s.status !== 'signed').length || 0)} assinatura(s)
                    </Badge>
                  )}
                </div>

                {selectedDoc.description && <p className="text-sm">{selectedDoc.description}</p>}

                {/* Progress */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Progresso das Assinaturas</span>
                    <span className="text-sm font-bold">{getProgressPercent(selectedDoc)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="h-2 rounded-full transition-all" 
                      style={{ 
                        width: `${getProgressPercent(selectedDoc)}%`, 
                        backgroundColor: getProgressPercent(selectedDoc) === 100 ? 'hsl(var(--chart-2))' : 'hsl(var(--primary))' 
                      }} 
                    />
                  </div>
                </div>

                {/* Signers with Links */}
                <div className="border-t pt-3">
                  <h4 className="font-semibold mb-3 flex items-center gap-1"><Users className="h-4 w-4" />Signatários e Links</h4>
                  {selectedDoc.signers?.map(s => (
                    <div key={s.id} className="border rounded-lg p-3 mb-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.email} • {s.role || 'Signatário'}</p>
                          {s.cpf && <p className="text-xs text-muted-foreground">CPF: {s.cpf}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {s.status === 'signed' ? (
                            <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Assinado {s.signed_at && format(new Date(s.signed_at), "dd/MM HH:mm")}</Badge>
                          ) : (
                            <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Signing link - always visible when not draft */}
                      {s.access_token && selectedDoc.status !== 'draft' && (
                        <div className="flex items-center gap-2 bg-muted/50 rounded p-2">
                          <Link2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <code className="text-xs flex-1 truncate text-muted-foreground">
                            {window.location.origin}/assinar/{s.access_token}
                          </code>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => copyLink(`/assinar/${s.access_token}`)}>
                            <Copy className="h-3 w-3 mr-1" />Copiar
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => window.open(`/assinar/${s.access_token}`, '_blank')}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {/* Signature preview if signed */}
                      {s.status === 'signed' && s.signature_data && (
                        <div className="bg-card border rounded p-2">
                          <SignatureBlock signer={s} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* PDF Preview */}
                {selectedDoc.original_url && (
                  <div className="border-t pt-3">
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><Eye className="h-4 w-4" />Visualizar Documento</h4>
                    <iframe src={`${selectedDoc.original_url}#toolbar=1`} className="w-full border rounded" style={{ height: '350px' }} title="PDF" />
                  </div>
                )}

                {/* Signature blocks for printing */}
                {selectedDoc.signers?.some(s => s.status === 'signed') && (
                  <div className="border-t pt-3">
                    <h4 className="font-semibold mb-2">Quadro de Assinaturas (para impressão)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 print:grid-cols-2" id="signature-blocks">
                      {selectedDoc.signers?.map(s => (
                        <SignatureBlock key={s.id} signer={s} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Audit Log */}
                {selectedDoc.audit_log && selectedDoc.audit_log.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><Shield className="h-4 w-4" />Trilha de Auditoria</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedDoc.audit_log.map((log: any) => (
                        <div key={log.id} className="text-xs flex items-center gap-2 text-muted-foreground">
                          <span>{format(new Date(log.created_at), "dd/MM HH:mm")}</span>
                          <Badge variant="outline" className="text-xs">{log.action}</Badge>
                          {log.ip_address && <span>IP: {log.ip_address}</span>}
                          {log.geolocation && <span>📍 {log.geolocation}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 flex-wrap border-t pt-3">
                  {selectedDoc.status === 'draft' && (
                    <Button onClick={() => { handleSend(selectedDoc.id); }}><Send className="h-4 w-4 mr-2" />Enviar para Assinatura</Button>
                  )}
                  {selectedDoc.original_url && (
                    <Button variant="outline" asChild>
                      <a href={selectedDoc.original_url} target="_blank" rel="noopener"><Download className="h-4 w-4 mr-2" />Baixar Documento Original</a>
                    </Button>
                  )}
                  {selectedDoc.status === 'completed' && (
                    <Button variant="outline" onClick={() => window.print()}>
                      <FileText className="h-4 w-4 mr-2" />Imprimir com Assinaturas
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
