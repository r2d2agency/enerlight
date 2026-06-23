import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Nfc, ExternalLink, Smartphone, QrCode, Save, Loader2 } from "lucide-react";
import { isWebNfcSupported, scanNfcTag, writeNfcUrl } from "@/lib/nfc-web-api";
import { useCreateNfcCard, useSaveNfcProfile, useUpdateNfcCard, useNfcCard, NfcCard } from "@/hooks/use-nfc";
import { NfcWriteTutorial } from "./NfcWriteTutorial";
import { api } from "@/lib/api";
import { ImageDropUpload } from "./ImageDropUpload";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  card?: NfcCard | null;
}

export function NfcCardDialog({ open, onOpenChange, card }: Props) {
  const [scanning, setScanning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [uid, setUid] = useState("");
  const [chipType, setChipType] = useState("NTAG215");
  const [userId, setUserId] = useState<string>("");
  const [companyName, setCompanyName] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [created, setCreated] = useState<NfcCard | null>(card || null);

  // profile
  const [displayName, setDisplayName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const [bio, setBio] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [companyDesc, setCompanyDesc] = useState("");
  const [address, setAddress] = useState("");
  const [slug, setSlug] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  // showcase + cta
  const [showcaseTitle, setShowcaseTitle] = useState("");
  const [showcaseDesc, setShowcaseDesc] = useState("");
  const [showcaseImage, setShowcaseImage] = useState("");
  const [catalogEnabled, setCatalogEnabled] = useState(true);
  const [catalogTitle, setCatalogTitle] = useState("");
  const [catalogSubtitle, setCatalogSubtitle] = useState("");

  const createCard = useCreateNfcCard();
  const saveProfile = useSaveNfcProfile();
  const updateCard = useUpdateNfcCard();
  const supported = isWebNfcSupported();
  const cardDetail = useNfcCard(created?.id);

  useEffect(() => {
    if (open) {
      api<any[]>("/api/nfc/users").then(setUsers).catch(() => setUsers([]));
      if (card) {
        setCreated(card);
        setUid(card.uid);
        setChipType(card.chip_type);
        setUserId(card.user_id || "");
        setCompanyName(card.company_name || "");
        setSlug(card.public_slug || "");
      } else {
        setCreated(null);
        setUid(""); setChipType("NTAG215"); setUserId(""); setCompanyName(""); setSlug("");
        setDisplayName(""); setRoleTitle(""); setPhone(""); setWhatsapp(""); setEmail("");
        setWebsite(""); setPhotoUrl(""); setLinkedin(""); setInstagram(""); setBio("");
        setCompanyLogo(""); setCompanyDesc(""); setAddress("");
      }
    }
  }, [open, card]);

  // When card detail loads, hydrate profile fields
  useEffect(() => {
    const p = cardDetail.data?.profile;
    if (p) {
      setDisplayName(p.display_name || "");
      setRoleTitle(p.role_title || "");
      setPhone(p.phone || "");
      setWhatsapp(p.whatsapp || "");
      setEmail(p.email || "");
      setWebsite(p.website || "");
      setPhotoUrl(p.photo_url || "");
      setLinkedin(p.linkedin || "");
      setInstagram(p.instagram || "");
      setBio(p.bio || "");
      setCompanyLogo(p.company_logo_url || "");
      setCompanyDesc(p.company_description || "");
      setAddress(p.address || "");
      setShowcaseTitle(p.showcase_title || "");
      setShowcaseDesc(p.showcase_description || "");
      setShowcaseImage(p.showcase_image_url || "");
      setCatalogEnabled(p.catalog_cta_enabled !== false);
      setCatalogTitle(p.catalog_cta_title || "");
      setCatalogSubtitle(p.catalog_cta_subtitle || "");
    }
  }, [cardDetail.data]);


  async function handleScan() {
    setScanning(true);
    try {
      const r = await scanNfcTag();
      if (r.uid) {
        setUid(r.uid);
        toast.success("Cartão detectado", { description: `UID: ${r.uid}` });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally { setScanning(false); }
  }

  async function handleCreate() {
    if (!uid) return toast.error("Informe ou leia o UID do cartão");
    try {
      const newCard = await createCard.mutateAsync({
        uid, chip_type: chipType,
        user_id: userId || null,
        company_name: companyName || null,
        profile: { display_name: displayName, role_title: roleTitle, phone, whatsapp, email, website, photo_url: photoUrl, linkedin, instagram, bio },
      });
      setCreated(newCard);
      toast.success("Cartão associado com sucesso!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar cartão");
    }
  }

  async function handleSaveProfile() {
    if (!created) return;
    try {
      await saveProfile.mutateAsync({
        id: created.id,
        profile: {
          display_name: displayName || null,
          role_title: roleTitle || null,
          company_name: companyName || null,
          company_logo_url: companyLogo || null,
          company_description: companyDesc || null,
          phone: phone || null,
          whatsapp: whatsapp || null,
          email: email || null,
          website: website || null,
          photo_url: photoUrl || null,
          linkedin: linkedin || null,
          instagram: instagram || null,
          bio: bio || null,
          address: address || null,
          showcase_title: showcaseTitle || null,
          showcase_description: showcaseDesc || null,
          showcase_image_url: showcaseImage || null,
          catalog_cta_enabled: catalogEnabled,
          catalog_cta_title: catalogTitle || null,
          catalog_cta_subtitle: catalogSubtitle || null,
        },
      });
      toast.success("Perfil salvo");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSaveSlug() {
    if (!created) return;
    setSavingSlug(true);
    try {
      const updated = await updateCard.mutateAsync({ id: created.id, public_slug: slug });
      setCreated(updated);
      setSlug(updated.public_slug);
      toast.success("Slug atualizado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar slug");
    } finally { setSavingSlug(false); }
  }


  async function handleWrite() {
    if (!created) return toast.error("Crie o cartão primeiro");
    setWriting(true);
    try {
      await writeNfcUrl(created.public_url);
      toast.success("Cartão gravado com sucesso!");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setWriting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Nfc className="h-5 w-5 text-primary" />
            {created ? "Cartão NFC" : "Associar Cartão NFC"}
          </DialogTitle>
          <DialogDescription>
            {supported
              ? "Aproxime um cartão NFC do dispositivo ou informe o UID manualmente."
              : "Web NFC indisponível neste dispositivo. Cadastro manual habilitado."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="card" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="card">Cartão</TabsTrigger>
            <TabsTrigger value="profile" disabled={!created}>Perfil</TabsTrigger>
            <TabsTrigger value="write" disabled={!created}>Gravação NFC</TabsTrigger>
          </TabsList>

          <TabsContent value="card" className="space-y-4 pt-4">
            {supported && (
              <Button onClick={handleScan} disabled={scanning} variant="outline" className="w-full">
                {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
                {scanning ? "Aproxime o cartão..." : "Ler cartão NFC"}
              </Button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>UID</Label>
                <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04:69:D2:2D:C1:2A:81" />
              </div>
              <div>
                <Label>Chip</Label>
                <Select value={chipType} onValueChange={setChipType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NTAG213">NTAG213</SelectItem>
                    <SelectItem value="NTAG215">NTAG215</SelectItem>
                    <SelectItem value="NTAG216">NTAG216</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Usuário</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u: any) => (
                      <SelectItem key={u.id || u.user_id} value={u.id || u.user_id}>{u.name || u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empresa</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enerlight" />
              </div>
            </div>

            {created && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={created.status === "active" ? "default" : "secondary"}>{created.status}</Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Slug amigável (URL)</Label>
                  <div className="flex gap-2 mt-1">
                    <div className="flex items-center bg-background border rounded-md flex-1 overflow-hidden">
                      <span className="text-xs text-muted-foreground px-2 whitespace-nowrap border-r">/c/</span>
                      <Input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="mari-oliveira"
                        className="border-0 focus-visible:ring-0"
                      />
                    </div>
                    <Button size="sm" onClick={handleSaveSlug} disabled={savingSlug || slug === created.public_slug}>
                      {savingSlug ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">URL pública: <code>{created.public_url}</code></p>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => window.open(created.public_url, "_blank")}>
                    <ExternalLink className="h-4 w-4 mr-1" /> Visualizar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(created.qr_code_url, "_blank")}>
                    <QrCode className="h-4 w-4 mr-1" /> QR Code
                  </Button>
                </div>
              </div>
            )}


            {!created && (
              <Button onClick={handleCreate} disabled={createCard.isPending} className="w-full">
                {createCard.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Associar Cartão
              </Button>
            )}
          </TabsContent>

          <TabsContent value="profile" className="space-y-4 pt-4">
            <div>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">DADOS PESSOAIS</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nome de exibição</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Mari Oliveira" /></div>
                <div><Label>Cargo</Label><Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Gestora Comercial" /></div>
                <div className="col-span-2">
                  <Label>Foto do vendedor</Label>
                  <ImageDropUpload value={photoUrl} onChange={setPhotoUrl} />
                </div>
                <div className="col-span-2"><Label>Bio / frase</Label><Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Conectando soluções em iluminação a grandes resultados." /></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">CONTATOS</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" /></div>
                <div><Label>WhatsApp</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 98765-4321" /></div>
                <div><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Site</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." /></div>
                <div><Label>LinkedIn</Label><Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} /></div>
                <div><Label>Instagram</Label><Input value={instagram} onChange={(e) => setInstagram(e.target.value)} /></div>
                <div className="col-span-2"><Label>Endereço</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">EMPRESA</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nome da empresa</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Enerlight" /></div>
                <div><Label>Logo da empresa</Label><ImageDropUpload value={companyLogo} onChange={setCompanyLogo} aspect="square" enablePaste={false} /></div>
                <div className="col-span-2"><Label>Descrição da empresa</Label><Input value={companyDesc} onChange={(e) => setCompanyDesc(e.target.value)} placeholder="Soluções completas em iluminação LED..." /></div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">SEÇÃO DE DESTAQUE (abaixo dos contatos)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Imagem de destaque</Label>
                  <ImageDropUpload value={showcaseImage} onChange={setShowcaseImage} aspect="wide" enablePaste={false} />
                </div>
                <div className="col-span-2"><Label>Título do destaque</Label><Input value={showcaseTitle} onChange={(e) => setShowcaseTitle(e.target.value)} placeholder="Soluções em iluminação LED" /></div>
                <div className="col-span-2">
                  <Label>Texto / descrição</Label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={showcaseDesc}
                    onChange={(e) => setShowcaseDesc(e.target.value)}
                    placeholder="Desenvolvemos soluções completas para indústrias, postos, condomínios..."
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-muted-foreground">CTA — BAIXAR CATÁLOGOS</h4>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={catalogEnabled} onChange={(e) => setCatalogEnabled(e.target.checked)} />
                  Ativo
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Título do CTA</Label><Input value={catalogTitle} onChange={(e) => setCatalogTitle(e.target.value)} placeholder="BAIXE NOSSOS CATÁLOGOS" /></div>
                <div className="col-span-2"><Label>Subtítulo / chamada</Label><Input value={catalogSubtitle} onChange={(e) => setCatalogSubtitle(e.target.value)} placeholder="Informe seu WhatsApp e libere acesso..." /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Ao clicar, o visitante informa nome + WhatsApp. Após validação real do WhatsApp, os materiais são liberados e o lead é salvo em <b>Prospects</b> com origem <code>NFC: {slug || "slug"}</code>.
              </p>
            </div>


            <Button onClick={handleSaveProfile} disabled={saveProfile.isPending} className="w-full">
              {saveProfile.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar perfil
            </Button>
          </TabsContent>


          <TabsContent value="write" className="space-y-4 pt-4">
            {supported ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Aproxime o cartão NFC do dispositivo e clique em gravar. A URL pública será gravada no chip.
                </p>
                <Button onClick={handleWrite} disabled={writing} className="w-full">
                  {writing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Nfc className="h-4 w-4 mr-2" />}
                  Gravar URL NFC
                </Button>
              </>
            ) : (
              created && <NfcWriteTutorial url={created.public_url} />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
