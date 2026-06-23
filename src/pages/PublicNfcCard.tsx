import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Phone, MessageCircle, Mail, Globe, MapPin, Download, Linkedin, Instagram, Loader2, FileText, Play } from "lucide-react";
import { LeadCaptureModal } from "@/components/nfc/LeadCaptureModal";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface CardData {
  card: { id: string; public_slug: string; public_url: string; qr_code_url: string };
  profile: any;
  materials: any[];
}

export default function PublicNfcCard() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [activeMat, setActiveMat] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/nfc/public/${slug}${window.location.search}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Cartão não encontrado");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const p = data?.profile || {};
  const name = p.display_name || data?.card.public_slug;
  const wppDigits = useMemo(() => (p.whatsapp || "").replace(/\D/g, ""), [p.whatsapp]);

  useEffect(() => {
    if (name) document.title = `${name} • Ener ID`;
  }, [name]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0c2340]"><Loader2 className="animate-spin text-white" /></div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center bg-[#0c2340] text-white">{error || "Erro"}</div>;

  function handleMaterial(m: any) {
    if (m.requires_lead) { setActiveMat(m); setLeadOpen(true); }
    else window.open(m.file_url, "_blank");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0c2340] via-[#0c2340] to-[#142a4e]">
      {/* Hero */}
      <div className="relative pb-20">
        <div className="h-40 bg-gradient-to-r from-[#0c2340] to-[#3b82f6]" />
        <div className="max-w-md mx-auto px-4 -mt-20 relative">
          <div className="flex flex-col items-center">
            <div className="w-32 h-32 rounded-full ring-4 ring-white bg-white overflow-hidden shadow-xl">
              {p.photo_url
                ? <img src={p.photo_url} alt={name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-4xl text-[#0c2340] font-bold">{(name || "?")[0]}</div>}
            </div>
            <h1 className="text-2xl font-bold text-white mt-3">{name}</h1>
            {p.role_title && <p className="text-white/80">{p.role_title}</p>}
            {p.company_name && <p className="text-[#3b82f6] font-semibold mt-1">{p.company_name}</p>}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-4 gap-2 mt-6">
            {wppDigits && <ActionBtn href={`https://wa.me/${wppDigits}`} icon={<MessageCircle />} label="WhatsApp" color="bg-[#25D366]" />}
            {p.phone && <ActionBtn href={`tel:${p.phone}`} icon={<Phone />} label="Ligar" />}
            {p.email && <ActionBtn href={`mailto:${p.email}`} icon={<Mail />} label="E-mail" />}
            {p.website && <ActionBtn href={p.website} icon={<Globe />} label="Site" />}
            {p.address && <ActionBtn href={`https://maps.google.com/?q=${encodeURIComponent(p.address)}`} icon={<MapPin />} label="Local" />}
            <ActionBtn href={`${API_BASE}/api/nfc/public/${slug}/vcard`} icon={<Download />} label="Salvar" color="bg-[#3b82f6]" download />
          </div>

          {/* Contacts */}
          <Section title="Meus contatos">
            <ContactRow icon={<MessageCircle className="text-[#25D366]" />} label="WhatsApp" value={p.whatsapp} href={wppDigits ? `https://wa.me/${wppDigits}` : undefined} />
            <ContactRow icon={<Phone />} label="Telefone" value={p.phone} href={p.phone ? `tel:${p.phone}` : undefined} />
            <ContactRow icon={<Mail />} label="E-mail" value={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
            <ContactRow icon={<Globe />} label="Site" value={p.website} href={p.website || undefined} />
            <ContactRow icon={<Linkedin />} label="LinkedIn" value={p.linkedin} href={p.linkedin || undefined} />
            <ContactRow icon={<Instagram />} label="Instagram" value={p.instagram} href={p.instagram || undefined} />
          </Section>

          {(p.company_description || p.company_logo_url) && (
            <Section title="Empresa">
              <div className="flex items-center gap-3">
                {p.company_logo_url && <img src={p.company_logo_url} alt={p.company_name} className="w-14 h-14 rounded-lg object-contain bg-white p-1" />}
                <div>
                  <p className="font-semibold text-white">{p.company_name}</p>
                  {p.company_description && <p className="text-sm text-white/70">{p.company_description}</p>}
                </div>
              </div>
            </Section>
          )}

          {data.materials.length > 0 && (
            <Section title="Materiais">
              <div className="grid grid-cols-2 gap-2">
                {data.materials.map((m) => (
                  <button key={m.id} onClick={() => handleMaterial(m)} className="bg-white/10 hover:bg-white/15 transition border border-white/10 rounded-xl p-3 text-left">
                    <div className="flex items-center gap-2 text-white">
                      {m.material_type === "video" ? <Play className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      <span className="text-sm font-medium line-clamp-2">{m.title}</span>
                    </div>
                    {m.description && <p className="text-xs text-white/60 mt-1 line-clamp-2">{m.description}</p>}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <p className="text-center text-white/40 text-xs py-6">Powered by Ener ID</p>
        </div>
      </div>

      {activeMat && (
        <LeadCaptureModal
          open={leadOpen}
          onOpenChange={setLeadOpen}
          slug={slug}
          materialId={activeMat.id}
          materialTitle={activeMat.title}
          apiBase={API_BASE}
        />
      )}
    </div>
  );
}

function ActionBtn({ href, icon, label, color = "bg-white/10", download }: any) {
  return (
    <a href={href} target={download ? "_self" : "_blank"} rel="noreferrer" className={`${color} hover:opacity-90 rounded-xl p-3 flex flex-col items-center gap-1 text-white text-xs font-medium`}>
      <span className="h-5 w-5">{icon}</span>
      {label}
    </a>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="mt-6">
      <h2 className="text-white/70 text-xs uppercase tracking-wider mb-2 font-semibold">{title}</h2>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 backdrop-blur">{children}</div>
    </div>
  );
}

function ContactRow({ icon, label, value, href }: any) {
  if (!value) return null;
  const inner = (
    <div className="flex items-center gap-3 text-white">
      <span className="h-5 w-5 text-white/80">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-white/60">{label}</p>
        <p className="text-sm truncate">{value}</p>
      </div>
    </div>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" className="block hover:opacity-80">{inner}</a> : inner;
}
