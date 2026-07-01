import { useState } from 'react';
import { eadApi } from '@/lib/ead-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, KeyRound } from 'lucide-react';

interface Props {
  open: boolean;
  forced?: boolean;
  primaryColor?: string;
  onDone: () => void;
}

export default function EadChangePasswordDialog({ open, forced = true, primaryColor, onDone }: Props) {
  const [current, setCurrent] = useState('');
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 6) return toast.error('A senha deve ter pelo menos 6 caracteres');
    if (pwd !== confirm) return toast.error('As senhas não conferem');
    setLoading(true);
    try {
      await eadApi.changePassword(pwd, forced ? undefined : current);
      toast.success('Senha atualizada!');
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao trocar senha');
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={() => { /* modal obrigatório */ }}>
      <DialogContent aria-describedby="chgpwd-desc" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Criar nova senha</DialogTitle>
          <DialogDescription id="chgpwd-desc">
            {forced ? 'Você está usando uma senha temporária. Defina uma nova senha para continuar.' : 'Informe sua senha atual e a nova senha.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {!forced && (
            <div><Label>Senha atual</Label><Input type="password" value={current} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" /></div>
          )}
          <div><Label>Nova senha</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
          <div><Label>Confirmar nova senha</Label><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
          <Button type="submit" className="w-full text-white" disabled={loading} style={primaryColor ? { background: primaryColor } : undefined}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar nova senha
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
