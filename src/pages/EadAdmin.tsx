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
import { Loader2, Plus, Pencil, Trash2, GraduationCap, Download, Award, FileQuestion, Video, Layers, Settings, BookOpen } from 'lucide-react';
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
      <div className="flex items-center gap-3 mb-6">
        <GraduationCap className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Academia (EAD)</h1>
          <p className="text-muted-foreground text-sm">Gerencie cursos, módulos, aulas, manuais, provas e certificados.</p>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div> : (
        <Tabs defaultValue="brands">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="brands">Marcas</TabsTrigger>
            <TabsTrigger value="approvals">Aprovações</TabsTrigger>
            <TabsTrigger value="courses">Cursos</TabsTrigger>
            <TabsTrigger value="students">Alunos</TabsTrigger>
            <TabsTrigger value="certs">Certificados emitidos</TabsTrigger>
          </TabsList>

          <TabsContent value="brands" className="mt-4">
            <BrandsTab canManage={!!canManage} />
          </TabsContent>
          <TabsContent value="approvals" className="mt-4">
            <ApprovalsTab canManage={!!canManage} />
          </TabsContent>
          <TabsContent value="courses" className="mt-4">
            <CoursesTab courses={courses} canManage={!!canManage} reload={reload} onOpen={setActiveCourse} />
          </TabsContent>
          <TabsContent value="students" className="mt-4">
            <StudentsTab students={students} />
          </TabsContent>
          <TabsContent value="certs" className="mt-4">
            <CertsTab certs={certs} />
          </TabsContent>
        </Tabs>
      )}

      {activeCourse && (
        <CourseEditor course={activeCourse} canManage={!!canManage} onClose={() => { setActiveCourse(null); reload(); }} />
      )}
    </MainLayout>
  );
}

function CourseForm({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <div className="space-y-3">
      <div><Label>Título</Label><Input value={value.title || ''} onChange={e => onChange({ ...value, title: e.target.value })} placeholder="Ex: RedBar" /></div>
      <div><Label>Descrição</Label><Textarea value={value.description || ''} onChange={e => onChange({ ...value, description: e.target.value })} /></div>
      <div><Label>Capa</Label><FileUploadInput value={value.cover_url || ''} onChange={v => onChange({ ...value, cover_url: v })} accept="image/*" /></div>
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
  const [form, setForm] = useState<any>({ title: '', description: '', cover_url: '', published: false, has_certificate: true, passing_score: 100 });

  async function create() {
    if (!form.title) { toast.error('Título obrigatório'); return; }
    try {
      await eadAdminApi.createCourse(form);
      toast.success('Curso criado');
      setCreating(false); setForm({ title: '', description: '', cover_url: '', published: false, has_certificate: true, passing_score: 100 });
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
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Novo curso</Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Curso</TableHead><TableHead>Aulas</TableHead><TableHead>Manuais</TableHead><TableHead>Perguntas</TableHead><TableHead>Aprov.</TableHead><TableHead>Cert.</TableHead><TableHead>Emitidos</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {courses.map(c => (
                <TableRow key={c.id}>
                  <TableCell><div className="font-medium">{c.title}</div><div className="text-xs text-muted-foreground line-clamp-1">{c.description}</div></TableCell>
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
              {!courses.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum curso criado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo curso</DialogTitle></DialogHeader>
          <CourseForm value={form} onChange={setForm} />
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
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await eadAdminApi.updateCourse(course.id, form); toast.success('Salvo'); }
    catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-4">
      <CourseForm value={form} onChange={setForm} />
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
  const [form, setForm] = useState<any>({ title: '', youtube_url: '', module_id: '', description: '' });
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
    if (!form.title || !form.youtube_url) { toast.error('Preencha título e URL'); return; }
    try {
      await eadAdminApi.createLesson(courseId, { ...form, module_id: form.module_id || null, order_index: items.length });
      setForm({ title: '', youtube_url: '', module_id: form.module_id, description: '' }); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function saveEdit() {
    try { await eadAdminApi.updateLesson(editing.id, { title: editing.title, youtube_url: editing.youtube_url, description: editing.description, module_id: editing.module_id || null }); setEditing(null); load(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Excluir aula?')) return;
    try { await eadAdminApi.deleteLesson(id); load(); } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <Loader2 className="animate-spin h-5 w-5 mx-auto" />;

  // group by module
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
            <div className="font-medium text-sm truncate">{l.title}</div>
            <div className="text-xs text-muted-foreground truncate">{l.youtube_url}</div>
          </div>
          {canManage && <>
            <Button size="icon" variant="ghost" onClick={() => setEditing({ ...l })}><Pencil className="h-4 w-4" /></Button>
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
        <div className="border-t pt-3 space-y-2">
          <div className="grid sm:grid-cols-12 gap-2">
            <div className="sm:col-span-4"><Label>Título</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div className="sm:col-span-5"><Label>URL do YouTube</Label><Input value={form.youtube_url} onChange={e => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://youtu.be/..." /></div>
            <div className="sm:col-span-2">
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
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar aula</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><Label>URL do YouTube</Label><Input value={editing.youtube_url} onChange={e => setEditing({ ...editing, youtube_url: e.target.value })} /></div>
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

function StudentsTab({ students }: { students: any[] }) {
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CPF</TableHead><TableHead>Email</TableHead><TableHead>Empresa</TableHead><TableHead>Cidade/UF</TableHead><TableHead>Inscrições</TableHead><TableHead>Certificados</TableHead></TableRow></TableHeader>
        <TableBody>
          {students.map(s => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="font-mono text-xs">{s.cpf}</TableCell>
              <TableCell>{s.email}</TableCell>
              <TableCell>{s.company || '-'}</TableCell>
              <TableCell>{[s.city, s.state].filter(Boolean).join(' / ') || '-'}</TableCell>
              <TableCell>{s.enrollment_count}</TableCell>
              <TableCell><Badge>{s.certificate_count}</Badge></TableCell>
            </TableRow>
          ))}
          {!students.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum aluno cadastrado.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function CertsTab({ certs }: { certs: any[] }) {
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow><TableHead>Aluno</TableHead><TableHead>Empresa</TableHead><TableHead>Curso</TableHead><TableHead>Emitido em</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {certs.map(c => (
            <TableRow key={c.id}>
              <TableCell><div className="font-medium">{c.student_name}</div><div className="text-xs text-muted-foreground">{c.cpf}</div></TableCell>
              <TableCell>{c.company || '-'}</TableCell>
              <TableCell>{c.course_title}</TableCell>
              <TableCell>{new Date(c.issued_at).toLocaleString('pt-BR')}</TableCell>
              <TableCell><a href={c.pdf_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />PDF</Button></a></TableCell>
            </TableRow>
          ))}
          {!certs.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum certificado emitido.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
