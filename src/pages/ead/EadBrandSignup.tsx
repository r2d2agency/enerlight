import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, GraduationCap } from 'lucide-react';

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
  const [passwordConfirm, setPasswordConfirm] = useState('');
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
    if (data.password && data.password !== passwordConfirm) {
      toast.error('As senhas não conferem');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = { ...data };
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
            {logo ? <img src={logo} alt={brand.name} className="h-16 mx-auto object-contain" /> : <GraduationCap className="h-12 w-12 mx-auto" style={{ color: primary }} />}
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
    <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primary}10, ${accent}20)` }}>
      {/* Thin brand header strip */}
      <div
        className="relative overflow-hidden shrink-0"
        style={cover ? { backgroundImage: `linear-gradient(135deg, ${primary}cc, ${accent}dd), url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: `linear-gradient(135deg, ${primary}, ${accent})` }}
      >
        <div className="max-w-5xl mx-auto px-4 py-5 sm:py-6 flex items-center justify-center gap-3">
          {logo ? (
            <div className="bg-white rounded-xl px-4 py-2 shadow-md flex items-center justify-center">
              <img src={logo} alt={brand.name} className="w-[100px] h-auto max-h-20 object-contain" />
            </div>
          ) : (
            <GraduationCap className="h-10 w-10 text-white" />
          )}
          <span className="text-white font-semibold text-lg sm:text-xl drop-shadow-sm">{brand.name}</span>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 sm:py-6">
        <Card className="shadow-xl border-0">
          <CardContent className="p-5 sm:p-8">
            <h2 className="text-xl font-semibold mb-1">Solicitar cadastro</h2>
            <p className="text-sm text-muted-foreground mb-6">Após o envio, seu acesso será analisado e liberado manualmente. Você receberá um aviso por WhatsApp/e-mail.</p>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              {fields.map((f: any) => (
                <div key={f.key} className="contents">
                  <div key={f.key} className={f.type === 'password' || f.key === 'email' || f.key === 'name' ? 'sm:col-span-2' : ''}>
                    <Label>{f.label}{f.required && ' *'}</Label>
                    {f.type === 'uf' ? (
                      <select className="w-full h-10 px-3 border rounded-md bg-background" value={data[f.key] || ''} onChange={e => setField(f.key, e.target.value)} required={f.required}>
                        <option value="">UF</option>
                        {UF.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    ) : f.type === 'cpf' ? (
                      <Input value={data[f.key] || ''} onChange={e => setField(f.key, maskCpf(e.target.value))} required={f.required} placeholder="000.000.000-00" inputMode="numeric" />
                    ) : f.type === 'phone' ? (
                      <Input value={data[f.key] || ''} onChange={e => setField(f.key, maskPhone(e.target.value))} required={f.required} placeholder="(11) 99999-9999" inputMode="tel" />
                    ) : (
                      <Input
                        type={f.type === 'email' ? 'email' : f.type === 'password' ? 'password' : 'text'}
                        value={data[f.key] || ''}
                        onChange={e => setField(f.key, e.target.value)}
                        required={f.required}
                        minLength={f.type === 'password' ? 6 : undefined}
                        autoComplete={f.type === 'email' ? 'email' : f.type === 'password' ? 'new-password' : undefined}
                      />
                    )}
                    {f.key === 'email' && (
                      <p className="text-xs text-muted-foreground mt-1">Este e-mail será usado para login.</p>
                    )}
                  </div>
                  {f.type === 'password' && (
                    <div key={f.key + '_confirm'} className="sm:col-span-2">
                      <Label>Confirmar senha *</Label>
                      <Input
                        type="password"
                        value={passwordConfirm}
                        onChange={e => setPasswordConfirm(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                      {passwordConfirm && data[f.key] && passwordConfirm !== data[f.key] && (
                        <p className="text-xs text-destructive mt-1">As senhas não conferem</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="sm:col-span-2 mt-2">
                <Button type="submit" className="w-full text-white" disabled={submitting} style={{ background: primary }}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Enviar cadastro
                </Button>
                <p className="text-center text-sm mt-4 text-muted-foreground">
                  Já tem acesso? <Link to={`/marca/${slug}/login`} className="font-medium" style={{ color: primary }}>Entrar</Link>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
