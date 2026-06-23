import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Phone, MessageCircle, Mail, Globe, MapPin, UserPlus,
  Linkedin, Instagram, ExternalLink, FileText, Loader2, Radio,
} from "lucide-react";
import { LeadCaptureModal } from "@/components/nfc/LeadCaptureModal";
import { CatalogLeadModal } from "@/components/nfc/CatalogLeadModal";

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
  const [materialsOpen, setMaterialsOpen] = useState(false);
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
  const wppHuman = p.whatsapp;
  const siteShort = (p.website || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  useEffect(() => {
    if (name) document.title = `${name} • Ener ID`;
  }, [name]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#020617" }}>
        <Loader2 className="animate-spin text-white" />
      </div>
    );
  if (error || !data)
    return (
      <div className="min-h-screen flex items-center justify-center text-white" style={{ background: "#020617" }}>
        {error || "Erro"}
      </div>
    );

  function handleMaterial(m: any) {
    if (m.requires_lead) {
      setActiveMat(m);
      setLeadOpen(true);
    } else {
      window.open(m.file_url, "_blank");
    }
  }

  return (
    <div
      className="min-h-screen pb-10"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% -10%, #0b1a3a 0%, transparent 60%), radial-gradient(900px 500px at 100% 30%, #0a1f4d 0%, transparent 60%), #020617",
      }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* NFC badge */}
        <div className="flex justify-end mb-2">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-[#60a5fa]">
              <Radio className="h-4 w-4" />
              <span className="text-xs font-bold tracking-widest">NFC</span>
              <Radio className="h-4 w-4 scale-x-[-1]" />
            </div>
            <p className="text-[10px] text-[#60a5fa]/70 tracking-wider mt-0.5">TOQUE AQUI</p>
          </div>
        </div>

        {/* Hero */}
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-5 items-start">
          <div
            className="relative aspect-[3/4] sm:aspect-square sm:w-40 rounded-2xl overflow-hidden ring-1 ring-[#1e3a8a]/60"
            style={{ background: "linear-gradient(135deg,#0b1a3a,#0a1f4d)" }}
          >
            {p.photo_url ? (
              <img src={p.photo_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl text-white/40 font-bold">
                {(name || "?")[0]}
              </div>
            )}
            <div
              className="absolute -bottom-2 -left-2 right-0 h-12 pointer-events-none"
              style={{ background: "linear-gradient(90deg, transparent, rgba(59,130,246,0.35), rgba(251,191,36,0.25))", filter: "blur(8px)" }}
            />
          </div>

          <div className="text-white">
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{name}</h1>
            {p.role_title && (
              <p className="text-[#fbbf24] text-lg font-medium mt-1">{p.role_title}</p>
            )}
            <div
              className="my-3 h-px w-24"
              style={{ background: "linear-gradient(90deg,#fbbf24,transparent)" }}
            />
            {p.bio && <p className="text-white/70 text-sm leading-relaxed">{p.bio}</p>}
            {p.company_logo_url ? (
              <img src={p.company_logo_url} alt={p.company_name} className="h-10 mt-4 object-contain" />
            ) : p.company_name ? (
              <p className="text-[#60a5fa] font-semibold mt-3 text-lg">{p.company_name}</p>
            ) : null}
          </div>
        </div>

        {/* Action grid 3x2 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
          {wppDigits && (
            <PrimaryAction
              href={`https://wa.me/${wppDigits}`}
              icon={<MessageCircle className="h-5 w-5" />}
              label="WhatsApp"
              variant="whatsapp"
            />
          )}
          {p.phone && (
            <PrimaryAction
              href={`tel:${p.phone}`}
              icon={<Phone className="h-5 w-5" />}
              label="Ligar"
            />
          )}
          {p.email && (
            <PrimaryAction
              href={`mailto:${p.email}`}
              icon={<Mail className="h-5 w-5" />}
              label="E-mail"
            />
          )}
          <PrimaryAction
            href={`${API_BASE}/api/nfc/public/${slug}/vcard`}
            icon={<UserPlus className="h-5 w-5" />}
            label="Salvar Contato"
            sub="Adicionar à agenda"
            download
          />
          {p.website && (
            <PrimaryAction
              href={p.website}
              icon={<Globe className="h-5 w-5" />}
              label="Site"
              sub={siteShort}
            />
          )}
          {p.address && (
            <PrimaryAction
              href={`https://maps.google.com/?q=${encodeURIComponent(p.address)}`}
              icon={<MapPin className="h-5 w-5" />}
              label="Localização"
              sub="Ver no mapa"
            />
          )}
        </div>

        {/* Meus Contatos */}
        <SectionCard>
          <SectionTitle>MEUS CONTATOS</SectionTitle>
          <div className="mt-3 divide-y divide-white/5">
            <ContactRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={p.phone} action={p.phone ? `tel:${p.phone}` : undefined} />
            <ContactRow icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" value={wppHuman} action={wppDigits ? `https://wa.me/${wppDigits}` : undefined} accent="whatsapp" />
            <ContactRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={p.email} action={p.email ? `mailto:${p.email}` : undefined} />
            <ContactRow icon={<Globe className="h-4 w-4" />} label="Site" value={siteShort} action={p.website || undefined} />
            <ContactRow icon={<Linkedin className="h-4 w-4" />} label="LinkedIn" value={p.linkedin} action={p.linkedin || undefined} />
            <ContactRow icon={<Instagram className="h-4 w-4" />} label="Instagram" value={p.instagram} action={p.instagram || undefined} />
          </div>
        </SectionCard>

        {/* Empresa */}
        {(p.company_description || p.company_logo_url || p.company_name) && (
          <SectionCard>
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 items-center">
              <div className="flex items-center justify-center">
                {p.company_logo_url ? (
                  <img src={p.company_logo_url} alt={p.company_name} className="h-16 object-contain" />
                ) : (
                  <div className="text-2xl font-bold text-white">{p.company_name}</div>
                )}
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">
                  {p.company_tagline || "Soluções e serviços"}
                </h3>
                {p.company_description && (
                  <p className="text-white/60 text-sm mt-2 leading-relaxed">{p.company_description}</p>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {/* Materiais */}
        {data.materials.length > 0 && (
          <SectionCard>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-[#1e3a8a]/40 ring-1 ring-[#3b82f6]/40 p-3 text-[#60a5fa]">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold tracking-wide">MATERIAIS E CATÁLOGOS</h3>
                  <p className="text-white/60 text-sm mt-1">
                    Acesse catálogos, apresentações e conteúdos técnicos.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMaterialsOpen((v) => !v)}
                className="rounded-xl px-5 py-3 text-white font-semibold transition flex items-center gap-2 justify-center"
                style={{ background: "linear-gradient(180deg,#1e3a8a,#1e40af)", boxShadow: "0 8px 24px -10px rgba(59,130,246,0.6)" }}
              >
                <FileText className="h-4 w-4" /> Ver materiais
              </button>
            </div>

            {materialsOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                {data.materials.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleMaterial(m)}
                    className="text-left bg-white/5 hover:bg-white/10 transition border border-white/10 rounded-xl p-3"
                  >
                    <div className="flex items-center gap-2 text-white">
                      <FileText className="h-4 w-4 text-[#60a5fa]" />
                      <span className="text-sm font-medium line-clamp-2">{m.title}</span>
                    </div>
                    {m.description && (
                      <p className="text-xs text-white/50 mt-1 line-clamp-2">{m.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* Footer */}
        <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm">
            <span className="font-medium text-white/90">
              Acompanhe {p.company_name || "a empresa"}
            </span>
            <span className="text-white/20">|</span>
            {p.instagram && (
              <a href={p.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-white">
                <Instagram className="h-4 w-4" /> Instagram
              </a>
            )}
            {p.linkedin && (
              <a href={p.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-white">
                <Linkedin className="h-4 w-4" /> LinkedIn
              </a>
            )}
            {p.website && (
              <a href={p.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-white">
                <Globe className="h-4 w-4" /> Site
              </a>
            )}
          </div>
        </div>

        <p className="text-center text-white/30 text-xs py-4">Powered by Ener ID</p>
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

function PrimaryAction({ href, icon, label, sub, variant, download }: any) {
  const isWA = variant === "whatsapp";
  const styles = isWA
    ? { background: "linear-gradient(180deg,#22c55e,#16a34a)", boxShadow: "0 10px 24px -10px rgba(34,197,94,0.6)" }
    : { background: "linear-gradient(180deg,#0f2454,#0a1c44)", boxShadow: "0 6px 18px -8px rgba(59,130,246,0.4)" };
  return (
    <a
      href={href}
      target={download ? "_self" : "_blank"}
      rel="noreferrer"
      className="rounded-2xl px-4 py-4 text-white transition active:scale-[0.98] border border-white/5 flex items-center gap-3"
      style={styles}
    >
      <div className="rounded-full bg-white/10 p-2">{icon}</div>
      <div className="min-w-0">
        <div className="font-semibold leading-tight truncate">{label}</div>
        {sub && <div className="text-xs text-white/70 truncate">{sub}</div>}
      </div>
    </a>
  );
}

function SectionCard({ children }: any) {
  return (
    <div
      className="mt-5 rounded-2xl border border-white/5 p-5"
      style={{
        background: "linear-gradient(180deg, rgba(15,36,84,0.55), rgba(10,28,68,0.55))",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: any) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-white font-bold tracking-widest text-sm">{children}</h2>
      <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg,#fbbf24,transparent)" }} />
    </div>
  );
}

function ContactRow({ icon, label, value, action, accent }: any) {
  if (!value) return null;
  const iconBtnColor = accent === "whatsapp" ? "bg-[#16a34a]/20 text-[#22c55e] ring-[#22c55e]/30" : "bg-[#1e3a8a]/40 text-[#60a5fa] ring-[#3b82f6]/30";
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3 text-white/80 min-w-0">
        <span className="text-white/50">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-white text-sm truncate max-w-[180px] sm:max-w-[280px]">{value}</span>
        {action && (
          <a
            href={action}
            target="_blank"
            rel="noreferrer"
            className={`rounded-full p-1.5 ring-1 ${iconBtnColor} hover:opacity-80 transition`}
            aria-label={`Abrir ${label}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
