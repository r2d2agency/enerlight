import { ReactNode, useState } from 'react';
import { resolveMediaUrl } from '@/lib/media';
import { GraduationCap, ShieldCheck, Award, BookOpen } from 'lucide-react';
import enerlightLogo from '@/assets/enerlight-logo.png';

interface Props {
  brand: any;
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
}

export default function EadBrandShell({ brand, children, eyebrow, title, subtitle }: Props) {
  const primary = brand?.primary_color || '#0ea5e9';
  const accent = brand?.accent_color || '#0284c7';
  const logo = resolveMediaUrl(brand?.logo_url);
  const cover = resolveMediaUrl(brand?.cover_url);
  const name = brand?.name || 'Academia do Instalador';
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = !!logo && !logoFailed;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white lg:grid lg:grid-cols-[1.05fr_1fr] xl:grid-cols-[1.15fr_1fr]">
      {/* LEFT — brand showcase */}
      <aside
        className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 overflow-hidden"
        style={
          cover
            ? {
                backgroundImage: `linear-gradient(135deg, ${primary}f0 0%, ${accent}e6 55%, #0a0a0acc 100%), url(${cover})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {
                backgroundImage: `radial-gradient(circle at 20% 20%, ${primary} 0%, transparent 55%), radial-gradient(circle at 80% 80%, ${accent} 0%, transparent 50%), linear-gradient(135deg, #0f172a 0%, #020617 100%)`,
              }
        }
      >
        {/* soft grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />

        <header className="relative z-10 flex items-center gap-4">
          {showLogo ? (
            <div className="w-[120px] flex items-center justify-center shrink-0">
              <img
                src={logo}
                alt={name}
                className="block object-contain"
                style={{ width: '100px', height: 'auto' }}
                onError={() => setLogoFailed(true)}
              />
            </div>
          ) : (
            <div className="h-16 w-16 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
              <GraduationCap className="h-8 w-8 text-white" />
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/70">Academia</p>
            <h1 className="text-2xl font-bold leading-tight">{name}</h1>
          </div>
        </header>

        <ul className="relative z-10 grid grid-cols-1 gap-3 max-w-md">
          {[
            { icon: BookOpen, label: 'Módulos e aulas em vídeo' },
            { icon: ShieldCheck, label: 'Materiais técnicos oficiais' },
            { icon: Award, label: 'Certificado ao concluir a prova' },
          ].map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-white/95">
              <span className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium">{label}</span>
            </li>
          ))}
        </ul>

        <div className="relative z-10 flex items-center gap-2 text-white/70 text-xs">
          <span className="uppercase tracking-[0.2em]">Powered by</span>
          <img src={enerlightLogo} alt="Enerlight" className="h-6 w-auto object-contain" />
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <main className="relative flex flex-col min-h-screen bg-gradient-to-br from-slate-50 to-white text-slate-900">
        {/* mobile header with logo */}
        <div
          className="lg:hidden relative px-5 pt-8 pb-10 text-white overflow-hidden"
          style={{
            backgroundImage: cover
              ? `linear-gradient(135deg, ${primary}f0, ${accent}dd), url(${cover})`
              : `linear-gradient(135deg, ${primary}, ${accent})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="flex flex-col items-center gap-3">
            {showLogo ? (
              <div className="w-[120px] flex items-center justify-center">
                <img
                  src={logo}
                  alt={name}
                  className="block object-contain"
                  style={{ width: '100px', height: 'auto' }}
                  onError={() => setLogoFailed(true)}
                />
              </div>
            ) : (
              <GraduationCap className="h-10 w-10" />
            )}
            <p className="text-lg font-semibold">{name}</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10 lg:py-16">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center mb-8">
              <img src={enerlightLogo} alt="Enerlight" className="h-10 w-auto object-contain" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-1">Academia do Instalador</span>
            </div>

            {eyebrow && (
              <p className="text-xs uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: primary }}>
                {eyebrow}
              </p>
            )}
            {title && <h2 className="text-3xl font-bold tracking-tight mb-2">{title}</h2>}
            {subtitle && <p className="text-slate-500 mb-8">{subtitle}</p>}
            {children}
          </div>
        </div>

        <footer className="px-5 sm:px-8 py-5 text-xs text-slate-400 text-center border-t border-slate-100 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <img src={enerlightLogo} alt="Enerlight" className="h-5 w-auto object-contain opacity-80" />
          </div>
          <span>© {new Date().getFullYear()} {name} · Academia do Instalador</span>
        </footer>
      </main>
    </div>
  );
}
