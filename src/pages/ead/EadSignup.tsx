import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, GraduationCap } from 'lucide-react';

const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function maskCpf(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export default function EadSignup() {
  const [form, setForm] = useState({ cpf: '', name: '', email: '', company: '', city: '', state: '' });
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  function setField(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r: any = await eadApi.register({ ...form, cpf: form.cpf.replace(/\D/g, '') });
      if (r?.token) { eadToken.set(r.token); toast.success('Cadastro realizado!'); nav('/ead'); }
      else { toast.success(r?.message || 'Cadastro enviado! Aguarde a liberação do administrador.'); nav('/ead/login'); }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2"><GraduationCap className="h-10 w-10 text-primary" /></div>
          <CardTitle>Criar conta de instalador</CardTitle>
          <CardDescription>Preencha seus dados para acessar os treinamentos</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Nome completo</Label><Input value={form.name} onChange={e => setField('name', e.target.value)} required /></div>
            <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setField('cpf', maskCpf(e.target.value))} required placeholder="000.000.000-00" /></div>
            <div><Label>Empresa</Label><Input value={form.company} onChange={e => setField('company', e.target.value)} /></div>
            <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setField('email', e.target.value)} required /></div>
            <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              Após a aprovação do seu cadastro, você receberá uma <strong>senha temporária</strong> por WhatsApp/E-mail e poderá defini-la no primeiro acesso.
            </div>

            <div><Label>Cidade</Label><Input value={form.city} onChange={e => setField('city', e.target.value)} /></div>
            <div>
              <Label>Estado</Label>
              <select className="w-full h-10 px-3 border rounded-md bg-background" value={form.state} onChange={e => setField('state', e.target.value)}>
                <option value="">UF</option>
                {UF.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 mt-2">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Cadastrar
              </Button>
              <p className="text-sm text-center mt-3 text-muted-foreground">
                Já tem conta? <Link to="/ead/login" className="text-primary font-medium">Entrar</Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
