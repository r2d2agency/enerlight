import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, GraduationCap, ArrowRight } from 'lucide-react';
import EadBrandShell from './EadBrandShell';


const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function maskCpf(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function maskPhone(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export default function EadBrandSignup() {
  const { slug } = useParams<{ slug: string }>();
  const [brand, setBrand] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<Record<string, any>>({});
  // senha temporária é gerada e enviada após aprovação — sem campos de senha no cadastro
  const [success, setSuccess] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!slug) return;
    // If already logged in to this brand, jump straight to the portal home
    if (eadToken.get()) {
      eadApi.me().then(r => {
        if (r.student.brand_slug === slug) nav(`/marca/${slug}/inicio`, { replace: true });
      }).catch(() => {});
    }
    eadApi.getBrand(slug)
      .then(b => setBrand(b))
      .catch(() => setBrand(null))
      .finally(() => setLoading(false));
  }, [slug, nav]);

  function setField(k: string, v: any) { setData(d => ({ ...d, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setSubmitting(true);
    try {
      const payload: any = { ...data };
      delete payload.password;
      if (payload.cpf) payload.cpf = String(payload.cpf).replace(/\D/g, '');
      if (payload.phone) payload.phone = String(payload.phone).replace(/\D/g, '');
      const r = await eadApi.brandSignup(slug, payload);
      setSuccess(r.message);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar');
    } finally { setSubmitting(false); }
  }


  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (!brand) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md"><CardContent className="py-10 text-center">
          <h2 className="text-xl font-semibold mb-2">Marca não encontrada</h2>
          <p className="text-muted-foreground text-sm">O link que você acessou não está disponível.</p>
        </CardContent></Card>
      </div>
    );
  }

  const primary = brand.primary_color || '#0ea5e9';
  const accent = brand.accent_color || '#0284c7';
  const fields = Array.isArray(brand.signup_fields) ? brand.signup_fields : [];
  const logo = resolveMediaUrl(brand.logo_url);
  const cover = resolveMediaUrl(brand.cover_url);

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(135deg, ${primary}15, ${accent}25)` }}>
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            {logo ? <img src={logo} alt={brand.name} className="block mx-auto object-contain" style={{ width: '100px', height: 'auto' }} /> : <GraduationCap className="h-12 w-12 mx-auto" style={{ color: primary }} />}
            <CheckCircle2 className="h-14 w-14 mx-auto text-green-500" />
            <h2 className="text-2xl font-bold">Cadastro recebido!</h2>
            <p className="text-muted-foreground">{success}</p>
            <Button onClick={() => nav(`/marca/${slug}/login`)} style={{ background: primary }}>Ir para o login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <EadBrandShell
      brand={brand}
      eyebrow="Cadastro"
      title="Solicitar acesso"
      subtitle="Preencha seus dados. Após a análise, você recebe suas credenciais por WhatsApp/e-mail."
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {fields.filter((f: any) => f.type !== 'password').map((f: any) => (
          <div key={f.key} className={`space-y-1.5 ${f.key === 'email' || f.key === 'name' ? 'sm:col-span-2' : ''}`}>
            <Label className="text-slate-700 text-sm font-medium">{f.label}{f.required && ' *'}</Label>
            {f.type === 'uf' ? (
              <select
                className="w-full h-11 px-3 border border-slate-200 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2"
                style={{ ['--tw-ring-color' as any]: primary }}
                value={data[f.key] || ''}
                onChange={e => setField(f.key, e.target.value)}
                required={f.required}
              >
                <option value="">UF</option>
                {UF.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : f.type === 'cpf' ? (
              <Input className="h-11 bg-white border-slate-200" value={data[f.key] || ''} onChange={e => setField(f.key, maskCpf(e.target.value))} required={f.required} placeholder="000.000.000-00" inputMode="numeric" />
            ) : f.type === 'phone' ? (
              <Input className="h-11 bg-white border-slate-200" value={data[f.key] || ''} onChange={e => setField(f.key, maskPhone(e.target.value))} required={f.required} placeholder="(11) 99999-9999" inputMode="tel" />
            ) : (
              <Input
                className="h-11 bg-white border-slate-200"
                type={f.type === 'email' ? 'email' : 'text'}
                value={data[f.key] || ''}
                onChange={e => setField(f.key, e.target.value)}
                required={f.required}
                autoComplete={f.type === 'email' ? 'email' : undefined}
              />
            )}
            {f.key === 'email' && (
              <p className="text-xs text-slate-500">Este e-mail será usado para o login.</p>
            )}
          </div>
        ))}

        <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 flex gap-3">
          <span className="text-xl">🔐</span>
          <span>Após a aprovação, você receberá uma <strong>senha temporária</strong> por WhatsApp/e-mail. No primeiro acesso será solicitado que você crie sua própria senha.</span>
        </div>

        <div className="sm:col-span-2 space-y-4">
          <Button
            type="submit"
            className="w-full h-12 text-white font-semibold text-base rounded-xl shadow-lg hover:opacity-95 transition group"
            disabled={submitting}
            style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, boxShadow: `0 10px 30px -10px ${primary}80` }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar cadastro
            {!submitting && <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition" />}
          </Button>
          <p className="text-center text-sm text-slate-500">
            Já tem acesso?{' '}
            <Link to={`/marca/${slug}/login`} className="font-semibold hover:underline" style={{ color: primary }}>
              Entrar
            </Link>
          </p>
        </div>
      </form>
    </EadBrandShell>
  );
}

