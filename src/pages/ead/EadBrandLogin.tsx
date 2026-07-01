import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, ArrowRight } from 'lucide-react';
import EadChangePasswordDialog from './EadChangePasswordDialog';
import EadBrandShell from './EadBrandShell';

export default function EadBrandLogin() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const [brand, setBrand] = useState<any>(null);
  const [loadingBrand, setLoadingBrand] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    eadApi.getBrand(slug).then(setBrand).catch(() => setBrand(null)).finally(() => setLoadingBrand(false));
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await eadApi.login(email, password);
      eadToken.set(r.token);
      const targetSlug = (r.student as any).brand_slug || slug;
      setPendingSlug(targetSlug || null);
      if (r.student.must_change_password) {
        setMustChange(true);
      } else {
        toast.success(`Bem-vindo(a), ${r.student.name}!`);
        nav(targetSlug ? `/marca/${targetSlug}/inicio` : '/ead');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao entrar');
    } finally { setLoading(false); }
  }

  if (loadingBrand) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>;
  }

  const primary = brand?.primary_color || '#0ea5e9';

  return (
    <>
      <EadBrandShell
        brand={brand}
        eyebrow="Acesso do instalador"
        title="Bem-vindo de volta"
        subtitle="Entre com seu e-mail e senha para continuar seus treinamentos."
      >
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-700 text-sm font-medium">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="voce@empresa.com"
                className="pl-10 h-12 bg-white border-slate-200 focus-visible:ring-2"
                style={{ ['--tw-ring-color' as any]: primary }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-700 text-sm font-medium">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="pl-10 h-12 bg-white border-slate-200"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-white font-semibold text-base rounded-xl shadow-lg hover:opacity-95 transition group"
            disabled={loading}
            style={{ background: `linear-gradient(135deg, ${primary}, ${brand?.accent_color || primary})`, boxShadow: `0 10px 30px -10px ${primary}80` }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Entrar
            {!loading && <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition" />}
          </Button>

          {slug && (
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-xs uppercase tracking-wider">
                <span className="bg-white px-3 text-slate-400">Primeiro acesso?</span>
              </div>
            </div>
          )}
          {slug && (
            <Link
              to={`/marca/${slug}`}
              className="block w-full text-center h-12 leading-[3rem] rounded-xl border-2 font-semibold hover:bg-slate-50 transition"
              style={{ borderColor: primary, color: primary }}
            >
              Criar meu cadastro
            </Link>
          )}
        </form>
      </EadBrandShell>

      <EadChangePasswordDialog
        open={mustChange}
        forced
        primaryColor={primary}
        onDone={() => {
          setMustChange(false);
          toast.success('Senha atualizada! Aproveite os treinamentos.');
          nav(pendingSlug ? `/marca/${pendingSlug}/inicio` : '/ead');
        }}
      />
    </>
  );
}
