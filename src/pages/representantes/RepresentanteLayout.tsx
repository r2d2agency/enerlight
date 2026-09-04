import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { representantesApi, rpToken, RpRepresentative } from '@/lib/representantes-api';
import { Loader2, Users, LayoutDashboard, Building2, ShoppingCart, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/representantes/dashboard', icon: LayoutDashboard },
  { name: 'Minhas Empresas', href: '/representantes/empresas', icon: Building2 },
  { name: 'Pedidos', href: '/representantes/pedidos', icon: ShoppingCart },
];

const RepresentanteLayout = ({ children }: { children: (rep: RpRepresentative) => ReactNode }) => {
  const [representative, setRepresentative] = useState<RpRepresentative | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = rpToken.get();
    if (!token) {
      navigate('/representantes/login', { replace: true });
      return;
    }
    representantesApi
      .me()
      .then((res) => setRepresentative(res.representative))
      .catch(() => {
        rpToken.clear();
        navigate('/representantes/login', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLogout = () => {
    rpToken.clear();
    navigate('/representantes/login', { replace: true });
  };

  if (loading || !representative) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="gradient-primary p-2 rounded-full">
              <Users className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold">Portal de Representantes</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{representative.name}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm border-b-2 whitespace-nowrap',
                  active ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children(representative)}</main>
    </div>
  );
};

export default RepresentanteLayout;
