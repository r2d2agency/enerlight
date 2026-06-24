import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { eadApi, eadToken, EadStudent } from '@/lib/ead-api';
import { Button } from '@/components/ui/button';
import { GraduationCap, Award, BookOpen, LogOut } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  requireAuth?: boolean;
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

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/ead" className="flex items-center gap-2 font-semibold">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span>Academia</span>
          </Link>
          {student && (
            <nav className="flex items-center gap-2 text-sm">
              <Link to="/ead"><Button variant={loc.pathname === '/ead' ? 'secondary' : 'ghost'} size="sm"><BookOpen className="h-4 w-4 mr-1" />Cursos</Button></Link>
              <Link to="/ead/certificados"><Button variant={loc.pathname === '/ead/certificados' ? 'secondary' : 'ghost'} size="sm"><Award className="h-4 w-4 mr-1" />Certificados</Button></Link>
              <span className="hidden md:inline text-muted-foreground px-2">{student.name}</span>
              <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
