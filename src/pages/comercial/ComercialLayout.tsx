import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { comercialExternalApi, comercialToken, ComercialActor } from '@/lib/comercial-api';
import {
  Loader2, Building2, LayoutDashboard, Users, Handshake, FileText,
  ShoppingCart, Package, UserCog, LogOut, Megaphone, Search, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/comercial/dashboard', icon: LayoutDashboard, enabled: true },
  { name: 'Clientes', href: '/comercial/clientes', icon: Users, enabled: true },
  { name: 'Oportunidades', href: '/comercial/oportunidades', icon: Handshake, enabled: true },
  { name: 'Orçamentos', href: '/comercial/orcamentos', icon: FileText, enabled: true },
  { name: 'Vendas', href: '/comercial/vendas', icon: ShoppingCart, enabled: true },
  { name: 'Catálogo', href: '/comercial/catalogo', icon: Package, enabled: true },
  { name: 'Marketing', href: '/comercial/marketing', icon: Megaphone, enabled: true },
  { name: 'Minha conta', href: '/comercial/conta', icon: UserCog, enabled: false },
];

const ComercialLayout = ({ children }: { children: (actor: ComercialActor) => ReactNode }) => {
  const [actor, setActor] = useState<ComercialActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = comercialToken.get();
    if (!token) { navigate('/comercial/login', { replace: true }); return; }
    comercialExternalApi.me().then((res) => setActor(res.actor)).catch(() => {
      comercialToken.clear(); navigate('/comercial/login', { replace: true });
    }).finally(() => setLoading(false));
  }, [navigate]);

  if (loading || !actor) return <div className="min-h-screen flex items-center justify-center bg-[#080D14]"><Loader2 className="h-8 w-8 animate-spin text-[#1677FF]" /></div>;

  const handleLogout = () => { comercialToken.clear(); navigate('/comercial/login', { replace: true }); };
  const initials = actor.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-[#080D14] text-[#F4F8FF]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-[#223047] bg-[#0B121D] lg:flex lg:flex-col">
        <div className="flex h-[74px] items-center gap-3 border-b border-[#223047] px-6">
          <div className="rounded-lg bg-[#123968] p-2 text-[#58A6FF]"><Building2 className="h-5 w-5" /></div>
          <div><p className="font-semibold">Portal Comercial</p><p className="text-xs text-[#64748B]">Enerlight</p></div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">Menu principal</p>
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return item.enabled ? (
              <button key={item.href} onClick={() => navigate(item.href)} className={cn('flex w-full items-center gap-3 rounded-md border-l-[3px] px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677FF]', active ? 'border-[#1677FF] bg-[#123968] text-[#58A6FF]' : 'border-transparent text-[#8DA0BB] hover:bg-[#152133] hover:text-[#F4F8FF]')}>
                <Icon className="h-[19px] w-[19px]" />{item.name}
              </button>
            ) : <span key={item.href} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#64748B]"><Icon className="h-[19px] w-[19px]" />{item.name}<Badge className="ml-auto bg-[#152133] text-[9px] text-[#64748B]">breve</Badge></span>;
          })}
        </nav>
        <div className="border-t border-[#223047] p-4"><button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[#8DA0BB] hover:bg-[#152133] hover:text-[#F4F8FF]"><LogOut className="h-[19px] w-[19px]" />Sair</button></div>
      </aside>
      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 flex h-[74px] items-center justify-between gap-4 border-b border-[#223047] bg-[#0B121D]/95 px-4 backdrop-blur sm:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-3"><div className="rounded-lg bg-[#123968] p-2 text-[#58A6FF] lg:hidden"><Building2 className="h-5 w-5" /></div><div className="relative w-full max-w-[480px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, oportunidade ou orçamento..." className="h-10 border-[#223047] bg-[#101925] pl-10 text-[#F4F8FF] placeholder:text-[#64748B] focus-visible:ring-[#1677FF]" /></div></div>
          <div className="flex items-center gap-3"><button aria-label="Notificações" className="relative rounded-lg p-2 text-[#8DA0BB] hover:bg-[#152133] hover:text-[#F4F8FF]"><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#1677FF]" /></button><div className="hidden h-7 w-px bg-[#223047] sm:block" /><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1677FF] text-xs font-semibold text-white">{initials}</span><span className="hidden max-w-[130px] truncate text-sm text-[#8DA0BB] sm:inline">{actor.name}</span></div></div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-7">{children(actor)}</main>
      </div>
    </div>
  );
};
export default ComercialLayout;
