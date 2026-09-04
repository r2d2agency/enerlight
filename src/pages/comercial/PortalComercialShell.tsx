import { ReactNode, useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { comercialInternalApi, ComercialActor } from '@/lib/comercial-api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

// Mesmo papel do ComercialLayout (externo), só que dentro do app principal —
// o vendedor interno continua logado com a conta de sempre do CRM.
const PortalComercialShell = ({ children }: { children: (actor: ComercialActor) => ReactNode }) => {
  const [actor, setActor] = useState<ComercialActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    comercialInternalApi
      .me()
      .then((res) => setActor(res.actor))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Erro ao carregar o Portal Comercial';
        setError(message);
        toast({ title: 'Erro ao carregar', description: message, variant: 'destructive' });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <MainLayout>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error || !actor ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            {error || 'Você ainda não tem acesso ao Portal Comercial. Fale com o administrador.'}
          </CardContent>
        </Card>
      ) : (
        children(actor)
      )}
    </MainLayout>
  );
};

export default PortalComercialShell;
