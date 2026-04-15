import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useSurveys, useSurveyOverview, useSurveyMutations, type Survey } from "@/hooks/use-surveys";
import { Plus, Search, BarChart3, ClipboardList, Copy, ExternalLink, Trash2, Pause, Play, Eye, Edit } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { SurveyEditorDialog } from "@/components/surveys/SurveyEditorDialog";
import { SurveyResultsPanel } from "@/components/surveys/SurveyResultsPanel";
import { SurveyOverviewDashboard } from "@/components/surveys/SurveyOverviewDashboard";
import { API_URL } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Rascunho", variant: "secondary" },
  active: { label: "Ativa", variant: "default" },
  paused: { label: "Pausada", variant: "outline" },
  closed: { label: "Encerrada", variant: "destructive" },
};

const templateLabels: Record<string, string> = {
  nps: "NPS",
  satisfaction: "Satisfação",
  post_purchase: "Pós-Compra",
  csat: "CSAT",
  custom: "Personalizada",
};

export default function Pesquisas() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("surveys");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState<string | null>(null);
  const [resultsSurvey, setResultsSurvey] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: surveys = [], isLoading } = useSurveys();
  const { data: overview } = useSurveyOverview();
  const { update, remove } = useSurveyMutations();

  const filtered = surveys.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  const getShareUrl = (slug: string) => {
    const base = window.location.origin;
    return `${base}/pesquisa/${slug}`;
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(getShareUrl(slug));
    toast({ title: "Link copiado!" });
  };

  const toggleStatus = (survey: Survey) => {
    const newStatus = survey.status === "active" ? "paused" : "active";
    update.mutate({ id: survey.id, status: newStatus }, {
      onSuccess: () => toast({ title: `Pesquisa ${newStatus === 'active' ? 'ativada' : 'pausada'}` }),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    remove.mutate(deleteId, {
      onSuccess: () => { toast({ title: "Pesquisa excluída" }); setDeleteId(null); },
    });
  };

  if (resultsSurvey) {
    return (
      <MainLayout>
        <SurveyResultsPanel
          surveyId={resultsSurvey}
          onBack={() => setResultsSurvey(null)}
        />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pesquisas</h1>
            <p className="text-muted-foreground text-sm">Crie e gerencie pesquisas de satisfação, NPS e muito mais</p>
          </div>
          <Button onClick={() => { setEditingSurvey(null); setEditorOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Pesquisa
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="surveys">
              <ClipboardList className="h-4 w-4 mr-2" />
              Pesquisas
            </TabsTrigger>
            <TabsTrigger value="dashboard">
              <BarChart3 className="h-4 w-4 mr-2" />
              Dashboard Geral
            </TabsTrigger>
          </TabsList>

          <TabsContent value="surveys" className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar pesquisas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma pesquisa encontrada</p>
                  <Button className="mt-4" onClick={() => { setEditingSurvey(null); setEditorOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> Criar primeira pesquisa
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map(survey => (
                  <Card key={survey.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base line-clamp-2">{survey.title}</CardTitle>
                        <Badge variant={statusMap[survey.status]?.variant || "secondary"}>
                          {statusMap[survey.status]?.label || survey.status}
                        </Badge>
                      </div>
                      {survey.template_type && (
                        <Badge variant="outline" className="w-fit text-xs">
                          {templateLabels[survey.template_type] || survey.template_type}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{survey.field_count || 0} perguntas</span>
                        <span>{survey.response_count || 0} respostas</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditingSurvey(survey.id); setEditorOpen(true); }}>
                          <Edit className="h-3 w-3 mr-1" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setResultsSurvey(survey.id)}>
                          <Eye className="h-3 w-3 mr-1" /> Resultados
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyLink(survey.share_slug)}>
                          <Copy className="h-3 w-3 mr-1" /> Link
                        </Button>
                        {survey.status === 'active' && (
                          <Button size="sm" variant="ghost" onClick={() => window.open(getShareUrl(survey.share_slug), '_blank')}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(survey)}>
                          {survey.status === "active" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(survey.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="dashboard">
            <SurveyOverviewDashboard />
          </TabsContent>
        </Tabs>
      </div>

      <SurveyEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        surveyId={editingSurvey}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pesquisa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as respostas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
