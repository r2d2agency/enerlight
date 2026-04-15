import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurveyOverview } from "@/hooks/use-surveys";
import { ClipboardList, Users, Activity, TrendingUp } from "lucide-react";

export function SurveyOverviewDashboard() {
  const { data: overview, isLoading } = useSurveyOverview();

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-bold">{overview?.total_surveys || 0}</div>
                <div className="text-sm text-muted-foreground">Total de Pesquisas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{overview?.active_surveys || 0}</div>
                <div className="text-sm text-muted-foreground">Pesquisas Ativas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{overview?.total_responses || 0}</div>
                <div className="text-sm text-muted-foreground">Total de Respostas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">
                  {overview?.total_surveys ? (overview.total_responses / overview.total_surveys).toFixed(1) : '0'}
                </div>
                <div className="text-sm text-muted-foreground">Média por Pesquisa</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {overview?.surveys && overview.surveys.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pesquisas Recentes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.surveys.slice(0, 10).map(s => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{s.response_count || 0}</div>
                    <div className="text-xs text-muted-foreground">respostas</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
