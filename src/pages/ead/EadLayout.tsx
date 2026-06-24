import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { eadApi, eadToken, EadStudent } from '@/lib/ead-api';
import { Button } from '@/components/ui/button';
import { GraduationCap, Award, BookOpen, LogOut, FileText, Home, Loader2, ChevronRight } from 'lucide-react';

export type Crumb = { label: string; to?: string };

interface Props {
  children: React.ReactNode;
  requireAuth?: boolean;
  breadcrumbs?: Crumb[];
}

// ---------- brand slug context ----------
interface BrandCtx {
  slug: string;
  student: EadStudent | null;
  link: (sub?: string) => string;
}
const BrandContext = createContext<BrandCtx | null>(null);
export function useBrand(): BrandCtx {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand fora de EadLayout');
  return ctx;
}

// Convert hex to "h s% l%" for shadcn HSL CSS vars
function hexToHsl(hex?: string | null): string | null {
  if (!hex) return null;
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function EadLayout({ children, requireAuth = true, breadcrumbs }: Props) {
  const [student, setStudent] = useState<EadStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const loc = useLocation();
  const params = useParams<{ slug?: string }>();
  const urlSlug = params.slug || null;

  useEffect(() => {
    if (!eadToken.get()) { setLoading(false); return; }
    eadApi.me().then(r => setStudent(r.student)).catch(() => eadToken.clear()).finally(() => setLoading(false));
  }, []);

  // Resolve effective slug (URL takes precedence, then student's brand)
  const slug = urlSlug || student?.brand_slug || '';

  // Redirects: auth + slug mismatch protection
  useEffect(() => {
    if (loading) return;
    if (requireAuth && !student) {
      const target = urlSlug ? `/marca/${urlSlug}` : '/ead/login';
      nav(target, { replace: true });
      return;
    }
    if (student && student.brand_slug && urlSlug && urlSlug !== student.brand_slug) {
      // user trying to access another brand's URL → bounce to their own brand
      nav(`/marca/${student.brand_slug}/inicio`, { replace: true });
    }
  }, [loading, student, requireAuth, urlSlug, nav]);

  const logout = () => { eadToken.clear(); setStudent(null); nav(urlSlug ? `/marca/${urlSlug}` : '/ead/login'); };

  const link = useMemo(() => {
    return (sub = '') => {
      if (!slug) return sub.startsWith('/') ? sub : `/${sub}`;
      const tail = sub.replace(/^\/+/, '');
      return tail ? `/marca/${slug}/${tail}` : `/marca/${slug}/inicio`;
    };
  }, [slug]);

  const brandHsl = hexToHsl(student?.brand_primary);
  const styleVars = brandHsl ? ({ ['--primary' as any]: brandHsl, ['--ring' as any]: brandHsl } as React.CSSProperties) : undefined;

  const tabs = [
    { to: link('inicio'), label: 'Início', icon: Home, key: 'inicio' },
    { to: link('cursos'), label: 'Cursos', icon: BookOpen, key: 'cursos' },
    { to: link('manuais'), label: 'Manuais', icon: FileText, key: 'manuais' },
    { to: link('certificados'), label: 'Certificados', icon: Award, key: 'certificados' },
  ];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  const ctxValue: BrandCtx = { slug, student, link };

  // Always prepend "Início" to breadcrumbs if not already there
  const crumbs: Crumb[] = breadcrumbs && breadcrumbs.length
    ? (breadcrumbs[0]?.to === link('inicio') ? breadcrumbs : [{ label: 'Início', to: link('inicio') }, ...breadcrumbs])
    : [];

  return (
    <BrandContext.Provider value={ctxValue}>
      <div className="min-h-screen bg-muted/30" style={styleVars}>
        <header className="bg-background border-b sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <Link to={link('inicio')} className="flex items-center gap-2 font-semibold min-w-0">
              {student?.brand_logo ? (
                <img src={student.brand_logo} alt={student.brand_name || ''} className="h-8 w-auto max-w-[140px] object-contain" />
              ) : (
                <GraduationCap className="h-6 w-6 text-primary" />
              )}
              <span className="truncate">{student?.brand_name || 'Academia'}</span>
            </Link>
            {student && (
              <nav className="flex items-center gap-1 text-sm overflow-x-auto">
                {tabs.map(t => {
                  const active = loc.pathname === t.to || (t.key === 'cursos' && loc.pathname.startsWith(link('curso/')));
                  const Icon = t.icon;
                  return (
                    <Link key={t.key} to={t.to}>
                      <Button variant={active ? 'secondary' : 'ghost'} size="sm">
                        <Icon className="h-4 w-4 md:mr-1" />
                        <span className="hidden md:inline">{t.label}</span>
                      </Button>
                    </Link>
                  );
                })}
                <span className="hidden lg:inline text-muted-foreground px-2 truncate max-w-[160px]">{student.name}</span>
                <Button variant="ghost" size="sm" onClick={logout} title="Sair"><LogOut className="h-4 w-4" /></Button>
              </nav>
            )}
          </div>
        </header>

        {crumbs.length > 0 && (
          <div className="bg-background/60 border-b">
            <nav aria-label="Breadcrumb" className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <span key={`${c.label}-${i}`} className="flex items-center gap-1 whitespace-nowrap">
                    {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
                    {c.to && !last
                      ? <Link to={c.to} className="hover:text-foreground transition">{c.label}</Link>
                      : <span className={last ? 'text-foreground font-medium' : ''}>{c.label}</span>}
                  </span>
                );
              })}
            </nav>
          </div>
        )}

        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </div>
    </BrandContext.Provider>
  );
}
