import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eadApi, eadToken, EadStudent } from '@/lib/ead-api';
import { EadLayout } from './EadLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, FileText, Award, ShoppingBag, ArrowRight, Loader2 } from 'lucide-react';

export default function EadHome() {
  const [student, setStudent] = useState<EadStudent | null>(null);
  const [stats, setStats] = useState({ courses: 0, manuals: 0, certificates: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eadToken.get()) return;
    (async () => {
      try {
        const [me, courses, manuals, certs] = await Promise.all([
          eadApi.me(), eadApi.courses(), eadApi.myManuals().catch(() => []), eadApi.myCertificates().catch(() => []),
        ]);
        setStudent(me.student);
        setStats({ courses: courses.length, manuals: manuals.length, certificates: certs.length });
      } finally { setLoading(false); }
    })();
  }, []);

  const tiles = [
    { to: '/ead/cursos', icon: BookOpen, title: 'Cursos', desc: 'Assista às aulas e marque seu progresso.', count: stats.courses, color: 'bg-primary/10 text-primary' },
    { to: '/ead/manuais', icon: FileText, title: 'Manuais', desc: 'Apostilas e materiais para download.', count: stats.manuals, color: 'bg-amber-500/10 text-amber-600' },
    { to: '/ead/certificados', icon: Award, title: 'Certificados', desc: 'Seus certificados emitidos em PDF.', count: stats.certificates, color: 'bg-emerald-500/10 text-emerald-600' },
    { to: '#', icon: ShoppingBag, title: 'Catálogo de Produtos', desc: 'Em breve: catálogo oficial da marca.', count: 0, color: 'bg-muted text-muted-foreground', disabled: true },
  ];

  return (
    <EadLayout>
      <div
        className="rounded-2xl p-6 md:p-10 mb-8 relative overflow-hidden border"
        style={{
          background: student?.brand_primary
            ? `linear-gradient(135deg, ${student.brand_primary}22, ${student.brand_accent || student.brand_primary}11)`
            : undefined,
        }}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
          <div className="min-w-0">
            <Badge variant="secondary" className="mb-3">{student?.brand_name || 'Academia'}</Badge>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Olá, {student?.name?.split(' ')[0] || 'instalador'} 👋</h1>
            <p className="text-muted-foreground max-w-2xl">
              Aqui você acessa cursos, manuais offline, faz a prova e baixa seu certificado oficial.
            </p>
          </div>
          {student?.brand_logo && (
            <img src={student.brand_logo} alt={student.brand_name || ''} className="h-16 md:h-20 max-w-[200px] object-contain" />
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map(t => {
            const Icon = t.icon;
            const inner = (
              <Card className={`h-full transition ${t.disabled ? 'opacity-60' : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'}`}>
                <CardContent className="p-5">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-3 ${t.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex items-baseline justify-between mb-1">
                    <h3 className="font-semibold">{t.title}</h3>
                    {!t.disabled && <span className="text-2xl font-bold">{t.count}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{t.desc}</p>
                  {!t.disabled ? (
                    <div className="text-sm text-primary flex items-center gap-1 font-medium">
                      Acessar <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  ) : (
                    <Badge variant="outline">Em breve</Badge>
                  )}
                </CardContent>
              </Card>
            );
            return t.disabled ? <div key={t.title}>{inner}</div> : <Link key={t.title} to={t.to}>{inner}</Link>;
          })}
        </div>
      )}
    </EadLayout>
  );
}
