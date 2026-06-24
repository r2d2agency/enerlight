import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { eadApi, eadToken, EadStudent } from '@/lib/ead-api';
import { Button } from '@/components/ui/button';
import { GraduationCap, Award, BookOpen, LogOut, FileText, Home, Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  requireAuth?: boolean;
}

// Convert hex to "h s% l%" for HSL custom properties (shadcn)
function hexToHsl(hex?: string | null): string | null {
  if (!hex) return null;
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
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

export function EadLayout({ children, requireAuth = true }: Props) {
  const [student, setStudent] = useState<EadStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!eadToken.get()) { setLoading(false); return; }
    eadApi.me().then(r => setStudent(r.student)).catch(() => eadToken.clear()).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading && requireAuth && !student) nav('/ead/login', { replace: true });
  }, [loading, student, requireAuth, nav]);

  const logout = () => { eadToken.clear(); setStudent(null); nav('/ead/login'); };

  const brandHsl = hexToHsl(student?.brand_primary);
  const styleVars = brandHsl ? ({ ['--primary' as any]: brandHsl, ['--ring' as any]: brandHsl } as React.CSSProperties) : undefined;

  const tabs = [
    { to: '/ead', label: 'Início', icon: Home },
    { to: '/ead/cursos', label: 'Cursos', icon: BookOpen },
    { to: '/ead/manuais', label: 'Manuais', icon: FileText },
    { to: '/ead/certificados', label: 'Certificados', icon: Award },
  ];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30" style={styleVars}>
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/ead" className="flex items-center gap-2 font-semibold min-w-0">
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
                const active = loc.pathname === t.to;
                const Icon = t.icon;
                return (
                  <Link key={t.to} to={t.to}>
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
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
