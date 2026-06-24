import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileUploadInput } from '@/components/ui/file-upload-input';
import { Loader2, Trash2, Plus, Eye, Save } from 'lucide-react';
import { eadAdminApi } from '@/lib/ead-api';
import { toast } from 'sonner';

interface Field {
  key: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

const FIELD_KEYS = [
  { key: 'nome', label: 'Nome do aluno' },
  { key: 'cpf', label: 'CPF' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'curso', label: 'Nome do curso' },
  { key: 'cidade_estado', label: 'Cidade / UF' },
  { key: 'data_conclusao', label: 'Data de conclusão' },
];

export function CertificateEditor({ courseId }: { courseId: string }) {
  const [imageUrl, setImageUrl] = useState('');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<{ idx: number; dx: number; dy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    eadAdminApi.template(courseId).then(t => {
      if (t) {
        setImageUrl(t.image_url || '');
        setWidth(t.width || 0);
        setHeight(t.height || 0);
        setFields(Array.isArray(t.fields) ? t.fields : []);
      }
    }).finally(() => setLoading(false));
  }, [courseId]);

  function onImgLoad() {
    if (imgRef.current) {
      setWidth(imgRef.current.naturalWidth);
      setHeight(imgRef.current.naturalHeight);
    }
  }

  function addField(key: string) {
    if (fields.some(f => f.key === key)) { toast.warning('Campo já adicionado'); return; }
    setFields(f => [...f, { key, x: 50, y: 50, fontSize: 28, color: '#111111' }]);
  }

  function getScale() {
    if (!imgRef.current || !width) return 1;
    return imgRef.current.clientWidth / width;
  }

  function onPointerDown(idx: number, e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = containerRef.current!.getBoundingClientRect();
    const scale = getScale();
    const fx = fields[idx].x * scale;
    const fy = fields[idx].y * scale;
    setDrag({ idx, dx: e.clientX - rect.left - fx, dy: e.clientY - rect.top - fy });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const scale = getScale();
    const x = (e.clientX - rect.left - drag.dx) / scale;
    const y = (e.clientY - rect.top - drag.dy) / scale;
    setFields(f => f.map((fl, i) => i === drag.idx ? { ...fl, x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) } : fl));
  }
  function onPointerUp() { setDrag(null); }

  async function save() {
    setSaving(true);
    try {
      await eadAdminApi.saveTemplate(courseId, { image_url: imageUrl, width, height, fields });
      toast.success('Template salvo');
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  async function preview() {
    try {
      await save();
      const r = await eadAdminApi.previewTemplate(courseId);
      window.open(r.pdf_url, '_blank');
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin h-5 w-5" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Imagem do certificado (PNG/JPG em alta resolução)</Label>
          <FileUploadInput value={imageUrl} onChange={setImageUrl} accept="image/*" previewType="image" />
          <p className="text-xs text-muted-foreground mt-1">A imagem é usada como fundo do PDF. As coordenadas dos campos são em pixels da imagem original.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm font-medium">Adicionar campo:</span>
        {FIELD_KEYS.map(k => (
          <Button key={k.key} type="button" size="sm" variant="outline" onClick={() => addField(k.key)}>
            <Plus className="h-3 w-3 mr-1" />{k.label}
          </Button>
        ))}
      </div>

      {imageUrl && (
        <div
          ref={containerRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative border rounded-md overflow-hidden inline-block max-w-full select-none"
        >
          <img ref={imgRef} src={imageUrl} alt="template" onLoad={onImgLoad} className="block max-w-full h-auto" draggable={false} />
          {fields.map((f, i) => {
            const scale = getScale();
            return (
              <div
                key={i}
                onPointerDown={e => onPointerDown(i, e)}
                style={{
                  position: 'absolute',
                  left: f.x * scale,
                  top: f.y * scale,
                  fontSize: f.fontSize * scale,
                  color: f.color,
                  fontWeight: 700,
                  cursor: 'move',
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 2px rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,0,0.1)',
                  padding: '0 2px',
                  border: '1px dashed rgba(0,0,0,0.3)',
                }}
              >
                {`{{${f.key}}}`}
              </div>
            );
          })}
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Campos posicionados</h4>
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border rounded-md">
              <div className="col-span-3"><Label className="text-xs">Campo</Label><div className="text-sm font-mono">{`{{${f.key}}}`}</div></div>
              <div className="col-span-2"><Label className="text-xs">X</Label><Input type="number" value={f.x} onChange={e => setFields(fs => fs.map((x, j) => i === j ? { ...x, x: parseInt(e.target.value || '0') } : x))} /></div>
              <div className="col-span-2"><Label className="text-xs">Y</Label><Input type="number" value={f.y} onChange={e => setFields(fs => fs.map((x, j) => i === j ? { ...x, y: parseInt(e.target.value || '0') } : x))} /></div>
              <div className="col-span-2"><Label className="text-xs">Tamanho</Label><Input type="number" value={f.fontSize} onChange={e => setFields(fs => fs.map((x, j) => i === j ? { ...x, fontSize: parseInt(e.target.value || '12') } : x))} /></div>
              <div className="col-span-2"><Label className="text-xs">Cor</Label><Input type="color" value={f.color} onChange={e => setFields(fs => fs.map((x, j) => i === j ? { ...x, color: e.target.value } : x))} /></div>
              <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => setFields(fs => fs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={preview} disabled={!imageUrl}><Eye className="h-4 w-4 mr-1" />Salvar e visualizar</Button>
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? 'Salvando…' : 'Salvar'}</Button>
      </div>
    </div>
  );
}
