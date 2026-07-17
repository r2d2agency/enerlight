import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useDocumentSignatures, SignatureDocument, DocDraft } from "@/hooks/use-document-signatures";
import { useUpload } from "@/hooks/use-upload";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText, Plus, Send, Trash2, Copy, RefreshCw, Ban, CheckCircle2, XCircle, Clock, Eye, Mail, Lock, Upload,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusBadge = (s?: string) => {
  if (s === 'accepted') return <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="h-3 w-3 mr-1" />De acordo</Badge>;
  if (s === 'objected') return <Badge className="bg-amber-100 text-amber-800"><XCircle className="h-3 w-3 mr-1" />Ressalva</Badge>;
  return <Badge className="bg-muted text-muted-foreground"><Clock className="h-3 w-3 mr-1" />Aguardando</Badge>;
};

export default function Minutas() {
  const { documents, loading, fetchDocuments, createDocument, getDocument, deleteDocument,
    sendDraft, regenerateDraftPassword, revokeDraft } = useDocumentSignatures();
  const { uploadFile, isUploading } = useUpload();

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');

  const [detailDoc, setDetailDoc] = useState<SignatureDocument | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [recipName, setRecipName] = useState('');
  const [recipEmail, setRecipEmail] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | ''>('');

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const minutas = documents.filter(d => d.is_minuta);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      if (url) { setFileUrl(url); setFileName(file.name); }
    } catch { toast.error('Falha no upload'); }
  };

  const handleCreate = async () => {
    if (!title || !fileUrl) { toast.error('Título e arquivo são obrigatórios'); return; }
    const doc = await createDocument({
      title, description, original_url: fileUrl, original_filename: fileName,
      is_minuta: true,
    });
    if (doc) {
      toast.success('Minuta criada');
      setCreateOpen(false);
      setTitle(''); setDescription(''); setFileUrl(''); setFileName('');
    } else toast.error('Erro ao criar');
  };

  const openDetail = async (id: string) => {
    const doc = await getDocument(id);
    if (doc) setDetailDoc(doc);
  };

  const reloadDetail = async () => {
    if (detailDoc) {
      const doc = await getDocument(detailDoc.id);
      if (doc) setDetailDoc(doc);
    }
    fetchDocuments();
  };

  const handleSendDraft = async () => {
    if (!detailDoc) return;
    if (!recipName || !recipEmail) { toast.error('Nome e e-mail são obrigatórios'); return; }
    try {
      const res = await sendDraft(detailDoc.id, {
        recipient_name: recipName,
        recipient_email: recipEmail,
        expires_in_days: typeof expiresIn === 'number' ? expiresIn : undefined,
      });
      if (res) {
        const link = `${window.location.origin}/minuta/${res.draft.access_token}`;
        toast.success(res.email_sent ? 'Minuta enviada por e-mail' : 'Minuta criada (envio de e-mail falhou)');
        await navigator.clipboard?.writeText(`${link}\nSenha: ${res.password}`).catch(() => {});
        setSendOpen(false); setRecipName(''); setRecipEmail(''); setExpiresIn('');
        await reloadDetail();
      }
    } catch (e: any) { toast.error(e?.message || 'Erro ao enviar'); }
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/minuta/${token}`;
    navigator.clipboard?.writeText(link);
    toast.success('Link copiado');
  };

  const regen = async (draftId: string) => {
    if (!detailDoc) return;
    try {
      const r = await regenerateDraftPassword(detailDoc.id, draftId);
      await navigator.clipboard?.writeText(`Senha: ${r.password}`).catch(() => {});
      toast.success(r.email_sent ? 'Nova senha enviada por e-mail' : 'Senha regenerada');
      await reloadDetail();
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
  };

  const revoke = async (draftId: string) => {
    if (!detailDoc) return;
    if (!confirm('Revogar acesso deste destinatário?')) return;
    await revokeDraft(detailDoc.id, draftId);
    toast.success('Acesso revogado');
    await reloadDetail();
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />Minutas de Contrato</h1>
            <p className="text-sm text-muted-foreground">Envie minutas para revisão com senha, OTP e resposta (de acordo/ressalva).</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Nova minuta</Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {minutas.map(doc => (
            <Card key={doc.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(doc.id)}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold truncate flex-1">{doc.title}</h3>
                  <Badge variant="outline"><FileText className="h-3 w-3 mr-1" />Minuta</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{doc.original_filename}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>{doc.creator_name || ''}</span>
                  <span>{format(new Date(doc.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                </div>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); deleteDocument(doc.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!loading && minutas.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma minuta ainda</p>
            </div>
          )}
        </div>

        {/* CREATE */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova minuta</DialogTitle>
              <DialogDescription>Cadastre o documento que será enviado como minuta para revisão.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Título *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Minuta contrato representante" /></div>
              <div><Label>Descrição</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
              <div>
                <Label>Arquivo (PDF) *</Label>
                <Input type="file" accept="application/pdf" onChange={handleUpload} disabled={isUploading} />
                {fileName && <p className="text-xs text-muted-foreground mt-1 truncate">✓ {fileName}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={isUploading || !fileUrl}><Upload className="h-4 w-4 mr-2" />Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* DETAIL */}
        <Dialog open={!!detailDoc} onOpenChange={o => !o && setDetailDoc(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{detailDoc?.title}</DialogTitle>
              <DialogDescription>{detailDoc?.description || 'Gerencie destinatários e respostas desta minuta.'}</DialogDescription>
            </DialogHeader>
            {detailDoc && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {detailDoc.drafts?.length || 0} destinatário(s)
                  </div>
                  <Button size="sm" onClick={() => setSendOpen(true)}><Send className="h-3 w-3 mr-2" />Enviar minuta</Button>
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {(detailDoc.drafts || []).map(d => (
                    <Card key={d.id}>
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d.recipient_name}</p>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><Mail className="h-3 w-3" />{d.recipient_email}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {d.revoked ? <Badge variant="destructive">Revogado</Badge> : statusBadge(d.response_status || 'pending')}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{d.view_count || 0} vis.</span>
                          {d.responded_at && <span>Respondido em {format(new Date(d.responded_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>}
                        </div>
                        {d.response_reason && (
                          <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-900">
                            <strong>Ressalva:</strong> {d.response_reason}
                          </div>
                        )}
                        {!d.revoked && (
                          <div className="flex gap-1 flex-wrap pt-1">
                            <Button size="sm" variant="outline" onClick={() => copyLink(d.access_token)}><Copy className="h-3 w-3 mr-1" />Link</Button>
                            <Button size="sm" variant="outline" onClick={() => regen(d.id)}><RefreshCw className="h-3 w-3 mr-1" />Nova senha</Button>
                            <Button size="sm" variant="ghost" onClick={() => revoke(d.id)}><Ban className="h-3 w-3 mr-1" />Revogar</Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {(!detailDoc.drafts || detailDoc.drafts.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum destinatário. Clique em "Enviar minuta".</p>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* SEND DRAFT */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Enviar minuta</DialogTitle>
              <DialogDescription>O destinatário receberá o link e uma senha por e-mail. Toda vez que abrir, será pedido OTP.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome *</Label><Input value={recipName} onChange={e => setRecipName(e.target.value)} /></div>
              <div><Label>E-mail *</Label><Input type="email" value={recipEmail} onChange={e => setRecipEmail(e.target.value)} /></div>
              <div>
                <Label>Expira em (dias) — opcional</Label>
                <Input type="number" min={1} value={expiresIn}
                  onChange={e => setExpiresIn(e.target.value ? Number(e.target.value) : '')} placeholder="Ex.: 7" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendOpen(false)}>Cancelar</Button>
              <Button onClick={handleSendDraft}><Send className="h-4 w-4 mr-2" />Enviar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
