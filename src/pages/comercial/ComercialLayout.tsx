import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { comercialExternalApi, comercialToken, ComercialActor } from '@/lib/comercial-api';
import {
  Loader2, Briefcase, LayoutDashboard, Users, Handshake, FileText,
  ShoppingCart, Package, UserCog, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/comercial/dashboard', icon: LayoutDashboard, enabled: true },
  { name: 'Clientes', href: '/comercial/clientes', icon: Users, enabled: true },
  { name: 'Oportunidades', href: '/comercial/oportunidades', icon: Handshake, enabled: true },
  { name: 'Orçamentos', href: '/comercial/orcamentos', icon: FileText, enabled: true },
  { name: 'Vendas', href: '/comercial/vendas', icon: ShoppingCart, enabled: true },
  { name: 'Catálogo', href: '/comercial/catalogo', icon: Package, enabled: true },
  { name: 'Minha Conta', href: '/comercial/conta', icon: UserCog, enabled: false },
];

const ComercialLayout = ({ children }: { children: (actor: ComercialActor) => ReactNode }) => {
  const [actor, setActor] = useState<ComercialActor | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = comercialToken.get();
    if (!token) {
      navigate('/comercial/login', { replace: true });
      return;
    }
    comercialExternalApi
      .me()
      .then((res) => setActor(res.actor))
      .catch(() => {
        comercialToken.clear();
        navigate('/comercial/login', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLogout = () => {
    comercialToken.clear();
    navigate('/comercial/login', { replace: true });
  };

  if (loading || !actor) {
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
              <Briefcase className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold">Portal Comercial</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{actor.name}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
            if (!item.enabled) {
              return (
                <span
                  key={item.href}
                  className="flex items-center gap-2 px-3 py-2 text-sm border-b-2 border-transparent text-muted-foreground/50 whitespace-nowrap cursor-not-allowed"
                  title="Em breve"
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">em breve</Badge>
                </span>
              );
            }
            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm border-b-2 whitespace-nowrap',
                  active ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children(actor)}</main>
    </div>
  );
};

export default ComercialLayout;
