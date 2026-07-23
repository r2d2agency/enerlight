import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileUploadInput } from '@/components/ui/file-upload-input';
import { eadAdminApi } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, GraduationCap, Download, Award, FileQuestion, Video, Layers, Settings, BookOpen, ShieldCheck, KeyRound, Copy } from 'lucide-react';
import { CertificateEditor } from '@/components/ead/CertificateEditor';
import { useAuth } from '@/contexts/AuthContext';

export default function EadAdmin() {
  const { userPermissions, user } = useAuth();
  const canView = user?.is_superadmin || ['owner', 'admin'].includes(user?.role || '') || userPermissions?.can_view_ead;
  const canManage = user?.is_superadmin || ['owner', 'admin'].includes(user?.role || '') || userPermissions?.can_manage_ead;

  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCourse, setActiveCourse] = useState<any>(null);
  const [tab, setTab] = useState('brands');

  async function reload() {
    setLoading(true);
    try {
      const [c, s, ce] = await Promise.all([eadAdminApi.courses(), eadAdminApi.students(), eadAdminApi.certificates()]);
      setCourses(c); setStudents(s); setCerts(ce);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (canView) reload(); else setLoading(false); }, [canView]);

  if (!canView) return <MainLayout><Card><CardContent className="p-10 text-center text-muted-foreground">Você não tem permissão para acessar o EAD.</CardContent></Card></MainLayout>;

  return (
    <MainLayout>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Academia (EAD)</h1>
            <p className="text-muted-foreground text-sm">Gerencie cursos, módulos, aulas, manuais, provas e certificados.</p>
          </div>
        </div>
        <a href="/admin/ead/catalogos">
          <Button variant="secondary">Catálogos globais</Button>
        </a>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div> : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="brands">Marcas</TabsTrigger>
            <TabsTrigger value="approvals">Aprovações</TabsTrigger>
            <TabsTrigger value="courses">Cursos</TabsTrigger>
            <TabsTrigger value="students">Instaladores</TabsTrigger>
            <TabsTrigger value="certs">Certificados emitidos</TabsTrigger>
          </TabsList>

          <TabsContent value="brands" className="mt-4">
            {tab === 'brands' && <BrandsTab canManage={!!canManage} />}
          </TabsContent>
          <TabsContent value="approvals" className="mt-4">
            {tab === 'approvals' && <ApprovalsTab canManage={!!canManage} />}
          </TabsContent>
          <TabsContent value="courses" className="mt-4">
            {tab === 'courses' && <CoursesTab courses={courses} canManage={!!canManage} reload={reload} onOpen={setActiveCourse} />}
          </TabsContent>
          <TabsContent value="students" className="mt-4">
            {tab === 'students' && <StudentsTab students={students} onReload={reload} />}
          </TabsContent>
          <TabsContent value="certs" className="mt-4">
            {tab === 'certs' && <CertsTab certs={certs} />}
          </TabsContent>
        </Tabs>
      )}

      {activeCourse && (
        <CourseEditor course={activeCourse} canManage={!!canManage} onClose={() => { setActiveCourse(null); reload(); }} />
      )}
    </MainLayout>
  );
}

function CourseForm({ value, onChange, brands }: { value: any; onChange: (v: any) => void; brands: any[] }) {
  return (
    <div className="space-y-3">
      <div><Label>Título</Label><Input value={value.title || ''} onChange={e => onChange({ ...value, title: e.target.value })} placeholder="Ex: RedBar" /></div>
      <div><Label>Descrição</Label><Textarea value={value.description || ''} onChange={e => onChange({ ...value, description: e.target.value })} /></div>
      <div><Label>Capa</Label><FileUploadInput value={value.cover_url || ''} onChange={v => onChange({ ...value, cover_url: v })} accept="image/*" /></div>
      <div>
        <Label>Marca (visibilidade)</Label>
        <Select
          value={value.brand_id || '__global__'}
          onValueChange={v => onChange({ ...value, brand_id: v === '__global__' ? null : v })}
        >
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__global__">Global (visível a todas as marcas)</SelectItem>
            {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">Cursos vinculados a uma marca só aparecem para instaladores cadastrados nela.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 border rounded-md p-3">
          <Switch checked={!!value.has_certificate} onCheckedChange={v => onChange({ ...value, has_certificate: v })} />
          <Label className="cursor-pointer"><Award className="h-4 w-4 inline mr-1" />Gera certificado</Label>
        </div>
        <div>
          <Label>% mínima para aprovação</Label>
          <Input type="number" min={1} max={100} value={value.passing_score ?? 100} onChange={e => onChange({ ...value, passing_score: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex items-center gap-2"><Switch checked={!!value.published} onCheckedChange={v => onChange({ ...value, published: v })} /><Label>Publicado</Label></div>
    </div>
  );
}

function CoursesTab({ courses, canManage, reload, onOpen }: { courses: any[]; canManage: boolean; reload: () => void; onOpen: (c: any) => void }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({ title: '', description: '', cover_url: '', published: false, has_certificate: true, passing_score: 100, brand_id: null });
  const [brands, setBrands] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('__all__');

  useEffect(() => { eadAdminApi.brands().then(setBrands).catch(() => {}); }, []);

  const filtered = filter === '__all__' ? courses
    : filter === '__global__' ? courses.filter(c => !c.brand_id)
    : courses.filter(c => c.brand_id === filter);

  async function create() {
    if (!form.title) { toast.error('Título obrigatório'); return; }
    try {
      await eadAdminApi.createCourse(form);
      toast.success('Curso criado');
      setCreating(false); setForm({ title: '', description: '', cover_url: '', published: false, has_certificate: true, passing_score: 100, brand_id: null });
      reload();
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm('Excluir curso? Módulos, aulas, perguntas e certificados serão apagados.')) return;
    try { await eadAdminApi.deleteCourse(id); toast.success('Excluído'); reload(); } catch (e: any) { toast.error(e.message); }
  }
  async function togglePub(c: any) {
    try { await eadAdminApi.updateCourse(c.id, { published: !c.published }); reload(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Marca:</Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="__global__">Global (sem marca)</SelectItem>
              {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Novo curso</Button>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Curso</TableHead><TableHead>Marca</TableHead><TableHead>Aulas</TableHead><TableHead>Manuais</TableHead><TableHead>Perguntas</TableHead><TableHead>Aprov.</TableHead><TableHead>Cert.</TableHead><TableHead>Emitidos</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell><div className="font-medium">{c.title}</div><div className="text-xs text-muted-foreground line-clamp-1">{c.description}</div></TableCell>
                  <TableCell>{c.brand_name ? <Badge variant="outline">{c.brand_name}</Badge> : <Badge variant="secondary">Global</Badge>}</TableCell>
                  <TableCell>{c.lesson_count}</TableCell>
                  <TableCell>{c.manual_count || 0}</TableCell>
                  <TableCell>{c.question_count}</TableCell>
                  <TableCell>{c.passing_score ?? 100}%</TableCell>
                  <TableCell>{c.has_certificate ? <Badge variant="default">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                  <TableCell>{c.certificate_count}</TableCell>
                  <TableCell>
                    {canManage ? <Switch checked={c.published} onCheckedChange={() => togglePub(c)} /> :
                      <Badge variant={c.published ? 'default' : 'secondary'}>{c.published ? 'Publicado' : 'Rascunho'}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => onOpen(c)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                    {canManage && <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum curso encontrado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo curso</DialogTitle></DialogHeader>
          <CourseForm value={form} onChange={setForm} brands={brands} />
          <DialogFooter><Button onClick={create}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CourseEditor({ course, canManage, onClose }: { course: any; canManage: boolean; onClose: () => void }) {
  const [tab, setTab] = useState('settings');
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{course.title}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1" />Geral</TabsTrigger>
            <TabsTrigger value="modules"><Layers className="h-4 w-4 mr-1" />Módulos</TabsTrigger>
            <TabsTrigger value="lessons"><Video className="h-4 w-4 mr-1" />Aulas</TabsTrigger>
            <TabsTrigger value="manuals"><BookOpen className="h-4 w-4 mr-1" />Manuais</TabsTrigger>
            <TabsTrigger value="quiz"><FileQuestion className="h-4 w-4 mr-1" />Prova</TabsTrigger>
            <TabsTrigger value="cert"><Award className="h-4 w-4 mr-1" />Certificado</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="mt-4"><SettingsManager course={course} canManage={canManage} /></TabsContent>
          <TabsContent value="modules" className="mt-4"><ModulesManager courseId={course.id} canManage={canManage} /></TabsContent>
          <TabsContent value="lessons" className="mt-4"><LessonsManager courseId={course.id} canManage={canManage} /></TabsContent>
          <TabsContent value="manuals" className="mt-4"><ManualsManager courseId={course.id} canManage={canManage} /></TabsContent>
          <TabsContent value="quiz" className="mt-4"><QuestionsManager courseId={course.id} canManage={canManage} /></TabsContent>
          <TabsContent value="cert" className="mt-4">{canManage ? <CertificateEditor courseId={course.id} /> : <p className="text-muted-foreground text-sm">Sem permissão.</p>}</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SettingsManager({ course, canManage }: { course: any; canManage: boolean }) {
  const [form, setForm] = useState<any>({
    title: course.title,
    description: course.description || '',
    cover_url: course.cover_url || '',
    published: !!course.published,
    has_certificate: course.has_certificate ?? true,
    passing_score: course.passing_score ?? 100,
    brand_id: course.brand_id || null,
  });
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState<any[]>([]);
  useEffect(() => { eadAdminApi.brands().then(setBrands).catch(() => {}); }, []);
  async function save() {
    setSaving(true);
    try { await eadAdminApi.updateCourse(course.id, form); toast.success('Salvo'); }
    catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-4">
      <CourseForm value={form} onChange={setForm} brands={brands} />
      {canManage && <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar alterações</Button></div>}
    </div>
  );
}

function ModulesManager({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', description: '' });
  const [editing, setEditing] = useState<any>(null);

  async function load() { setLoading(true); try { setItems(await eadAdminApi.modules(courseId)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [courseId]);

  async function add() {
    if (!form.title) { toast.error('Título obrigatório'); return; }
    try { await eadAdminApi.createModule(courseId, { ...form, order_index: items.length }); setForm({ title: '', description: '' }); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function saveEdit() {
    try { await eadAdminApi.updateModule(editing.id, { title: editing.title, description: editing.description }); setEditing(null); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Excluir módulo? As aulas ficarão sem módulo.')) return;
    try { await eadAdminApi.deleteModule(id); load(); } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <Loader2 className="animate-spin h-5 w-5 mx-auto" />;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 p-3 border rounded-md">
            <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
            <div className="flex-1">
              <div className="font-medium text-sm">{m.title}</div>
              {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
            </div>
            {canManage && <>
              <Button size="icon" variant="ghost" onClick={() => setEditing({ ...m })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => del(m.id)}><Trash2 className="h-4 w-4" /></Button>
            </>}
          </div>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground text-center py-4">Nenhum módulo.</p>}
      </div>
      {canManage && (
        <div className="border-t pt-3 grid sm:grid-cols-12 gap-2">
          <div className="sm:col-span-4"><Label>Título do módulo</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="sm:col-span-7"><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="sm:col-span-1 flex items-end"><Button onClick={add} className="w-full"><Plus className="h-4 w-4" /></Button></div>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar módulo</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={saveEdit}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LessonsManager({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ title: '', youtube_url: '', video_url: '', video_type: 'youtube', module_id: '', description: '' });
  const [editing, setEditing] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [l, m] = await Promise.all([eadAdminApi.lessons(courseId), eadAdminApi.modules(courseId)]);
      setItems(l); setModules(m);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [courseId]);

  async function add() {
    if (!form.title) { toast.error('Informe o título'); return; }
    if (form.video_type === 'youtube' && !form.youtube_url) { toast.error('Informe a URL do YouTube'); return; }
    if (form.video_type === 'upload' && !form.video_url) { toast.error('Envie o arquivo de vídeo'); return; }
    try {
      await eadAdminApi.createLesson(courseId, { ...form, module_id: form.module_id || null, order_index: items.length });
      setForm({ title: '', youtube_url: '', video_url: '', video_type: form.video_type, module_id: form.module_id, description: '' });
      load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function saveEdit() {
    try {
      await eadAdminApi.updateLesson(editing.id, {
        title: editing.title,
        youtube_url: editing.video_type === 'youtube' ? editing.youtube_url : null,
        video_url: editing.video_type === 'upload' ? editing.video_url : null,
        video_type: editing.video_type,
        description: editing.description,
        module_id: editing.module_id || null,
      });
      setEditing(null); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Excluir aula?')) return;
    try { await eadAdminApi.deleteLesson(id); load(); } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <Loader2 className="animate-spin h-5 w-5 mx-auto" />;

  const grouped: Record<string, any[]> = { __none: [] };
  for (const m of modules) grouped[m.id] = [];
  for (const l of items) (grouped[l.module_id || '__none'] ||= []).push(l);

  const renderGroup = (label: string, list: any[]) => (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">{label}</div>
      {list.map((l, i) => (
        <div key={l.id} className="flex items-center gap-2 p-2 border rounded-md">
          <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate flex items-center gap-2">
              {l.title}
              <Badge variant="outline" className="text-[10px] py-0">{l.video_type === 'upload' ? 'Vídeo' : 'YouTube'}</Badge>
            </div>
            <div className="text-xs text-muted-foreground truncate">{l.video_type === 'upload' ? l.video_url : l.youtube_url}</div>
          </div>
          {canManage && <>
            <Button size="icon" variant="ghost" onClick={() => setEditing({ ...l, video_type: l.video_type || 'youtube' })}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => del(l.id)}><Trash2 className="h-4 w-4" /></Button>
          </>}
        </div>
      ))}
      {!list.length && <p className="text-xs text-muted-foreground italic px-1">Sem aulas neste grupo.</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {modules.map(m => renderGroup(m.title, grouped[m.id] || []))}
      {renderGroup('Sem módulo', grouped.__none || [])}

      {canManage && (
        <div className="border-t pt-3 space-y-3">
          <div className="grid sm:grid-cols-12 gap-2">
            <div className="sm:col-span-5"><Label>Título</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div className="sm:col-span-3">
              <Label>Tipo de vídeo</Label>
              <Select value={form.video_type} onValueChange={v => setForm({ ...form, video_type: v, youtube_url: '', video_url: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube (link)</SelectItem>
                  <SelectItem value="upload">Upload (mp4/webm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Label>Módulo</Label>
              <Select value={form.module_id || 'none'} onValueChange={v => setForm({ ...form, module_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem módulo —</SelectItem>
                  {modules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-1 flex items-end"><Button onClick={add} className="w-full"><Plus className="h-4 w-4" /></Button></div>
          </div>
          {form.video_type === 'youtube' ? (
            <div><Label>URL do YouTube</Label><Input value={form.youtube_url} onChange={e => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://youtu.be/..." /></div>
          ) : (
            <div>
              <Label>Arquivo de vídeo (mp4/webm)</Label>
              <FileUploadInput value={form.video_url} onChange={(url) => setForm({ ...form, video_url: url })} accept="video/mp4,video/webm,video/quicktime" previewType="file" placeholder="Faça upload do vídeo" />
            </div>
          )}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar aula</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></div>
              <div>
                <Label>Tipo de vídeo</Label>
                <Select value={editing.video_type} onValueChange={v => setEditing({ ...editing, video_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube (link)</SelectItem>
                    <SelectItem value="upload">Upload (mp4/webm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.video_type === 'youtube' ? (
                <div><Label>URL do YouTube</Label><Input value={editing.youtube_url || ''} onChange={e => setEditing({ ...editing, youtube_url: e.target.value })} /></div>
              ) : (
                <div>
                  <Label>Arquivo de vídeo (mp4/webm)</Label>
                  <FileUploadInput value={editing.video_url || ''} onChange={(url) => setEditing({ ...editing, video_url: url })} accept="video/mp4,video/webm,video/quicktime" previewType="file" />
                </div>
              )}
              <div><Label>Descrição</Label><Textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} /></div>
              <div>
                <Label>Módulo</Label>
                <Select value={editing.module_id || 'none'} onValueChange={v => setEditing({ ...editing, module_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem módulo —</SelectItem>
                    {modules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={saveEdit}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function ManualsManager({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({ title: '', description: '', cover_url: '', file_url: '' });
  const [editing, setEditing] = useState<any>(null);

  async function load() { setLoading(true); try { setItems(await eadAdminApi.manuals(courseId)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [courseId]);

  async function add() {
    if (!form.title || !form.file_url) { toast.error('Preencha título e arquivo do manual'); return; }
    try {
      await eadAdminApi.createManual(courseId, { ...form, order_index: items.length });
      setForm({ title: '', description: '', cover_url: '', file_url: '' }); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function saveEdit() {
    if (!editing.title || !editing.file_url) { toast.error('Preencha título e arquivo do manual'); return; }
    try {
      await eadAdminApi.updateManual(editing.id, {
        title: editing.title,
        description: editing.description,
        cover_url: editing.cover_url,
        file_url: editing.file_url,
      });
      setEditing(null); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Excluir manual?')) return;
    try { await eadAdminApi.deleteManual(id); load(); } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <Loader2 className="animate-spin h-5 w-5 mx-auto" />;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((m) => (
          <Card key={m.id} className="overflow-hidden">
            <div className="aspect-video bg-muted flex items-center justify-center">
              {m.cover_url ? <img src={resolveMediaUrl(m.cover_url)} alt={m.title} className="w-full h-full object-cover" /> : <BookOpen className="h-10 w-10 text-muted-foreground" />}
            </div>
            <CardContent className="p-3 space-y-3">
              <div>
                <h3 className="text-sm font-medium line-clamp-2">{m.title}</h3>
                {m.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.description}</p>}
              </div>
              <div className="flex justify-between gap-2">
                <a href={resolveMediaUrl(m.file_url) || '#'} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />Abrir</Button>
                </a>
                {canManage && <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ ...m })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => del(m.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!items.length && <p className="text-sm text-muted-foreground text-center py-4">Nenhum manual cadastrado.</p>}

      {canManage && (
        <div className="border-t pt-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Título do manual</Label><Input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Capa do manual</Label><FileUploadInput value={form.cover_url} onChange={v => setForm((f: any) => ({ ...f, cover_url: v }))} accept="image/*" /></div>
          </div>
          <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))} /></div>
          <div><Label>Arquivo do manual</Label><FileUploadInput value={form.file_url} onChange={v => setForm((f: any) => ({ ...f, file_url: v }))} accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg" previewType="file" placeholder="PDF/imagem ou link do manual" /></div>
          <div className="flex justify-end"><Button onClick={add}><Plus className="h-4 w-4 mr-1" />Adicionar manual</Button></div>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar manual</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>Descrição</Label><Textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} /></div>
              <div><Label>Capa</Label><FileUploadInput value={editing.cover_url || ''} onChange={v => setEditing({ ...editing, cover_url: v })} accept="image/*" /></div>
              <div><Label>Arquivo</Label><FileUploadInput value={editing.file_url || ''} onChange={v => setEditing({ ...editing, file_url: v })} accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg" previewType="file" /></div>
            </div>
          )}
          <DialogFooter><Button onClick={saveEdit}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionForm({ initialValue, onCancel, onSubmit, submitLabel }: { initialValue: any; onCancel: () => void; onSubmit: (value: any) => void; submitLabel: string }) {
  const [value, setValue] = useState<any>(() => ({
    ...initialValue,
    options: (initialValue.options || []).map((o: any) => ({ ...o })),
  }));

  function submit() {
    if (!value.question || value.options.some((o: any) => !o.text)) { toast.error('Preencha pergunta e alternativas'); return; }
    if (!value.options.some((o: any) => o.is_correct)) { toast.error('Marque a alternativa correta'); return; }
    onSubmit(value);
  }

  return (
    <div className="space-y-3">
      <div><Label>Pergunta</Label><Textarea value={value.question} onChange={e => setValue((v: any) => ({ ...v, question: e.target.value }))} /></div>
      <div className="space-y-2">
        <Label>Alternativas (marque a correta)</Label>
        {value.options.map((o: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name={`correct-${value.id || 'new-question'}`} checked={!!o.is_correct} onChange={() => setValue((v: any) => ({ ...v, options: v.options.map((x: any, j: number) => ({ ...x, is_correct: i === j })) }))} />
            <Input value={o.text} onChange={e => setValue((v: any) => ({ ...v, options: v.options.map((x: any, j: number) => i === j ? { ...x, text: e.target.value } : x) }))} placeholder={`Alternativa ${i + 1}`} />
            {value.options.length > 2 && <Button size="icon" variant="ghost" onClick={() => setValue((v: any) => ({ ...v, options: v.options.filter((_: any, j: number) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setValue((v: any) => ({ ...v, options: [...v.options, { text: '', is_correct: false }] }))}><Plus className="h-3 w-3 mr-1" />Alternativa</Button>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancelar</Button><Button onClick={submit}>{submitLabel}</Button></div>
    </div>
  );
}

function QuestionsManager({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const empty = { question: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }] };

  async function load() { setLoading(true); try { setItems(await eadAdminApi.questions(courseId)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [courseId]);

  async function create(value: any) {
    try {
      await eadAdminApi.createQuestion(courseId, { question: value.question, order_index: items.length, options: value.options });
      setCreating(false); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function saveEdit(value: any) {
    try {
      await eadAdminApi.updateQuestion(editing.id, { question: value.question, options: value.options.map((o: any) => ({ text: o.text, is_correct: !!o.is_correct })) });
      setEditing(null); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Excluir pergunta?')) return;
    try { await eadAdminApi.deleteQuestion(id); load(); } catch (e: any) { toast.error(e.message); }
  }




  if (loading) return <Loader2 className="animate-spin h-5 w-5 mx-auto" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} pergunta(s) cadastrada(s).</p>
        {canManage && !creating && <Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Nova pergunta</Button>}
      </div>

      {items.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="p-4">
            <div className="flex justify-between gap-2 mb-2">
              <p className="font-medium text-sm">{i + 1}. {q.question}</p>
              {canManage && <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing({ ...q, options: q.options.map((o: any) => ({ text: o.text, is_correct: o.is_correct })) })}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(q.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>}
            </div>
            <ul className="text-sm space-y-1">
              {q.options.map((o: any) => (
                <li key={o.id} className={o.is_correct ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
                  {o.is_correct ? '✓' : '○'} {o.text}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      {!items.length && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma pergunta.</p>}

      {canManage && creating && (
        <Card><CardContent className="p-4 space-y-3">
          <QuestionForm initialValue={empty} onCancel={() => setCreating(false)} onSubmit={create} submitLabel="Salvar pergunta" />
        </CardContent></Card>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar pergunta</DialogTitle></DialogHeader>
          {editing && <QuestionForm initialValue={editing} onCancel={() => setEditing(null)} onSubmit={saveEdit} submitLabel="Salvar" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentsTab({ students, onReload }: { students: any[]; onReload: () => void }) {
  const [brands, setBrands] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('__all__');
  const [companyFilter, setCompanyFilter] = useState<string>('__all__');
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { eadAdminApi.brands().then(setBrands).catch(() => {}); }, []);

  const statusBadge = (s: string) => {
    if (s === 'pending') return <Badge variant="destructive">Pendente</Badge>;
    if (s === 'rejected') return <Badge variant="outline">Rejeitado</Badge>;
    return <Badge variant="secondary">Aprovado</Badge>;
  };

  async function changeBrand(studentId: string, brandId: string) {
    setSavingId(studentId);
    try {
      await eadAdminApi.updateStudent(studentId, { brand_id: brandId === '__none__' ? null : brandId });
      toast.success('Marca atualizada');
      onReload();
    } catch (e: any) { toast.error(e.message || 'Erro ao atualizar'); }
    finally { setSavingId(null); }
  }

  async function approve(id: string) {
    setSavingId(id);
    try {
      const r: any = await eadAdminApi.approveStudent(id);
      const w = r?.notify?.whatsapp;
      const em = r?.notify?.email;
      toast.success(`Aprovado! WhatsApp: ${w?.success ? 'enviado' : (w?.error || 'falhou')} • E-mail: ${em?.success ? 'enviado' : (em?.error || 'falhou')}`);
      onReload();
    }
    catch (e: any) {
      if (e?.status === 400) { toast.info(e.message || 'Já aprovado'); onReload(); }
      else toast.error(e.message || 'Erro ao aprovar');
    }
    finally { setSavingId(null); }
  }
  async function reject(id: string) {
    const reason = window.prompt('Motivo da rejeição (opcional):') ?? undefined;
    setSavingId(id);
    try { await eadAdminApi.rejectStudent(id, reason); toast.success('Instalador rejeitado'); onReload(); }
    catch (e: any) { toast.error(e.message || 'Erro ao rejeitar'); }
    finally { setSavingId(null); }
  }
  async function resend(id: string) {
    setSavingId(id);
    try { await eadAdminApi.resendNotification(id); toast.success('Notificação enviada (WhatsApp/e-mail)'); }
    catch (e: any) { toast.error(e.message || 'Erro ao notificar'); }
    finally { setSavingId(null); }
  }
  async function resetPassword(id: string) {
    if (!window.confirm('Gerar nova senha temporária e enviar por WhatsApp/e-mail?')) return;
    setSavingId(id);
    try {
      const r = await eadAdminApi.resetPassword(id);
      toast.success(`Nova senha: ${r?.temp_password || 'enviada'}`);
    }
    catch (e: any) { toast.error(e.message || 'Erro ao resetar senha'); }
    finally { setSavingId(null); }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail({ loading: true });
    try {
      const d = await eadAdminApi.student(id);
      setDetail(d);
    } catch (e: any) { toast.error(e.message || 'Erro ao carregar'); setDetail(null); }
    finally { setDetailLoading(false); }
  }

  const companies = Array.from(new Set(students.map(s => (s.company || '').trim()).filter(Boolean))).sort();

  const filtered = students.filter(s => {
    if (brandFilter !== '__all__') {
      if (brandFilter === '__none__') { if (s.brand_id) return false; }
      else if (s.brand_id !== brandFilter) return false;
    }
    if (companyFilter !== '__all__') {
      if (companyFilter === '__none__') { if ((s.company || '').trim()) return false; }
      else if ((s.company || '').trim() !== companyFilter) return false;
    }
    if (statusFilter !== '__all__' && (s.status || 'approved') !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [s.name, s.email, s.cpf, s.phone, s.company, s.city, s.state, s.brand_name].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function exportCsv() {
    if (!filtered.length) { toast.error('Nenhum instalador para exportar'); return; }
    const headers = ['Nome','CPF','Email','Telefone','Empresa','Cidade','UF','Marca','Status','Inscrições','Certificados','Aprovado em','Cadastro em','Campos extras'];
    const escape = (v: any) => {
      const s = v == null ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = filtered.map(s => [
      s.name, s.cpf, s.email, s.phone || '', s.company || '', s.city || '', s.state || '',
      s.brand_name || '', s.status || 'approved', s.enrollment_count, s.certificate_count,
      s.approved_at ? new Date(s.approved_at).toLocaleString('pt-BR') : '',
      s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : '',
      s.extra_fields && typeof s.extra_fields === 'object' ? JSON.stringify(s.extra_fields) : '',
    ].map(escape).join(','));
    const csv = '\ufeff' + [headers.map(escape).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = companyFilter !== '__all__' && companyFilter !== '__none__' ? `_${companyFilter}` : '';
    a.download = `instaladores_ead${suffix}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <div className="md:col-span-2">
              <Label className="text-xs">Buscar</Label>
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, CPF, email, telefone..." />
            </div>
            <div>
              <Label className="text-xs">Marca</Label>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sem marca</SelectItem>
                  {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Empresa</Label>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sem empresa</SelectItem>
                  {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-sm text-muted-foreground">{filtered.length} de {students.length} instaladores</span>
            <div className="flex gap-2">
              <ManualEnrollButton brands={brands} onDone={onReload} />
              <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Exportar CSV</Button>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>Email</TableHead><TableHead>Marca</TableHead><TableHead>Status</TableHead><TableHead>Empresa</TableHead><TableHead>Cidade/UF</TableHead><TableHead>Insc.</TableHead><TableHead>Cert.</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map(s => (
              <TableRow key={s.id} className="cursor-pointer" onClick={(e) => {
                if ((e.target as HTMLElement).closest('button,[role="combobox"],select,input')) return;
                openDetail(s.id);
              }}>
                <TableCell className="font-medium text-primary hover:underline">{s.name}</TableCell>
                <TableCell className="font-mono text-xs">{s.cpf}</TableCell>
                <TableCell>{s.email}</TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Select value={s.brand_id || '__none__'} onValueChange={(v) => changeBrand(s.id, v)} disabled={savingId === s.id}>
                    <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Sem marca" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem marca</SelectItem>
                      {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>{statusBadge(s.status || 'approved')}</TableCell>
                <TableCell>{s.company || '-'}</TableCell>
                <TableCell>{[s.city, s.state].filter(Boolean).join(' / ') || '-'}</TableCell>
                <TableCell>{s.enrollment_count}</TableCell>
                <TableCell><Badge>{s.certificate_count}</Badge></TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  {s.status === 'pending' ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" disabled={savingId === s.id} onClick={() => approve(s.id)}>Aprovar</Button>
                      <Button size="sm" variant="outline" disabled={savingId === s.id} onClick={() => reject(s.id)}>Rejeitar</Button>
                    </div>
                  ) : s.status === 'rejected' ? (
                    <Button size="sm" variant="default" disabled={savingId === s.id} onClick={() => approve(s.id)}>Aprovar</Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={savingId === s.id} onClick={() => resend(s.id)}>Notificar</Button>
                      <Button size="sm" variant="outline" disabled={savingId === s.id} onClick={() => resetPassword(s.id)}>Resetar senha</Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum instalador encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do instalador</DialogTitle>
          </DialogHeader>
          {detailLoading || detail?.loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="animate-spin h-6 w-6" /></div>
          ) : detail?.student ? (
            <StudentDetailView data={detail} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentDetailView({ data }: { data: any }) {
  const s = data.student;
  const extras: [string, any][] = s.extra_fields && typeof s.extra_fields === 'object'
    ? Object.entries(s.extra_fields).filter(([, v]) => v != null && v !== '')
    : [];
  const [courses, setCourses] = useState<any[]>([]);
  const [issueCourseId, setIssueCourseId] = useState('');
  const [issuing, setIssuing] = useState(false);
  useEffect(() => { eadAdminApi.courses().then(setCourses).catch(() => {}); }, []);
  const alreadyCertCourseIds = new Set((data.certificates || []).map((c: any) => c.course_id));

  async function issue() {
    if (!issueCourseId) { toast.error('Selecione um curso'); return; }
    setIssuing(true);
    try {
      const r = await eadAdminApi.issueCertificate(s.id, issueCourseId);
      if (r.already) {
        toast.info('Este aluno já possui certificado para este curso');
      } else {
        toast.success('Certificado emitido!');
      }
      if (r.certificate?.pdf_url) window.open(r.certificate.pdf_url, '_blank');
      setIssueCourseId('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao emitir certificado');
    } finally { setIssuing(false); }
  }

  const Field = ({ label, value }: { label: string; value: any }) => (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value || '-'}</div>
    </div>
  );
  const fmt = (d?: string) => d ? new Date(d).toLocaleString('pt-BR') : '-';
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Nome" value={s.name} />
          <Field label="CPF" value={s.cpf} />
          <Field label="Status" value={s.status || 'approved'} />
          <Field label="Email" value={s.email} />
          <Field label="Telefone/WhatsApp" value={s.phone} />
          <Field label="Marca" value={s.brand_name} />
          <Field label="Empresa" value={s.company} />
          <Field label="Cidade" value={s.city} />
          <Field label="UF" value={s.state} />
          <Field label="Cadastrado em" value={fmt(s.created_at)} />
          <Field label="Aprovado em" value={fmt(s.approved_at)} />
          <Field label="Aprovado por" value={s.approved_by_name} />
          {s.rejected_reason && <div className="col-span-full"><Field label="Motivo da rejeição" value={s.rejected_reason} /></div>}
        </CardContent>
      </Card>

      {extras.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Campos extras do cadastro</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {extras.map(([k, v]) => <Field key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Inscrições ({data.enrollments?.length || 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Curso</TableHead><TableHead>Status</TableHead><TableHead>Início</TableHead><TableHead>Aprovação</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data.enrollments || []).map((e: any) => (
                <TableRow key={e.id}><TableCell>{e.course_title}</TableCell><TableCell>{e.status}</TableCell><TableCell>{fmt(e.created_at)}</TableCell><TableCell>{fmt(e.approved_at)}</TableCell></TableRow>
              ))}
              {!data.enrollments?.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Sem inscrições</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tentativas de prova ({data.attempts?.length || 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Curso</TableHead><TableHead>Nota</TableHead><TableHead>Acertos</TableHead><TableHead>Aprovado</TableHead><TableHead>Data</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data.attempts || []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell>{a.course_title}</TableCell>
                  <TableCell>{a.score}%</TableCell>
                  <TableCell>{a.correct}/{a.total}</TableCell>
                  <TableCell>{a.passed ? <Badge variant="secondary">Sim</Badge> : <Badge variant="destructive">Não</Badge>}</TableCell>
                  <TableCell>{fmt(a.created_at)}</TableCell>
                </TableRow>
              ))}
              {!data.attempts?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Sem tentativas</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Certificados ({data.certificates?.length || 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Curso</TableHead><TableHead>Emitido em</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {(data.certificates || []).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>{c.course_title}</TableCell>
                  <TableCell>{fmt(c.issued_at)}</TableCell>
                  <TableCell><a href={resolveMediaUrl(c.pdf_url)} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm">Baixar PDF</a></TableCell>
                </TableRow>
              ))}
              {!data.certificates?.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Sem certificados</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4" /> Emitir certificado (prova presencial)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-2 md:items-end">
          <div className="flex-1">
            <Label className="text-xs">Curso</Label>
            <Select value={issueCourseId} onValueChange={setIssueCourseId}>
              <SelectTrigger><SelectValue placeholder="Selecione o curso" /></SelectTrigger>
              <SelectContent>
                {courses.map(c => (
                  <SelectItem key={c.id} value={c.id} disabled={alreadyCertCourseIds.has(c.id)}>
                    {c.title}{alreadyCertCourseIds.has(c.id) ? ' (já possui certificado)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={issue} disabled={issuing || !issueCourseId}>
            {issuing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Award className="h-4 w-4 mr-1" /> Emitir certificado
          </Button>
        </CardContent>
      </Card>
    </div>

  );
}

function CertsTab({ certs }: { certs: any[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [list, setList] = useState(certs);
  useEffect(() => { setList(certs); }, [certs]);

  async function regenerate(c: any, resend: boolean) {
    if (resend && !confirm(`Regerar e reenviar o certificado para ${c.student_name}?`)) return;
    if (!resend && !confirm(`Regerar o PDF do certificado para ${c.student_name}? (sem reenviar notificação)`)) return;
    setBusyId(c.id);
    try {
      const r = await eadAdminApi.regenerateCertificate({ certificate_id: c.id, resend });
      setList(prev => prev.map(x => x.id === c.id ? { ...x, pdf_url: r.certificate.pdf_url, issued_at: r.certificate.issued_at } : x));
      if (resend) {
        const wa = r.notify?.whatsapp?.success ? 'WhatsApp ✓' : `WhatsApp ✗ (${r.notify?.whatsapp?.error || '-'})`;
        const em = r.notify?.email?.success ? 'E-mail ✓' : `E-mail ✗ (${r.notify?.email?.error || '-'})`;
        toast.success(`Certificado regerado. ${wa} · ${em}`);
      } else {
        toast.success('Certificado regerado');
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }

  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Instalador</TableHead><TableHead>Empresa</TableHead><TableHead>Curso</TableHead><TableHead>Emitido em</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>
          {list.map(c => (
            <TableRow key={c.id}>
              <TableCell><div className="font-medium">{c.student_name}</div><div className="text-xs text-muted-foreground">{c.cpf}</div></TableCell>
              <TableCell>{c.company || '-'}</TableCell>
              <TableCell>{c.course_title}</TableCell>
              <TableCell>{new Date(c.issued_at).toLocaleString('pt-BR')}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1 flex-wrap">
                  <a href={c.pdf_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />PDF</Button></a>
                  <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => regenerate(c, false)}>
                    {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Regerar PDF'}
                  </Button>
                  <Button size="sm" disabled={busyId === c.id} onClick={() => regenerate(c, true)}>
                    {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Award className="h-4 w-4 mr-1" />}
                    Regerar e reenviar
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!list.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum certificado emitido.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}


// =========================================================================
// BRANDS TAB
// =========================================================================
const DEFAULT_FIELDS = [
  { key: 'name', label: 'Nome completo', type: 'text', required: true },
  { key: 'cpf', label: 'CPF', type: 'cpf', required: true },
  { key: 'email', label: 'E-mail', type: 'email', required: true },
  { key: 'phone', label: 'WhatsApp', type: 'phone', required: true },
  { key: 'password', label: 'Senha', type: 'password', required: true },
  { key: 'company', label: 'Empresa', type: 'text', required: false },
  { key: 'city', label: 'Cidade', type: 'text', required: false },
  { key: 'state', label: 'Estado', type: 'uf', required: false },
];

function BrandsTab({ canManage }: { canManage: boolean }) {
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [managingAdmins, setManagingAdmins] = useState<any>(null);

  async function load() {
    setLoading(true);
    try { setBrands(await eadAdminApi.brands()); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm('Excluir marca? Os instaladores vinculados manterão seus cadastros.')) return;
    try { await eadAdminApi.deleteBrand(id); toast.success('Marca excluída'); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  const origin = window.location.origin;

  return (
    <Card><CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Marcas / Programas</CardTitle>
      {canManage && <Button onClick={() => setEditing({ _new: true, signup_fields: DEFAULT_FIELDS, primary_color: '#0ea5e9', accent_color: '#0284c7', active: true })}><Plus className="h-4 w-4 mr-1" />Nova marca</Button>}
    </CardHeader><CardContent>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin h-5 w-5" /></div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Marca</TableHead><TableHead>Link público</TableHead><TableHead>Instaladores</TableHead><TableHead>Pendentes</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {brands.map(b => (
              <TableRow key={b.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {b.logo_url ? <img src={resolveMediaUrl(b.logo_url)} alt={b.name} className="h-10 w-10 object-contain rounded" style={{ background: b.primary_color + '20' }} /> : <div className="h-10 w-10 rounded" style={{ background: b.primary_color || '#0ea5e9' }} />}
                    <div>
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">/{b.slug}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <button onClick={() => { navigator.clipboard.writeText(`${origin}/marca/${b.slug}`); toast.success('Link copiado!'); }} className="text-xs text-primary hover:underline">
                    {origin}/marca/{b.slug}
                  </button>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Painel admin: /marca/{b.slug}/admin</div>
                </TableCell>
                <TableCell>{b.total_students || 0}</TableCell>
                <TableCell>{b.pending_students > 0 ? <Badge variant="destructive">{b.pending_students}</Badge> : <span className="text-muted-foreground">0</span>}</TableCell>
                <TableCell>{b.active ? <Badge>Ativa</Badge> : <Badge variant="secondary">Inativa</Badge>}</TableCell>
                <TableCell className="text-right">
                  {canManage && <>
                    <Button size="sm" variant="ghost" title="Administradores" onClick={() => setManagingAdmins(b)}><ShieldCheck className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(b)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
            {!brands.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma marca cadastrada. Crie a primeira para gerar o link público de cadastro.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
      {editing && <BrandEditor brand={editing} onClose={() => { setEditing(null); load(); }} />}
      {managingAdmins && <BrandAdminsDialog brand={managingAdmins} onClose={() => setManagingAdmins(null)} />}
    </CardContent></Card>
  );
}

function BrandAdminsDialog({ brand, onClose }: { brand: any; onClose: () => void }) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const origin = window.location.origin;

  async function load() {
    setLoading(true);
    try { setAdmins(await eadAdminApi.brandAdmins(brand.id)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [brand.id]);

  async function create() {
    if (!form.name || !form.email) { toast.error('Nome e e-mail obrigatórios'); return; }
    setCreating(true);
    try {
      const r = await eadAdminApi.createBrandAdmin(brand.id, form);
      if (r.temp_password) {
        toast.success(`Senha temporária: ${r.temp_password}`, { duration: 15000 });
        try { await navigator.clipboard.writeText(r.temp_password); } catch {}
      } else toast.success('Administrador criado');
      setForm({ name: '', email: '', password: '' });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  }

  async function toggle(a: any) {
    try { await eadAdminApi.updateBrandAdmin(a.id, { active: !a.active }); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function reset(a: any) {
    if (!confirm(`Gerar nova senha para ${a.email}?`)) return;
    try {
      const r = await eadAdminApi.resetBrandAdminPassword(a.id);
      toast.success(`Nova senha: ${r.temp_password}`, { duration: 15000 });
      try { await navigator.clipboard.writeText(r.temp_password); } catch {}
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(a: any) {
    if (!confirm(`Remover ${a.email}?`)) return;
    try { await eadAdminApi.deleteBrandAdmin(a.id); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  const loginUrl = `${origin}/marca/${brand.slug}/admin/login`;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Administradores — {brand.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-muted/50 rounded text-sm flex items-center justify-between gap-2">
            <div><span className="text-muted-foreground">URL do painel: </span><code className="text-xs">{loginUrl}</code></div>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(loginUrl); toast.success('Copiado'); }}><Copy className="h-3 w-3 mr-1" />Copiar</Button>
          </div>

          <div className="border rounded p-3 space-y-2">
            <div className="text-sm font-medium">Adicionar novo administrador</div>
            <div className="grid sm:grid-cols-3 gap-2">
              <Input placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="E-mail" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Senha (opcional, mín 6)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="text-xs text-muted-foreground">Se a senha ficar em branco, uma senha temporária será gerada e copiada para a área de transferência.</div>
            <Button size="sm" onClick={create} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Criar</>}</Button>
          </div>

          {loading ? <div className="flex justify-center py-6"><Loader2 className="animate-spin h-5 w-5" /></div> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Status</TableHead><TableHead>Último login</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {admins.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell><Switch checked={!!a.active} onCheckedChange={() => toggle(a)} /></TableCell>
                    <TableCell className="text-xs">{a.last_login_at ? new Date(a.last_login_at).toLocaleString('pt-BR') : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" title="Redefinir senha" onClick={() => reset(a)}><KeyRound className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!admins.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhum administrador para esta marca.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function BrandEditor({ brand, onClose }: { brand: any; onClose: () => void }) {
  const initialRecipients = Array.isArray(brand.notify_admin_recipients) && brand.notify_admin_recipients.length
    ? brand.notify_admin_recipients
    : (brand.notify_admin_phone ? [{ name: '', phone: brand.notify_admin_phone }] : []);
  const [data, setData] = useState<any>({
    ...brand,
    signup_fields: Array.isArray(brand.signup_fields) ? brand.signup_fields : DEFAULT_FIELDS,
    notify_admin_recipients: initialRecipients,
  });
  const [connections, setConnections] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { eadAdminApi.brandConnections().then(setConnections).catch(() => {}); }, []);

  function set(k: string, v: any) { setData((d: any) => ({ ...d, [k]: v })); }
  function setField(i: number, k: string, v: any) {
    setData((d: any) => {
      const arr = [...(d.signup_fields || [])];
      arr[i] = { ...arr[i], [k]: v };
      return { ...d, signup_fields: arr };
    });
  }
  function addField() { set('signup_fields', [...(data.signup_fields || []), { key: `extra_${Date.now()}`, label: 'Novo campo', type: 'text', required: false }]); }
  function removeField(i: number) { const arr = [...data.signup_fields]; arr.splice(i, 1); set('signup_fields', arr); }

  function setRecipient(i: number, k: 'name' | 'phone' | 'email', v: string) {
    setData((d: any) => {
      const arr = [...(d.notify_admin_recipients || [])];
      arr[i] = { ...arr[i], [k]: v };
      return { ...d, notify_admin_recipients: arr };
    });
  }
  function addRecipient() {
    set('notify_admin_recipients', [...(data.notify_admin_recipients || []), { name: '', phone: '', email: '' }]);
  }
  function removeRecipient(i: number) {
    const arr = [...(data.notify_admin_recipients || [])];
    arr.splice(i, 1);
    set('notify_admin_recipients', arr);
  }

  async function save() {
    if (!data.slug || !data.name) { toast.error('Slug e nome são obrigatórios'); return; }
    setSaving(true);
    try {
      const recipients = (data.notify_admin_recipients || [])
        .map((r: any) => ({
          name: String(r.name || '').trim(),
          phone: String(r.phone || '').replace(/\D/g, ''),
          email: String(r.email || '').trim().toLowerCase(),
        }))
        .filter((r: any) => r.phone || r.email);
      const body = {
        slug: data.slug, name: data.name, logo_url: data.logo_url, cover_url: data.cover_url,
        primary_color: data.primary_color, accent_color: data.accent_color,
        welcome_title: data.welcome_title, welcome_text: data.welcome_text,
        signup_fields: data.signup_fields,
        notify_connection_id: data.notify_connection_id || null,
        approval_message: data.approval_message,
        notify_admin_phone: recipients[0]?.phone || null, // compat: primeiro número
        notify_admin_recipients: recipients,
        signup_notify_message: data.signup_notify_message,
        active: data.active,
      };
      if (data._new) await eadAdminApi.createBrand(body);
      else await eadAdminApi.updateBrand(data.id, body);
      toast.success('Marca salva!');
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{data._new ? 'Nova marca' : `Editar: ${data.name}`}</DialogTitle></DialogHeader>
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="brand">Identidade</TabsTrigger>
            <TabsTrigger value="fields">Campos do cadastro</TabsTrigger>
            <TabsTrigger value="notify">Notificações</TabsTrigger>
          </TabsList>
          <TabsContent value="info" className="space-y-3 pt-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Nome</Label><Input value={data.name || ''} onChange={e => set('name', e.target.value)} /></div>
              <div><Label>Slug (URL)</Label><Input value={data.slug || ''} onChange={e => set('slug', e.target.value)} placeholder="shell" /></div>
            </div>
            <div><Label>Título de boas-vindas</Label><Input value={data.welcome_title || ''} onChange={e => set('welcome_title', e.target.value)} placeholder="Área do Instalador Shell" /></div>
            <div><Label>Texto introdutório</Label><Textarea rows={3} value={data.welcome_text || ''} onChange={e => set('welcome_text', e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch checked={!!data.active} onCheckedChange={v => set('active', v)} /><Label>Marca ativa (link público acessível)</Label></div>
          </TabsContent>
          <TabsContent value="brand" className="space-y-3 pt-4">
            <div><Label>Logo</Label><FileUploadInput value={data.logo_url || ''} onChange={v => set('logo_url', v)} accept="image/*" /></div>
            <div><Label>Imagem de capa (banner)</Label><FileUploadInput value={data.cover_url || ''} onChange={v => set('cover_url', v)} accept="image/*" /></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Cor primária</Label><Input type="color" value={data.primary_color || '#0ea5e9'} onChange={e => set('primary_color', e.target.value)} /></div>
              <div><Label>Cor de destaque</Label><Input type="color" value={data.accent_color || '#0284c7'} onChange={e => set('accent_color', e.target.value)} /></div>
            </div>
          </TabsContent>
          <TabsContent value="fields" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">Defina quais campos o instalador deve preencher. Campos com chaves <code>name, cpf, email, password, phone, company, city, state</code> são salvos nas colunas padrão; demais entram em "extra".</p>
            <div className="space-y-2">
              {(data.signup_fields || []).map((f: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end border p-2 rounded">
                  <div className="col-span-3"><Label className="text-xs">Chave</Label><Input value={f.key} onChange={e => setField(i, 'key', e.target.value)} /></div>
                  <div className="col-span-4"><Label className="text-xs">Rótulo</Label><Input value={f.label} onChange={e => setField(i, 'label', e.target.value)} /></div>
                  <div className="col-span-3"><Label className="text-xs">Tipo</Label>
                    <Select value={f.type} onValueChange={v => setField(i, 'type', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['text','email','password','cpf','phone','uf'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex items-center pb-2"><Switch checked={!!f.required} onCheckedChange={v => setField(i, 'required', v)} /></div>
                  <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => removeField(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addField}><Plus className="h-4 w-4 mr-1" />Adicionar campo</Button>
          </TabsContent>
          <TabsContent value="notify" className="space-y-3 pt-4">
            <div>
              <Label>Conexão WhatsApp (para enviar o aviso de aprovação)</Label>
              <Select value={data.notify_connection_id || 'none'} onValueChange={v => set('notify_connection_id', v === 'none' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar conexão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem WhatsApp</SelectItem>
                  {connections.map(c => {
                    const label = c.instance_name || c.phone_number || c.instance_id || c.provider || 'Conexão';
                    return <SelectItem key={c.id} value={c.id}>{label} · {c.status}</SelectItem>;
                  })}

                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">O e-mail usa o SMTP configurado na sua organização.</p>
            </div>
            <div>
              <Label>Mensagem de aprovação</Label>
              <Textarea rows={8} value={data.approval_message || ''} onChange={e => set('approval_message', e.target.value)} placeholder={"Olá {nome}! 🎉\n\nSeu cadastro na área *{marca}* foi aprovado.\n\n🔐 Suas credenciais de acesso:\nE-mail: {email}\nSenha temporária: *{senha}*\n\nAcesse: {link}\n\nAo entrar pela primeira vez você será solicitado a criar uma nova senha."} />
              <p className="text-xs text-muted-foreground mt-1">Variáveis: <code>{'{nome}'}</code> <code>{'{marca}'}</code> <code>{'{link}'}</code> <code>{'{email}'}</code> <code>{'{senha}'}</code> <code>{'{empresa}'}</code>. Use <code>{'{senha}'}</code> para incluir a senha temporária gerada. Deixe em branco para usar a mensagem padrão personalizada com a marca.</p>
            </div>
            <div className="pt-3 border-t space-y-2">
              <div className="flex items-center justify-between">
                <Label>Destinatários das notificações (novos cadastros)</Label>
                <Button size="sm" variant="outline" onClick={addRecipient}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar
                </Button>
              </div>
              {(data.notify_admin_recipients || []).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum destinatário. Adicione nome + WhatsApp e/ou e-mail para receber avisos de novos cadastros.</p>
              )}
              {(data.notify_admin_recipients || []).map((r: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end border p-2 rounded">
                  <div className="col-span-3">
                    <Label className="text-xs">Nome</Label>
                    <Input
                      value={r.name || ''}
                      onChange={e => setRecipient(i, 'name', e.target.value)}
                      placeholder="Ex.: João da Silva"
                    />
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">WhatsApp</Label>
                    <Input
                      value={r.phone || ''}
                      onChange={e => setRecipient(i, 'phone', e.target.value)}
                      placeholder="5511999999999"
                    />
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">E-mail</Label>
                    <Input
                      type="email"
                      value={r.email || ''}
                      onChange={e => setRecipient(i, 'email', e.target.value)}
                      placeholder="joao@empresa.com"
                    />
                  </div>
                  <div className="col-span-1 flex items-center pb-1">
                    <Button size="sm" variant="ghost" onClick={() => removeRecipient(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Cada destinatário recebe aviso de novo cadastro por WhatsApp e/ou e-mail (preencha ao menos um). Use <code>{'{destinatario}'}</code> na mensagem para incluir o nome.</p>
            </div>
            <div>
              <Label>Mensagem de novo cadastro</Label>
              <Textarea
                rows={5}
                value={data.signup_notify_message || ''}
                onChange={e => set('signup_notify_message', e.target.value)}
                placeholder={"🔔 Novo cadastro aguardando aprovação\n\n{saudacao}👤 {nome}\n📧 {email}\n📱 {telefone}\n🏢 {empresa}\n📍 {cidade}/{uf}\n\nÁrea: {marca}"}
              />
              <p className="text-xs text-muted-foreground mt-1">Variáveis: <code>{'{nome}'}</code> <code>{'{email}'}</code> <code>{'{telefone}'}</code> <code>{'{empresa}'}</code> <code>{'{cidade}'}</code> <code>{'{uf}'}</code> <code>{'{marca}'}</code> <code>{'{destinatario}'}</code> <code>{'{saudacao}'}</code>. Deixe em branco para usar o modelo padrão.</p>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// APPROVALS TAB
// =========================================================================
function ApprovalsTab({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { setItems(await eadAdminApi.pendingStudents()); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    setBusy(id);
    try {
      const r = await eadAdminApi.approveStudent(id);
      const w = r.notify?.whatsapp;
      const e = r.notify?.email;
      toast.success(`Aprovado! WhatsApp: ${w?.success ? 'enviado' : (w?.error || 'falhou')} • E-mail: ${e?.success ? 'enviado' : (e?.error || 'falhou')}`);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }
  async function reject(id: string) {
    const reason = prompt('Motivo da rejeição (opcional):') || '';
    setBusy(id);
    try { await eadAdminApi.rejectStudent(id, reason); toast.success('Rejeitado'); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  }

  return (
    <Card><CardHeader><CardTitle>Cadastros aguardando aprovação ({items.length})</CardTitle></CardHeader><CardContent>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin h-5 w-5" /></div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Instalador</TableHead><TableHead>Marca</TableHead><TableHead>Contato</TableHead><TableHead>Empresa</TableHead><TableHead>Solicitado</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map(s => (
              <TableRow key={s.id}>
                <TableCell><div className="font-medium">{s.name}</div><div className="text-xs text-muted-foreground">CPF: {s.cpf}</div></TableCell>
                <TableCell>{s.brand_name ? <Badge variant="outline">{s.brand_name}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                <TableCell><div className="text-xs">{s.email}</div><div className="text-xs text-muted-foreground">{s.phone || 'sem telefone'}</div></TableCell>
                <TableCell><div className="text-xs">{s.company || '-'}</div><div className="text-xs text-muted-foreground">{[s.city, s.state].filter(Boolean).join('/')}</div></TableCell>
                <TableCell className="text-xs">{new Date(s.created_at).toLocaleString('pt-BR')}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {canManage && <>
                    <Button size="sm" variant="default" disabled={busy === s.id} onClick={() => approve(s.id)} className="mr-1">
                      {busy === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Aprovar'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => reject(s.id)}>Rejeitar</Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}
            {!items.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum cadastro pendente.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}

function ManualEnrollButton({ brands, onDone }: { brands: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState<any>({
    name: '', cpf: '', email: '', phone: '',
    company: '', city: '', state: '',
    brand_id: '', course_id: '',
    password: '',
    send_notification: true,
  });

  useEffect(() => {
    if (!open) return;
    eadAdminApi.courses().then(setCourses).catch(() => {});
  }, [open]);

  function reset() {
    setForm({
      name: '', cpf: '', email: '', phone: '',
      company: '', city: '', state: '',
      brand_id: '', course_id: '',
      password: '', send_notification: true,
    });
    setResult(null);
  }

  async function submit() {
    if (!form.name || !form.cpf || !form.email || !form.course_id) {
      toast.error('Preencha nome, CPF, e-mail e curso');
      return;
    }
    setSaving(true);
    try {
      const r = await eadAdminApi.manualEnroll({
        ...form,
        brand_id: form.brand_id || null,
      });
      setResult(r);
      const w = r?.notify?.whatsapp;
      const em = r?.notify?.email;
      toast.success(`Aluno cadastrado, prova validada e certificado emitido!${form.send_notification ? ` WhatsApp: ${w?.success ? 'ok' : (w?.error || 'falhou')} • E-mail: ${em?.success ? 'ok' : (em?.error || 'falhou')}` : ''}`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar');
    } finally {
      setSaving(false);
    }
  }

  function copyPass() {
    if (!result?.temp_password) return;
    navigator.clipboard.writeText(result.temp_password).then(() => toast.success('Senha copiada'));
  }

  return (
    <>
      <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
        <Plus className="h-4 w-4 mr-1" /> Cadastro manual (prova presencial)
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar aluno — Prova presencial</DialogTitle>
          </DialogHeader>

          {result?.ok ? (
            <div className="space-y-4">
              <Card className="border-green-300 bg-green-50">
                <CardContent className="p-4 space-y-2">
                  <p className="font-medium text-green-900">✓ Aluno cadastrado com sucesso</p>
                  <p className="text-sm">Nome: <strong>{result.student.name}</strong></p>
                  <p className="text-sm">E-mail: <strong>{result.student.email}</strong></p>
                  <div className="flex items-center gap-2 text-sm">
                    <span>Senha temporária:</span>
                    <code className="px-2 py-1 bg-white border rounded font-mono">{result.temp_password}</code>
                    <Button size="sm" variant="ghost" onClick={copyPass}><Copy className="h-3 w-3" /></Button>
                  </div>
                  {result.certificate && (
                    <div className="text-sm">
                      Certificado:{' '}
                      <a href={result.certificate.pdf_url} target="_blank" rel="noreferrer" className="text-primary underline">
                        Baixar PDF
                      </a>
                    </div>
                  )}
                  {result.notify && (
                    <div className="text-xs text-muted-foreground pt-2 border-t mt-2">
                      WhatsApp: {result.notify.whatsapp?.success ? '✓ enviado' : `✗ ${result.notify.whatsapp?.error || 'falhou'}`}<br/>
                      E-mail: {result.notify.email?.success ? '✓ enviado' : `✗ ${result.notify.email?.error || 'falhou'}`}
                    </div>
                  )}
                </CardContent>
              </Card>
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Cadastrar outro</Button>
                <Button onClick={() => setOpen(false)}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use este formulário para alunos que fizeram a prova no papel. O sistema cria o aluno, marca a prova como aprovada (100%) e emite o certificado.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label>CPF *</Label>
                  <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="Apenas números" />
                </div>
                <div>
                  <Label>E-mail *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <Label>WhatsApp (com DDD)</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Ex: 5511987654321" />
                </div>
                <div>
                  <Label>Empresa</Label>
                  <Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={form.state} maxLength={2} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <Label>Marca</Label>
                  <Select value={form.brand_id || '__none__'} onValueChange={(v) => setForm({ ...form, brand_id: v === '__none__' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Sem marca" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem marca</SelectItem>
                      {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Curso *</Label>
                  <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o curso" /></SelectTrigger>
                    <SelectContent>
                      {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Senha temporária (opcional)</Label>
                  <Input
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Deixe em branco para gerar automaticamente (mín. 6 caracteres)"
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Switch
                    checked={form.send_notification}
                    onCheckedChange={(v) => setForm({ ...form, send_notification: v })}
                  />
                  <Label className="cursor-pointer" onClick={() => setForm({ ...form, send_notification: !form.send_notification })}>
                    Enviar senha por WhatsApp e e-mail
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={submit} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Cadastrar, aprovar e emitir certificado
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


