import { useEffect, useState } from 'react';
import { eadApi } from '@/lib/ead-api';
import { EadLayout } from './EadLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Award, Download, Loader2 } from 'lucide-react';

export default function EadCertificates() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { eadApi.myCertificates().then(setItems).finally(() => setLoading(false)); }, []);
  return (
    <EadLayout>
      <h1 className="text-2xl font-bold mb-6">Meus Certificados</h1>
      {loading ? <Loader2 className="animate-spin h-6 w-6 mx-auto" /> : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Você ainda não conquistou nenhum certificado.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Award className="h-8 w-8 text-yellow-500" />
                  <div>
                    <p className="font-medium">{c.course_title}</p>
                    <p className="text-xs text-muted-foreground">Emitido em {new Date(c.issued_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <a href={c.pdf_url} target="_blank" rel="noreferrer"><Button size="sm"><Download className="h-4 w-4 mr-1" />Baixar</Button></a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </EadLayout>
  );
}
