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

  const createCard = useCreateNfcCard();
  const saveProfile = useSaveNfcProfile();
  const supported = isWebNfcSupported();

  useEffect(() => {
    if (open) {
      api<any[]>("/api/nfc/users").then(setUsers).catch(() => setUsers([]));
      if (card) {
        setCreated(card);
        setUid(card.uid);
        setChipType(card.chip_type);
        setUserId(card.user_id || "");
        setCompanyName(card.company_name || "");
      } else {
        setCreated(null);
        setUid(""); setChipType("NTAG215"); setUserId(""); setCompanyName("");
      }
    }
  }, [open, card]);

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
          phone: phone || null,
          whatsapp: whatsapp || null,
          email: email || null,
          website: website || null,
          photo_url: photoUrl || null,
          linkedin: linkedin || null,
          instagram: instagram || null,
          bio: bio || null,
        },
      });
      toast.success("Perfil salvo");
    } catch (e: any) {
      toast.error(e.message);
    }
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
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={created.status === "active" ? "default" : "secondary"}>{created.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">URL Gerada</span>
                  <code className="text-xs">{created.public_url}</code>
                </div>
                <div className="flex gap-2 pt-2">
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

          <TabsContent value="profile" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome de exibição</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
              <div><Label>Cargo</Label><Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} /></div>
              <div><Label>Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><Label>WhatsApp</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
              <div><Label>E-mail</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label>Site</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
              <div className="col-span-2"><Label>Foto (URL)</Label><Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} /></div>
              <div><Label>LinkedIn</Label><Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} /></div>
              <div><Label>Instagram</Label><Input value={instagram} onChange={(e) => setInstagram(e.target.value)} /></div>
              <div className="col-span-2"><Label>Bio</Label><Input value={bio} onChange={(e) => setBio(e.target.value)} /></div>
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
