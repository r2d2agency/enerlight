import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, RotateCcw, Users, UserCheck, Briefcase, Crown, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: string;
}

interface PermissionGroup {
  title: string;
  items: { key: string; label: string; description: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Atendimento',
    items: [
      { key: 'can_view_chat', label: 'Chat', description: 'Acessar o chat de conversas' },
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
      { key: 'can_view_external_flows', label: 'Fluxos Externos', description: 'Formulários e fluxos externos' },
      { key: 'can_view_webhooks', label: 'Webhooks', description: 'Webhooks de leads' },
      { key: 'can_view_ctwa', label: 'CTWA Analytics', description: 'Click to WhatsApp analytics' },
    ],
  },
  {
    title: 'Administração',
    items: [
      { key: 'can_view_settings', label: 'Ajustes', description: 'Configurações pessoais' },
      { key: 'can_view_billing', label: 'Cobrança', description: 'Gestão de cobranças' },
      { key: 'can_view_connections', label: 'Conexões', description: 'Gerenciar conexões WhatsApp' },
      { key: 'can_view_organizations', label: 'Organizações', description: 'Gerenciar organização' },
    ],
  },
  {
    title: 'Comunicação Interna',
    items: [
      { key: 'can_view_internal_chat', label: 'Chat Interno', description: 'Comunicação entre equipe' },
    ],
  },
];

const ALL_KEYS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

const ICON_MAP: Record<string, typeof Users> = {
  Users, UserCheck, Briefcase, Crown, Shield, Eye,
};

interface APITemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  permissions: Record<string, boolean>;
}

export function PermissionsDialog({ open, onOpenChange, userId, userName, userRole }: PermissionsDialogProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<APITemplate[]>([]);

  useEffect(() => {
    if (open && userId) {
      loadPermissions();
      loadTemplates();
    }
  }, [open, userId]);

  // Detect which template matches current permissions
  useEffect(() => {
    const match = templates.find(t =>
      ALL_KEYS.every(k => (t.permissions[k] || false) === (permissions[k] || false))
    );
    setActiveTemplate(match?.id || null);
  }, [permissions, templates]);

  const loadTemplates = async () => {
    try {
      const data = await api<APITemplate[]>('/api/permission-templates');
      setTemplates(data);
    } catch {
      // Silently fail - hardcoded fallback not needed since admin manages them
    }
  };

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const data = await api<{ permissions: Record<string, boolean>; is_custom: boolean }>(`/api/permissions/${userId}`);
      setPermissions(data.permissions);
      setIsCustom(data.is_custom);
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast.error('Erro ao carregar permissões');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: string) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleAll = (group: PermissionGroup, value: boolean) => {
    setPermissions(prev => {
      const updated = { ...prev };
      group.items.forEach(item => { updated[item.key] = value; });
      return updated;
    });
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setPermissions({ ...Object.fromEntries(ALL_KEYS.map(k => [k, false])), ...template.permissions });
      toast.info(`Template "${template.name}" aplicado`);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/permissions/${userId}`, {
        method: 'PUT',
        body: { permissions },
      });
      toast.success('Permissões salvas!');
      onOpenChange(false);
    } catch (error) {
      toast.error('Erro ao salvar permissões');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await api(`/api/permissions/${userId}`, { method: 'DELETE' });
      toast.success('Permissões resetadas para o padrão do perfil');
      await loadPermissions();
    } catch (error) {
      toast.error('Erro ao resetar permissões');
    } finally {
      setSaving(false);
    }
  };

  const countEnabled = (group: PermissionGroup) => group.items.filter(i => permissions[i.key]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Permissões de {userName}
          </DialogTitle>
          <DialogDescription>
            Perfil: <Badge variant="secondary" className="ml-1">{userRole}</Badge>
            {isCustom && <Badge variant="outline" className="ml-2 text-primary border-primary">Customizado</Badge>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
            <div className="space-y-6 pb-4">
              {/* Template selector */}
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Aplicar template de permissão</Label>
                  <div className={`grid gap-2 ${templates.length <= 3 ? `grid-cols-${templates.length}` : 'grid-cols-3'}`}>
                    {templates.map((tpl) => {
                      const Icon = ICON_MAP[tpl.icon] || Users;
                      const isActive = activeTemplate === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handleApplyTemplate(tpl.id)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-all
                            ${isActive
                              ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                              : 'border-border hover:border-primary/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                            }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-medium">{tpl.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {activeTemplate && (
                    <p className="text-xs text-muted-foreground">
                      {templates.find(t => t.id === activeTemplate)?.description}
                    </p>
                  )}
                </div>
              )}

              <div className="border-t" />

              {/* Permission groups */}
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{group.title}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {countEnabled(group)}/{group.items.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          const allEnabled = group.items.every(i => permissions[i.key]);
                          handleToggleAll(group, !allEnabled);
                        }}
                      >
                        {group.items.every(i => permissions[i.key]) ? 'Desmarcar' : 'Marcar'} todos
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 rounded-lg border p-3">
                    {group.items.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <Label htmlFor={item.key} className="text-sm font-medium cursor-pointer">
                            {item.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        <Switch
                          id={item.key}
                          checked={permissions[item.key] || false}
                          onCheckedChange={() => handleToggle(item.key)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-shrink-0 flex-row gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving || !isCustom}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Resetar
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
