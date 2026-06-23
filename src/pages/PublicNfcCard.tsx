import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Phone, MessageCircle, Mail, Globe, MapPin, UserPlus,
  Linkedin, Instagram, ExternalLink, FileText, Loader2,
} from "lucide-react";
import { CatalogLeadModal } from "@/components/nfc/CatalogLeadModal";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface BrandingTheme {
  nfc_default_logo?: string | null;
  nfc_primary_color?: string | null;
  nfc_accent_color?: string | null;
  nfc_bg_color?: string | null;
  nfc_bg_gradient?: string | null;
  nfc_brand_name?: string | null;
  nfc_footer_text?: string | null;
}

interface NfcCategory {
  id: string;
  name: string;
  image_url: string | null;
}

interface CardData {
  card: { id: string; public_slug: string; public_url: string; qr_code_url: string };
  profile: any;
  materials: any[];
  org_logo?: string | null;
  branding?: BrandingTheme;
  categories?: NfcCategory[];
}

export default function PublicNfcCard() {
  const { slug = "" } = useParams();
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [activeMat, setActiveMat] = useState<any>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

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
  const b = data?.branding || {};
  const name = p.display_name || data?.card.public_slug;
  const heroLogo = p.company_logo_url || data?.org_logo || null;
  const wppDigits = useMemo(() => (p.whatsapp || "").replace(/\D/g, ""), [p.whatsapp]);
  const wppHuman = p.whatsapp;
  const siteShort = (p.website || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  const primary = b.nfc_primary_color || "#3b82f6";
  const accent = b.nfc_accent_color || "#fbbf24";
  const bgColor = b.nfc_bg_color || "#020617";
  const bgGradient = b.nfc_bg_gradient
    || `radial-gradient(1200px 600px at 20% -10%, ${primary}33 0%, transparent 60%), radial-gradient(900px 500px at 100% 30%, ${primary}22 0%, transparent 60%), ${bgColor}`;

  // Group materials by category
  const materialsByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    (data?.materials || []).forEach((m: any) => {
      const k = m.category || "Geral";
      (map[k] ||= []).push(m);
    });
    return map;
  }, [data?.materials]);
  const [matCat, setMatCat] = useState<string>("__all");

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
      style={{ background: bgGradient }}
    >
      <div className="max-w-2xl mx-auto px-4 pt-6">
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
              <p className="text-lg font-medium mt-1" style={{ color: accent }}>{p.role_title}</p>
            )}
            <div
              className="my-3 h-px w-24"
              style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
            />
            {p.bio && <p className="text-white/70 text-sm leading-relaxed">{p.bio}</p>}
          </div>
        </div>

        {/* Logo centralizada */}
        {heroLogo ? (
          <div className="flex justify-center mt-5">
            <img src={heroLogo} alt={p.company_name || "Logo"} className="h-14 sm:h-16 object-contain" />
          </div>
        ) : p.company_name ? (
          <div className="text-center mt-5">
            <p className="text-[#60a5fa] font-semibold text-lg">{p.company_name}</p>
          </div>
        ) : null}


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

        {/* Showcase configurável */}
        {(p.showcase_title || p.showcase_description || p.showcase_image_url) && (
          <SectionCard>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-5 items-center">
              {p.showcase_image_url && (
                <div className="rounded-xl overflow-hidden ring-1 ring-white/10 aspect-video sm:aspect-square bg-black/30">
                  <img src={p.showcase_image_url} alt={p.showcase_title || "Destaque"} className="w-full h-full object-cover" />
                </div>
              )}
              <div className={p.showcase_image_url ? "" : "sm:col-span-2"}>
                {p.showcase_title && (
                  <h3 className="text-white font-bold text-xl leading-tight">{p.showcase_title}</h3>
                )}
                {p.showcase_description && (
                  <p className="text-white/70 text-sm leading-relaxed mt-2 whitespace-pre-line">
                    {p.showcase_description}
                  </p>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {/* CTA Catálogos e materiais (gera lead com verificação WhatsApp) */}
        {(p.catalog_cta_enabled !== false) && (
          <SectionCard>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-[#1e3a8a]/40 ring-1 ring-[#3b82f6]/40 p-3 text-[#60a5fa]">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold tracking-wide">
                    {p.catalog_cta_title || "CATÁLOGOS E MATERIAIS"}
                  </h3>
                  <p className="text-white/60 text-sm mt-1">
                    {p.catalog_cta_subtitle || "Informe seu WhatsApp e libere acesso aos catálogos e materiais."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCatalogOpen(true)}
                className="rounded-xl px-5 py-3 text-white font-semibold transition flex items-center gap-2 justify-center active:scale-[0.98]"
                style={{ background: "linear-gradient(180deg,#1e3a8a,#1e40af)", boxShadow: "0 8px 24px -10px rgba(59,130,246,0.6)" }}
              >
                <FileText className="h-4 w-4" /> Ver materiais
              </button>
            </div>
          </SectionCard>
        )}

        {/* Categorias visuais (seleção por vendedor) */}
        {data.categories && data.categories.length > 0 && (
          <SectionCard>
            <SectionTitle>CATEGORIAS</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {data.categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setMaterialsOpen(true);
                    setMatCat(c.name);
                    setTimeout(() => {
                      document.getElementById("nfc-materials")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 60);
                  }}
                  className="group relative aspect-square rounded-xl overflow-hidden ring-1 ring-white/10 bg-white/5 hover:ring-white/30 transition"
                >
                  {c.image_url ? (
                    <img src={c.image_url} alt={c.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/30">
                      <FileText className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                    <p className="text-white font-semibold text-sm leading-tight drop-shadow line-clamp-2">{c.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        )}


        {/* Empresa */}
        {(p.company_description || heroLogo || p.company_name) && (
          <SectionCard>
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 items-center">
              <div className="flex items-center justify-center">
                {heroLogo ? (
                  <img src={heroLogo} alt={p.company_name || "Logo"} className="h-16 object-contain" />
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

        <p className="text-center text-white/30 text-xs py-4">{b.nfc_footer_text || "Powered by Ener ID"}</p>
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

      <CatalogLeadModal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        slug={slug}
        apiBase={API_BASE}
        ctaTitle={p.catalog_cta_title}
        materials={data?.materials || []}
        branding={data?.branding || {}}
      />
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

function SectionCard({ children, id }: any) {
  return (
    <div
      id={id}
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
