import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import { Loader2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SellerOption { id: string; name: string; email?: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellers: SellerOption[];
  onImport: (customers: Record<string, string>[], ownerActorId?: string) => Promise<{ report: { created: number; duplicates: number; invalid: number } }>;
  onImported?: () => void;
  ownerLabel?: string;
  requiredOwner?: boolean;
}

const pick = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of Object.keys(row)) {
    if (keys.includes(key.toLowerCase().trim())) return String(row[key] ?? '').trim();
  }
  return '';
};

export default function CustomerImportDialog({ open, onOpenChange, sellers, onImport, onImported, ownerLabel = 'Vendedor responsável', requiredOwner = false }: Props) {
  const [ownerActorId, setOwnerActorId] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const readFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet).slice(0, 1000).map((row) => ({
        company_name: pick(row, ['company_name', 'nome', 'razao_social', 'razão social', 'cliente']),
        trade_name: pick(row, ['trade_name', 'nome_fantasia']),
        cnpj: pick(row, ['cnpj']),
        cpf: pick(row, ['cpf']),
        email: pick(row, ['email', 'e-mail']),
        phone: pick(row, ['phone', 'telefone', 'celular']),
        city: pick(row, ['city', 'cidade']),
        state: pick(row, ['state', 'estado', 'uf']),
        contact_name: pick(row, ['contact_name', 'contato']),
        type: pick(row, ['cpf']) ? 'pf' : 'pj',
      })).filter((row) => row.company_name);
      if (!parsed.length) { toast({ title: 'Arquivo vazio', description: 'Nenhuma linha com nome/razão social foi encontrada.', variant: 'destructive' }); return; }
      setRows(parsed);
      setFilename(file.name);
    } catch { toast({ title: 'Erro ao ler arquivo', description: 'Verifique o formato XLSX ou CSV.', variant: 'destructive' }); }
    event.target.value = '';
  };

  const confirm = async () => {
    if (requiredOwner && !ownerActorId) { toast({ title: 'Selecione um vendedor', description: 'Escolha para quem os clientes serão vinculados.', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const { report } = await onImport(rows, ownerActorId || undefined);
      toast({ title: 'Importação concluída', description: `${report.created} criados, ${report.duplicates} duplicados, ${report.invalid} inválidos.` });
      onOpenChange(false); setRows([]); setFilename(''); setOwnerActorId('');
      onImported?.();
    } catch (error) { toast({ title: 'Erro ao importar', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>Importar clientes</DialogTitle></DialogHeader>
    <div className="space-y-4">
      <div className="space-y-2"><Label>{ownerLabel}</Label><Select value={ownerActorId || 'none'} onValueChange={(value) => setOwnerActorId(value === 'none' ? '' : value)}><SelectTrigger><SelectValue placeholder={requiredOwner ? 'Selecione o vendedor' : 'Todos (sem vínculo)'} /></SelectTrigger><SelectContent>{!requiredOwner && <SelectItem value="none">Todos (sem vínculo)</SelectItem>}{sellers.map((seller) => <SelectItem key={seller.id} value={seller.id}>{seller.name}{seller.email ? ` — ${seller.email}` : ''}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Arquivo (XLSX ou CSV, até 1.000 linhas)</Label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/50"><Upload className="h-4 w-4" />{filename || 'Selecionar arquivo'}<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={readFile} /></label>{rows.length > 0 && <p className="text-xs text-muted-foreground">{rows.length} clientes prontos para importar.</p>}</div>
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={confirm} disabled={loading || !rows.length}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Importar</Button></DialogFooter>
  </DialogContent></Dialog>;
}
