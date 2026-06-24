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
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, GraduationCap, Download, Award, FileQuestion, Video } from 'lucide-react';
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
          <p className="text-muted-foreground text-sm">Gerencie cursos, aulas, provas, certificados e alunos.</p>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div> : (
        <Tabs defaultValue="courses">
          <TabsList>
            <TabsTrigger value="courses">Cursos</TabsTrigger>
            <TabsTrigger value="students">Alunos</TabsTrigger>
            <TabsTrigger value="certs">Certificados emitidos</TabsTrigger>
          </TabsList>

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

function CoursesTab({ courses, canManage, reload, onOpen }: { courses: any[]; canManage: boolean; reload: () => void; onOpen: (c: any) => void }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', cover_url: '', published: false });

  async function create() {
    if (!form.title) { toast.error('Título obrigatório'); return; }
    try {
      await eadAdminApi.createCourse(form);
      toast.success('Curso criado');
      setCreating(false); setForm({ title: '', description: '', cover_url: '', published: false });
      reload();
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm('Excluir curso? Aulas, perguntas e certificados serão apagados.')) return;
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
              <TableHead>Curso</TableHead><TableHead>Aulas</TableHead><TableHead>Perguntas</TableHead><TableHead>Certificados</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {courses.map(c => (
                <TableRow key={c.id}>
                  <TableCell><div className="font-medium">{c.title}</div><div className="text-xs text-muted-foreground line-clamp-1">{c.description}</div></TableCell>
                  <TableCell>{c.lesson_count}</TableCell>
                  <TableCell>{c.question_count}</TableCell>
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
              {!courses.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum curso criado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo curso</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: RedBar" /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Capa</Label><FileUploadInput value={form.cover_url} onChange={v => setForm(f => ({ ...f, cover_url: v }))} accept="image/*" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.published} onCheckedChange={v => setForm(f => ({ ...f, published: v }))} /><Label>Publicar imediatamente</Label></div>
          </div>
          <DialogFooter><Button onClick={create}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CourseEditor({ course, canManage, onClose }: { course: any; canManage: boolean; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{course.title}</DialogTitle></DialogHeader>
        <Tabs defaultValue="lessons">
          <TabsList>
            <TabsTrigger value="lessons"><Video className="h-4 w-4 mr-1" />Aulas</TabsTrigger>
            <TabsTrigger value="quiz"><FileQuestion className="h-4 w-4 mr-1" />Prova</TabsTrigger>
            <TabsTrigger value="cert"><Award className="h-4 w-4 mr-1" />Certificado</TabsTrigger>
          </TabsList>
          <TabsContent value="lessons" className="mt-4"><LessonsManager courseId={course.id} canManage={canManage} /></TabsContent>
          <TabsContent value="quiz" className="mt-4"><QuestionsManager courseId={course.id} canManage={canManage} /></TabsContent>
          <TabsContent value="cert" className="mt-4">{canManage ? <CertificateEditor courseId={course.id} /> : <p className="text-muted-foreground text-sm">Sem permissão.</p>}</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function LessonsManager({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', youtube_url: '', order_index: 0 });
  async function load() { setLoading(true); try { setItems(await eadAdminApi.lessons(courseId)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [courseId]);
  async function add() {
    if (!form.title || !form.youtube_url) { toast.error('Preencha título e URL'); return; }
    try { await eadAdminApi.createLesson(courseId, form); setForm({ title: '', youtube_url: '', order_index: items.length }); load(); } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Excluir aula?')) return;
    try { await eadAdminApi.deleteLesson(id); load(); } catch (e: any) { toast.error(e.message); }
  }
  if (loading) return <Loader2 className="animate-spin h-5 w-5 mx-auto" />;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {items.map((l, i) => (
          <div key={l.id} className="flex items-center gap-2 p-2 border rounded-md">
            <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
            <div className="flex-1">
              <div className="font-medium text-sm">{l.title}</div>
              <div className="text-xs text-muted-foreground truncate">{l.youtube_url}</div>
            </div>
            {canManage && <Button size="icon" variant="ghost" onClick={() => del(l.id)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ))}
        {!items.length && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma aula.</p>}
      </div>
      {canManage && (
        <div className="border-t pt-3 grid sm:grid-cols-12 gap-2">
          <div className="sm:col-span-5"><Label>Título</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
          <div className="sm:col-span-6"><Label>URL do YouTube</Label><Input value={form.youtube_url} onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))} placeholder="https://youtu.be/..." /></div>
          <div className="sm:col-span-1 flex items-end"><Button onClick={add} className="w-full"><Plus className="h-4 w-4" /></Button></div>
        </div>
      )}
    </div>
  );
}

function QuestionsManager({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ question: string; options: { text: string; is_correct: boolean }[] }>({ question: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }] });

  async function load() { setLoading(true); try { setItems(await eadAdminApi.questions(courseId)); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [courseId]);

  async function create() {
    if (!draft.question || draft.options.some(o => !o.text)) { toast.error('Preencha pergunta e alternativas'); return; }
    try {
      await eadAdminApi.createQuestion(courseId, { question: draft.question, order_index: items.length, options: draft.options });
      setDraft({ question: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }] });
      setCreating(false); load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Excluir pergunta?')) return;
    try { await eadAdminApi.deleteQuestion(id); load(); } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <Loader2 className="animate-spin h-5 w-5 mx-auto" />;

  return (
    <div className="space-y-3">
      {items.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="p-4">
            <div className="flex justify-between gap-2 mb-2">
              <p className="font-medium text-sm">{i + 1}. {q.question}</p>
              {canManage && <Button size="icon" variant="ghost" onClick={() => del(q.id)}><Trash2 className="h-4 w-4" /></Button>}
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
      {canManage && !creating && <Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Adicionar pergunta</Button>}
      {canManage && creating && (
        <Card><CardContent className="p-4 space-y-3">
          <div><Label>Pergunta</Label><Textarea value={draft.question} onChange={e => setDraft(d => ({ ...d, question: e.target.value }))} /></div>
          <div className="space-y-2">
            <Label>Alternativas (marque a correta)</Label>
            {draft.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" checked={o.is_correct} onChange={() => setDraft(d => ({ ...d, options: d.options.map((x, j) => ({ ...x, is_correct: i === j })) }))} />
                <Input value={o.text} onChange={e => setDraft(d => ({ ...d, options: d.options.map((x, j) => i === j ? { ...x, text: e.target.value } : x) }))} placeholder={`Alternativa ${i + 1}`} />
                {draft.options.length > 2 && <Button size="icon" variant="ghost" onClick={() => setDraft(d => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setDraft(d => ({ ...d, options: [...d.options, { text: '', is_correct: false }] }))}><Plus className="h-3 w-3 mr-1" />Alternativa</Button>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button><Button onClick={create}>Salvar pergunta</Button></div>
        </CardContent></Card>
      )}
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
