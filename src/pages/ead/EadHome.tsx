import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { EadLayout, useBrand } from './EadLayout';
import { BookOpen, FileText, Award, ShoppingBag, ArrowRight, Loader2 } from 'lucide-react';

function HomeInner() {
  const { student, link } = useBrand();
  const [stats, setStats] = useState({ courses: 0, manuals: 0, certificates: 0 });
  const [loading, setLoading] = useState(true);

  const primary = student?.brand_primary || '#FB0812';
  const accent = student?.brand_accent || '#FFD500';

  useEffect(() => {
    if (!eadToken.get()) return;
    (async () => {
      try {
        const [courses, manuals, certs] = await Promise.all([
          eadApi.courses(),
          eadApi.myManuals().catch(() => []),
          eadApi.myCertificates().catch(() => []),
        ]);
        setStats({ courses: courses.length, manuals: manuals.length, certificates: certs.length });
      } finally { setLoading(false); }
    })();
  }, []);

  const firstName = student?.name?.split(' ')[0] || 'instalador';
  const brandName = student?.brand_name || 'Academia';
  const cover = student?.brand_cover_url ? resolveMediaUrl(student.brand_cover_url) : null;

  const tiles = [
    { to: link('cursos'), icon: BookOpen, title: 'Cursos', desc: 'Vídeo-aulas técnicas e novas técnicas de aplicação.', count: stats.courses, cta: 'Explorar', border: accent },
    { to: link('manuais'), icon: FileText, title: 'Manuais', desc: 'Documentação técnica e tabelas de aplicação.', count: stats.manuals, cta: 'Consultar', border: primary },
    { to: link('certificados'), icon: Award, title: 'Certificados', desc: 'Valide seu conhecimento e baixe seus PDFs oficiais.', count: stats.certificates, cta: 'Visualizar', border: accent },
    { to: '#', icon: ShoppingBag, title: 'Catálogo', desc: 'Acesso direto ao portfólio oficial de produtos.', count: 0, cta: 'Em breve', border: '#334155', disabled: true },
  ];

  return (
    <div className="-mx-4 -my-6">
      {/* HERO */}
      <section
        className="relative overflow-hidden min-h-[380px] md:min-h-[440px] flex items-center"
        style={{ backgroundColor: '#0f0f10' }}
      >
        {cover ? (
          <>
            <img
              src={cover}
              alt={`Destaque ${brandName}`}
              className="absolute inset-0 w-full h-full object-cover opacity-40"
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(90deg, #0f0f10 0%, rgba(15,15,16,0.85) 55%, rgba(15,15,16,0.2) 100%)' }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0 opacity-40"
            style={{ background: `radial-gradient(circle at 25% 50%, ${primary}66, transparent 55%), radial-gradient(circle at 80% 20%, ${accent}33, transparent 60%)` }}
          />
        )}

        {/* diagonal accent block */}
        <div
          className="absolute bottom-0 right-0 w-1/3 h-full opacity-20 hidden md:block"
          style={{ backgroundColor: primary, transform: 'skewX(-20deg) translateX(50%)' }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 w-full py-14 md:py-20">
          <div className="flex items-center gap-3 mb-5">
            <span className="h-[3px] w-12" style={{ backgroundColor: accent }} />
            <span
              className="font-black text-[11px] uppercase tracking-[0.25em]"
              style={{ color: accent }}
            >
              {brandName} · Academia do Instalador
            </span>
          </div>

          <h1
            className="text-white uppercase leading-[0.92] tracking-tighter mb-6"
            style={{
              fontFamily: '"Archivo Black", "Sora", system-ui, sans-serif',
              fontSize: 'clamp(2.5rem, 6vw, 5rem)',
              fontWeight: 900,
            }}
          >
            OLÁ, <span style={{ color: primary }}>{firstName.toUpperCase()}</span>.
            <br />
            DOMINE A PERFORMANCE.
          </h1>

          <p className="text-slate-300 text-base md:text-lg mb-8 max-w-lg">
            Acesse cursos, manuais técnicos e certificações exclusivas para parceiros.
            Aprenda no seu ritmo, comprove sua expertise.
          </p>

          <Link
            to={link('cursos')}
            className="inline-flex items-center gap-3 px-7 py-4 font-black uppercase tracking-tight text-sm transition-colors group"
            style={{ backgroundColor: accent, color: '#0f0f10' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accent)}
          >
            Começar agora
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* MODULES GRID */}
      <div className="bg-muted/30 pb-16">
        <main className="max-w-6xl mx-auto px-4 md:px-6 -mt-12 relative z-20">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {tiles.map((t) => {
                const Icon = t.icon;
                const inner = (
                  <div
                    className={`group relative bg-card shadow-2xl p-7 md:p-8 flex flex-col h-full border-t-8 transition-all duration-300 ${
                      t.disabled ? 'opacity-70' : 'hover:-translate-y-2 cursor-pointer'
                    }`}
                    style={{ borderTopColor: t.border }}
                  >
                    {t.disabled && (
                      <span
                        className="absolute top-4 right-4 px-2 py-1 text-[9px] font-black uppercase tracking-widest"
                        style={{ backgroundColor: accent, color: '#0f0f10' }}
                      >
                        Em breve
                      </span>
                    )}

                    <div
                      className="w-14 h-14 flex items-center justify-center mb-6 bg-muted transition-colors"
                      style={t.disabled ? {} : undefined}
                    >
                      <Icon className="w-7 h-7 text-foreground/80" />
                    </div>

                    <div className="flex items-baseline justify-between mb-2">
                      <h3
                        className="uppercase tracking-tight text-xl"
                        style={{
                          fontFamily: '"Archivo Black", "Sora", system-ui, sans-serif',
                          fontWeight: 900,
                        }}
                      >
                        {t.title}
                      </h3>
                      {!t.disabled && (
                        <span
                          className="text-3xl font-black tabular-nums"
                          style={{ fontFamily: '"Archivo Black", "Sora", system-ui, sans-serif' }}
                        >
                          {t.count}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed mb-8 flex-grow">
                      {t.desc}
                    </p>

                    <div
                      className="text-[11px] font-black uppercase tracking-[0.2em] inline-flex items-center gap-2 self-start pb-1 border-b-2 transition-colors"
                      style={{
                        color: t.disabled ? 'hsl(var(--muted-foreground))' : primary,
                        borderColor: t.disabled ? 'transparent' : primary,
                      }}
                    >
                      {t.cta}
                      {!t.disabled && <ArrowRight className="w-3 h-3" />}
                    </div>
                  </div>
                );
                return t.disabled ? (
                  <div key={t.title}>{inner}</div>
                ) : (
                  <Link key={t.title} to={t.to} className="block">
                    {inner}
                  </Link>
                );
              })}
            </div>

            
          )}
        </main>
      </div>
    </div>
  );
}

export default function EadHome() {
  return <EadLayout><HomeInner /></EadLayout>;
}
