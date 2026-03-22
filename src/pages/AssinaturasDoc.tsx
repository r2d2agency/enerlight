import { useState, useEffect, useRef } from "react";
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
import { FileSignature, Plus, Send, Trash2, Copy, Download, Clock, CheckCircle2, XCircle, FileText, Users, Shield } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

  // ALL hooks must be called before any conditional return
  const { documents, loading, fetchDocuments, createDocument, sendForSigning, deleteDocument, getDocument, getSigningPage, submitSignature } = useDocumentSignatures();
  const { uploadFile, isUploading } = useUpload();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<SignatureDocument | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [signingLinks, setSigningLinks] = useState<any[]>([]);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [signers, setSigners] = useState<Omit<DocSigner, 'id' | 'status' | 'signed_at' | 'access_token'>[]>([
    { name: '', email: '', cpf: '', phone: '', role: 'Signatário', sign_order: 1 }
  ]);

  // Public signing state
  const [pageData, setPageData] = useState<any>(null);
  const [cpf, setCpf] = useState('');
  const [signed, setSigned] = useState(false);
  const [signingLoading, setSigningLoading] = useState(!!token);

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
      if (ok) { setSigned(true); toast.success('Documento assinado com sucesso!'); }
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
        </CardContent></Card>
      </div>
    );

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto space-y-4">
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
    const doc = await createDocument({ title, description, original_url: fileUrl, original_filename: fileName, signers: validSigners });
    if (doc) {
      toast.success('Documento criado!');
      setCreateOpen(false);
      setTitle(''); setDescription(''); setFileUrl(''); setFileName('');
      setSigners([{ name: '', email: '', cpf: '', phone: '', role: 'Signatário', sign_order: 1 }]);
    }
  };

  const handleSend = async (id: string) => {
    const result = await sendForSigning(id);
    if (result?.signing_links) { setSigningLinks(result.signing_links); setLinksOpen(true); toast.success('Enviado!'); }
    else toast.error('Erro ao enviar');
  };

  const handleViewDetail = async (id: string) => {
    const doc = await getDocument(id);
    if (doc) { setSelectedDoc(doc); setDetailOpen(true); }
  };

  const addSigner = () => setSigners([...signers, { name: '', email: '', cpf: '', phone: '', role: 'Signatário', sign_order: signers.length + 1 }]);
  const updateSigner = (idx: number, field: string, value: string) => { const u = [...signers]; (u[idx] as any)[field] = value; setSigners(u); };
  const removeSigner = (idx: number) => { if (signers.length <= 1) return; setSigners(signers.filter((_, i) => i !== idx)); };
  const copyLink = (link: string) => { navigator.clipboard.writeText(window.location.origin + link); toast.success('Link copiado!'); };

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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {documents.map(doc => {
            const st = statusConfig[doc.status] || statusConfig.draft;
            const Icon = st.icon;
            return (
              <Card key={doc.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleViewDetail(doc.id)}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold truncate flex-1">{doc.title}</h3>
                    <Badge className={st.color}><Icon className="h-3 w-3 mr-1" />{st.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{doc.original_filename}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{doc.signed_count || 0}/{doc.total_signers || 0}</span>
                    <span>{format(new Date(doc.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                  </div>
                  <div className="flex gap-1 pt-1">
                    {doc.status === 'draft' && (
                      <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); handleSend(doc.id); }}><Send className="h-3 w-3 mr-1" />Enviar</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); deleteDocument(doc.id); }}><Trash2 className="h-3 w-3" /></Button>
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

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Documento para Assinatura</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Título *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Contrato de Prestação de Serviço" /></div>
              <div><Label>Descrição</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Opcional..." /></div>
              <div><Label>Arquivo (PDF) *</Label><Input type="file" accept=".pdf,.doc,.docx" onChange={handleUpload} disabled={isUploading} />
                {fileName && <p className="text-sm text-muted-foreground mt-1">📄 {fileName}</p>}
              </div>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={isUploading}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selectedDoc?.title}</DialogTitle></DialogHeader>
            {selectedDoc && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {(() => { const st = statusConfig[selectedDoc.status]; const Icon = st.icon; return <Badge className={st.color}><Icon className="h-3 w-3 mr-1" />{st.label}</Badge>; })()}
                  <span className="text-sm text-muted-foreground">{selectedDoc.original_filename}</span>
                </div>
                {selectedDoc.description && <p className="text-sm">{selectedDoc.description}</p>}
                <div className="border-t pt-3">
                  <h4 className="font-semibold mb-2 flex items-center gap-1"><Users className="h-4 w-4" />Signatários</h4>
                  {selectedDoc.signers?.map(s => (
                    <div key={s.id} className="flex items-center justify-between border rounded-lg p-2 mb-2">
                      <div><p className="font-medium text-sm">{s.name}</p><p className="text-xs text-muted-foreground">{s.email} • {s.role || 'Signatário'}</p></div>
                      <div className="flex items-center gap-2">
                        {s.status === 'signed'
                          ? <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Assinado</Badge>
                          : <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>}
                        {s.access_token && selectedDoc.status !== 'draft' && (
                          <Button size="sm" variant="ghost" onClick={() => copyLink(`/assinar/${s.access_token}`)}><Copy className="h-3 w-3" /></Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedDoc.audit_log && selectedDoc.audit_log.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="font-semibold mb-2 flex items-center gap-1"><Shield className="h-4 w-4" />Auditoria</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedDoc.audit_log.map((log: any) => (
                        <div key={log.id} className="text-xs flex items-center gap-2 text-muted-foreground">
                          <span>{format(new Date(log.created_at), "dd/MM HH:mm")}</span>
                          <Badge variant="outline" className="text-xs">{log.action}</Badge>
                          {log.ip_address && <span>IP: {log.ip_address}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  {selectedDoc.status === 'draft' && (
                    <Button onClick={() => { handleSend(selectedDoc.id); setDetailOpen(false); }}><Send className="h-4 w-4 mr-2" />Enviar</Button>
                  )}
                  {selectedDoc.original_url && (
                    <Button variant="outline" asChild><a href={selectedDoc.original_url} target="_blank" rel="noopener"><Download className="h-4 w-4 mr-2" />Baixar</a></Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Signing Links */}
        <Dialog open={linksOpen} onOpenChange={setLinksOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Links de Assinatura</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Compartilhe os links com cada signatário:</p>
              {signingLinks.map((link, i) => (
                <div key={i} className="flex items-center justify-between border rounded-lg p-3">
                  <div><p className="font-medium text-sm">{link.signer_name}</p><p className="text-xs text-muted-foreground">{link.signer_email}</p></div>
                  <Button size="sm" variant="outline" onClick={() => copyLink(link.signing_url)}><Copy className="h-3 w-3 mr-1" />Copiar</Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
