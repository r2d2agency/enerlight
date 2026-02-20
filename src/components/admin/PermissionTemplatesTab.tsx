import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Shield, Users, UserCheck, Briefcase, Crown, Eye } from 'lucide-react';

const ICON_OPTIONS = [
  { value: 'Users', label: 'Usuários' },
  { value: 'UserCheck', label: 'Usuário Check' },
  { value: 'Briefcase', label: 'Maleta' },
  { value: 'Crown', label: 'Coroa' },
  { value: 'Shield', label: 'Escudo' },
  { value: 'Eye', label: 'Olho' },
];

const ICON_MAP: Record<string, typeof Users> = {
  Users, UserCheck, Briefcase, Crown, Shield, Eye,
};

interface PermissionGroup {
  title: string;
  items: { key: string; label: string; description: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Atendimento',
    items: [
      { key: 'can_view_chat', label: 'Chat', description: 'Acessar o chat' },
      { key: 'can_view_chatbots', label: 'Chatbots', description: 'Gerenciar chatbots' },
      { key: 'can_view_flows', label: 'Fluxos', description: 'Editor de fluxos' },
      { key: 'can_view_departments', label: 'Departamentos', description: 'Gerenciar departamentos' },
      { key: 'can_view_schedules', label: 'Agendamentos', description: 'Mensagens agendadas' },
      { key: 'can_view_tags', label: 'Tags', description: 'Gerenciar tags' },
      { key: 'can_view_contacts', label: 'Contatos', description: 'Lista de contatos' },
      { key: 'can_view_ai_secretary', label: 'Secretária IA', description: 'Secretária de grupos' },
      { key: 'can_view_ai_agents', label: 'Agentes IA', description: 'Configurar agentes IA' },
    ],
  },
  {
    title: 'CRM',
    items: [
      { key: 'can_view_crm', label: 'Negociações', description: 'Kanban de negociações' },
      { key: 'can_view_prospects', label: 'Prospects', description: 'Gestão de prospects' },
      { key: 'can_view_companies', label: 'Empresas', description: 'Cadastro de empresas' },
      { key: 'can_view_map', label: 'Mapa', description: 'Visualização em mapa' },
      { key: 'can_view_calendar', label: 'Agenda', description: 'Agenda do CRM' },
      { key: 'can_view_tasks', label: 'Tarefas', description: 'Gestão de tarefas' },
      { key: 'can_view_reports', label: 'Relatórios', description: 'Relatórios do CRM' },
      { key: 'can_view_revenue_intel', label: 'Revenue Intel', description: 'Inteligência de receita' },
      { key: 'can_view_ghost', label: 'Modo Fantasma', description: 'Auditoria e análise' },
      { key: 'can_view_crm_settings', label: 'Config. CRM', description: 'Configurações do CRM' },
    ],
  },
  {
    title: 'Projetos',
    items: [
      { key: 'can_view_projects', label: 'Projetos', description: 'Kanban de projetos' },
    ],
  },
  {
    title: 'Disparos',
    items: [
      { key: 'can_view_campaigns', label: 'Campanhas', description: 'Listas, mensagens e campanhas' },
      { key: 'can_view_sequences', label: 'Sequências', description: 'Sequências de nurturing' },
      { key: 'can_view_external_flows', label: 'Fluxos Externos', description: 'Formulários externos' },
      { key: 'can_view_webhooks', label: 'Webhooks', description: 'Webhooks de leads' },
      { key: 'can_view_ctwa', label: 'CTWA Analytics', description: 'Click to WhatsApp' },
    ],
  },
  {
    title: 'Administração',
    items: [
      { key: 'can_view_settings', label: 'Ajustes', description: 'Configurações pessoais' },
      { key: 'can_view_billing', label: 'Cobrança', description: 'Gestão de cobranças' },
      { key: 'can_view_connections', label: 'Conexões', description: 'Conexões WhatsApp' },
      { key: 'can_view_organizations', label: 'Organizações', description: 'Gerenciar organização' },
    ],
  },
];

const ALL_KEYS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

interface PermissionTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  permissions: Record<string, boolean>;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export function PermissionTemplatesTab() {
  const [templates, setTemplates] = useState<PermissionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PermissionTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Users');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await api<PermissionTemplate[]>('/api/permission-templates');
      setTemplates(data);
    } catch {
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setIcon('Users');
    setPermissions(Object.fromEntries(ALL_KEYS.map(k => [k, false])));
    setEditorOpen(true);
  };

  const openEdit = (tpl: PermissionTemplate) => {
    setEditing(tpl);
    setName(tpl.name);
    setDescription(tpl.description || '');
    setIcon(tpl.icon);
    setPermissions({ ...Object.fromEntries(ALL_KEYS.map(k => [k, false])), ...tpl.permissions });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/permission-templates/${editing.id}`, {
          method: 'PUT',
          body: { name, description, icon, permissions },
        });
        toast.success('Template atualizado!');
      } else {
        await api('/api/permission-templates', {
          method: 'POST',
          body: { name, description, icon, permissions },
        });
        toast.success('Template criado!');
      }
      setEditorOpen(false);
      loadTemplates();
    } catch {
      toast.error('Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/permission-templates/${id}`, { method: 'DELETE' });
      toast.success('Template excluído!');
      loadTemplates();
    } catch {
      toast.error('Erro ao excluir template');
    }
  };

  const togglePermission = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllGroup = (group: PermissionGroup, value: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev };
      group.items.forEach(item => { updated[item.key] = value; });
      return updated;
    });
  };

  const countEnabled = (perms: Record<string, boolean>) =>
    ALL_KEYS.filter(k => perms[k]).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Templates de Permissão</h2>
          <p className="text-sm text-muted-foreground">
            Defina conjuntos de permissões reutilizáveis para aplicar rapidamente aos membros
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Template
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => {
          const IconComp = ICON_MAP[tpl.icon] || Users;
          const enabledCount = countEnabled(tpl.permissions);
          return (
            <Card key={tpl.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <IconComp className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{tpl.name}</CardTitle>
                      {tpl.is_default && (
                        <Badge variant="secondary" className="text-xs mt-1">Padrão</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(tpl)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir template?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O template "{tpl.name}" será excluído permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(tpl.id)} className="bg-destructive hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">{tpl.description || 'Sem descrição'}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" />
                  <span>{enabledCount}/{ALL_KEYS.length} permissões ativas</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {templates.length === 0 && (
        <Card className="p-8 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum template criado ainda</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Criar primeiro template
          </Button>
        </Card>
      )}

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editing ? 'Editar Template' : 'Novo Template'}</DialogTitle>
            <DialogDescription>
              Configure o nome e as permissões do template
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="space-y-4 pb-4">
              <div className="grid gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Vendedor" />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição..." rows={2} />
                </div>
                <div>
                  <Label>Ícone</Label>
                  <Select value={icon} onValueChange={setIcon}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3">Permissões</h4>
                {PERMISSION_GROUPS.map((group) => {
                  const groupEnabled = group.items.filter(i => permissions[i.key]).length;
                  return (
                    <div key={group.title} className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{group.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{groupEnabled}/{group.items.length}</span>
                          <Button
                            variant="ghost" size="sm" className="h-6 px-2 text-xs"
                            onClick={() => {
                              const allOn = group.items.every(i => permissions[i.key]);
                              toggleAllGroup(group, !allOn);
                            }}
                          >
                            {group.items.every(i => permissions[i.key]) ? 'Desmarcar' : 'Marcar'} todos
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 rounded-lg border p-3">
                        {group.items.map(item => (
                          <div key={item.key} className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-muted/50">
                            <div>
                              <Label htmlFor={`tpl-${item.key}`} className="text-sm font-medium cursor-pointer">{item.label}</Label>
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            </div>
                            <Switch
                              id={`tpl-${item.key}`}
                              checked={permissions[item.key] || false}
                              onCheckedChange={() => togglePermission(item.key)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
