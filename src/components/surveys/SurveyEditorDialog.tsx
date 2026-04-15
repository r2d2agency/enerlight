import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSurvey, useSurveyTemplates, useSurveyMutations } from "@/hooks/use-surveys";
import { Plus, Trash2, GripVertical, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const FIELD_TYPE_LABELS: Record<string, string> = {
  nps: "NPS (0-10)",
  rating: "Estrelas (1-5)",
  text: "Texto curto",
  textarea: "Texto longo",
  select: "Escolha única",
  multi_select: "Múltipla escolha",
  yes_no: "Sim / Não",
  scale: "Escala numérica",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surveyId: string | null;
}

export function SurveyEditorDialog({ open, onOpenChange, surveyId }: Props) {
  const { data: existingSurvey } = useSurvey(surveyId);
  const { data: templates = [] } = useSurveyTemplates();
  const { create, update, addField, updateField, removeField } = useSurveyMutations();

  const isEditing = !!surveyId;
  const [tab, setTab] = useState(isEditing ? "settings" : "template");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [requireName, setRequireName] = useState(true);
  const [requireWhatsapp, setRequireWhatsapp] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [thankYouMessage, setThankYouMessage] = useState("Obrigado por responder nossa pesquisa!");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [fields, setFields] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [displayMode, setDisplayMode] = useState<'typeform' | 'scroll'>('typeform');

  useEffect(() => {
    if (existingSurvey && isEditing) {
      setTitle(existingSurvey.title);
      setDescription(existingSurvey.description || "");
      setIntroduction(existingSurvey.introduction || "");
      setThumbnailUrl(existingSurvey.thumbnail_url || "");
      setRequireName(existingSurvey.require_name);
      setRequireWhatsapp(existingSurvey.require_whatsapp);
      setRequireEmail(existingSurvey.require_email);
      setThankYouMessage(existingSurvey.thank_you_message || "");
      setFields(existingSurvey.fields || []);
      setDisplayMode((existingSurvey as any).display_mode || 'typeform');
      setTab("settings");
    } else if (!isEditing) {
      setTitle("");
      setDescription("");
      setIntroduction("");
      setThumbnailUrl("");
      setRequireName(true);
      setRequireWhatsapp(false);
      setRequireEmail(false);
      setThankYouMessage("Obrigado por responder nossa pesquisa!");
      setSelectedTemplate(null);
      setFields([]);
      setDisplayMode('typeform');
      setTab("template");
    }
  }, [existingSurvey, isEditing, open]);

  const selectTemplate = (tplId: string) => {
    const tpl = templates.find(t => t.id === tplId);
    if (tpl) {
      setSelectedTemplate(tplId);
      setTitle(tpl.name);
      setDescription(tpl.description);
      setIntroduction(tpl.introduction);
      setFields(tpl.fields.map((f, i) => ({ ...f, id: `temp-${i}`, sort_order: i })));
      setTab("settings");
    }
  };

  const addNewField = () => {
    setFields(prev => [...prev, {
      id: `temp-${Date.now()}`,
      field_type: "text",
      label: "",
      required: false,
      options: [],
      sort_order: prev.length,
    }]);
  };

  const updateLocalField = (index: number, updates: Record<string, any>) => {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  const removeLocalField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Título é obrigatório", variant: "destructive" });
      return;
    }
    if (fields.length === 0) {
      toast({ title: "Adicione pelo menos uma pergunta", variant: "destructive" });
      return;
    }
    for (const f of fields) {
      if (!f.label?.trim()) {
        toast({ title: "Todas as perguntas precisam ter um texto", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      if (isEditing) {
        // Update survey settings
        await update.mutateAsync({
          id: surveyId,
          title, description, introduction, thumbnail_url: thumbnailUrl,
          require_name: requireName, require_whatsapp: requireWhatsapp, require_email: requireEmail,
          thank_you_message: thankYouMessage,
          display_mode: displayMode,
        });

        // Handle field changes — for simplicity, delete removed and add new
        const existingIds = (existingSurvey?.fields || []).map(f => f.id);
        const currentIds = fields.filter(f => !f.id.startsWith('temp-')).map(f => f.id);

        // Delete removed fields
        for (const eid of existingIds) {
          if (!currentIds.includes(eid)) {
            await removeField.mutateAsync({ surveyId: surveyId!, fieldId: eid });
          }
        }

        // Update existing fields
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          if (!f.id.startsWith('temp-')) {
            await updateField.mutateAsync({
              surveyId: surveyId!,
              fieldId: f.id,
              label: f.label,
              description: f.description,
              required: f.required,
              field_type: f.field_type,
              options: f.options,
              min_value: f.min_value,
              max_value: f.max_value,
              sort_order: i,
            });
          } else {
            // Add new field
            await addField.mutateAsync({
              surveyId: surveyId!,
              field_type: f.field_type,
              label: f.label,
              description: f.description,
              required: f.required,
              options: f.options?.length ? f.options : undefined,
              min_value: f.min_value,
              max_value: f.max_value,
              sort_order: i,
            });
          }
        }

        toast({ title: "Pesquisa atualizada!" });
      } else {
        await create.mutateAsync({
          title, description, introduction, thumbnail_url: thumbnailUrl,
          template_id: selectedTemplate,
          require_name: requireName, require_whatsapp: requireWhatsapp, require_email: requireEmail,
          thank_you_message: thankYouMessage,
          display_mode: displayMode,
          fields: fields.map((f, i) => ({
            field_type: f.field_type,
            label: f.label,
            description: f.description,
            required: f.required,
            options: f.options?.length ? f.options : undefined,
            min_value: f.min_value,
            max_value: f.max_value,
            sort_order: i,
          })),
        });
        toast({ title: "Pesquisa criada!" });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: err.message || "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Pesquisa" : "Nova Pesquisa"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            {!isEditing && <TabsTrigger value="template">Modelo</TabsTrigger>}
            <TabsTrigger value="settings">Configurações</TabsTrigger>
            <TabsTrigger value="fields">Perguntas ({fields.length})</TabsTrigger>
          </TabsList>

          {!isEditing && (
            <TabsContent value="template" className="space-y-4">
              <p className="text-sm text-muted-foreground">Escolha um modelo pronto ou comece do zero</p>
              <div className="grid gap-3 md:grid-cols-2">
                {templates.map(tpl => (
                  <Card key={tpl.id} className={`cursor-pointer hover:shadow-md transition-shadow ${selectedTemplate === tpl.id ? "ring-2 ring-primary" : ""}`} onClick={() => selectTemplate(tpl.id)}>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="font-medium">{tpl.name}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{tpl.description}</p>
                      <Badge variant="outline">{tpl.fields.length} perguntas</Badge>
                    </CardContent>
                  </Card>
                ))}
                <Card className={`cursor-pointer hover:shadow-md transition-shadow ${selectedTemplate === null ? "ring-2 ring-primary" : ""}`} onClick={() => { setSelectedTemplate(null); setFields([]); setTab("settings"); }}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      <span className="font-medium">Personalizada</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Crie do zero com suas próprias perguntas</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          <TabsContent value="settings" className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da pesquisa" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Breve descrição" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Introdução (exibida para o respondente)</Label>
              <Textarea value={introduction} onChange={e => setIntroduction(e.target.value)} placeholder="Texto de boas-vindas..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>URL da Thumbnail</Label>
              <Input value={thumbnailUrl} onChange={e => setThumbnailUrl(e.target.value)} placeholder="https://..." />
              {thumbnailUrl && <img src={thumbnailUrl} alt="" className="h-24 object-cover rounded" />}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium">Dados do respondente</h4>
              <div className="space-y-2 mb-4">
                <Label>Modo de exibição</Label>
                <Select value={displayMode} onValueChange={(v: 'typeform' | 'scroll') => setDisplayMode(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="typeform">Typeform (1 pergunta por vez com animação)</SelectItem>
                    <SelectItem value="scroll">Formulário com rolagem</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Solicitar Nome</Label>
                <Switch checked={requireName} onCheckedChange={setRequireName} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Solicitar WhatsApp</Label>
                <Switch checked={requireWhatsapp} onCheckedChange={setRequireWhatsapp} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Solicitar E-mail</Label>
                <Switch checked={requireEmail} onCheckedChange={setRequireEmail} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mensagem de agradecimento</Label>
              <Textarea value={thankYouMessage} onChange={e => setThankYouMessage(e.target.value)} rows={2} />
            </div>
          </TabsContent>

          <TabsContent value="fields" className="space-y-4">
            {fields.map((field, idx) => (
              <Card key={field.id || idx}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-5 w-5 text-muted-foreground mt-2 flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={field.label}
                          onChange={e => updateLocalField(idx, { label: e.target.value })}
                          placeholder="Texto da pergunta"
                          className="flex-1"
                        />
                        <Select value={field.field_type} onValueChange={v => updateLocalField(idx, { field_type: v })}>
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FIELD_TYPE_LABELS).map(([key, label]) => (
                              <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {(field.field_type === 'select' || field.field_type === 'multi_select') && (
                        <div className="space-y-2">
                          <Label className="text-xs">Opções (uma por linha)</Label>
                          <Textarea
                            value={(field.options || []).join('\n')}
                            onChange={e => updateLocalField(idx, { options: e.target.value.split('\n').filter(Boolean) })}
                            placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                            rows={3}
                          />
                        </div>
                      )}

                      {field.field_type === 'scale' && (
                        <div className="flex gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs">Mínimo</Label>
                            <Input type="number" value={field.min_value || 1} onChange={e => updateLocalField(idx, { min_value: parseInt(e.target.value) })} className="w-20" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Máximo</Label>
                            <Input type="number" value={field.max_value || 5} onChange={e => updateLocalField(idx, { max_value: parseInt(e.target.value) })} className="w-20" />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Switch checked={field.required} onCheckedChange={v => updateLocalField(idx, { required: v })} />
                          <Label className="text-xs">Obrigatória</Label>
                        </div>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeLocalField(idx)}>
                          <Trash2 className="h-3 w-3 mr-1" /> Remover
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button variant="outline" onClick={addNewField} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Adicionar Pergunta
            </Button>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEditing ? "Salvar Alterações" : "Criar Pesquisa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
