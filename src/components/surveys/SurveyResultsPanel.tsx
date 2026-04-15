import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSurvey, useSurveyResults } from "@/hooks/use-surveys";
import { ArrowLeft, Download, BarChart3, List, Star } from "lucide-react";

interface Props {
  surveyId: string;
  onBack: () => void;
}

export function SurveyResultsPanel({ surveyId, onBack }: Props) {
  const { data: survey } = useSurvey(surveyId);
  const { data: results, isLoading } = useSurveyResults(surveyId);
  const [tab, setTab] = useState("dashboard");

  const exportCSV = () => {
    if (!results) return;
    const fields = results.fields;
    const headers = ['Data', 'Nome', 'WhatsApp', 'E-mail', ...fields.map(f => f.label)];
    const rows = results.responses.map(r => {
      const ans = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;
      return [
        new Date(r.submitted_at).toLocaleString('pt-BR'),
        r.respondent_name || '',
        r.respondent_whatsapp || '',
        r.respondent_email || '',
        ...fields.map(f => {
          const val = ans[f.id];
          return Array.isArray(val) ? val.join('; ') : String(val ?? '');
        }),
      ];
    });

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pesquisa-${survey?.title?.slice(0, 30) || 'resultados'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getNPSColor = (score: number) => {
    if (score >= 50) return "text-green-500";
    if (score >= 0) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{survey?.title || 'Resultados'}</h1>
          <p className="text-sm text-muted-foreground">{results?.stats?.total_responses || 0} respostas</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!results?.responses?.length}>
          <Download className="h-4 w-4 mr-2" /> Exportar CSV
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-2" /> Dashboard</TabsTrigger>
          <TabsTrigger value="responses"><List className="h-4 w-4 mr-2" /> Respostas</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : !results?.stats?.total_responses ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma resposta ainda</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {results.fields.map(field => {
                const stat = results.stats.field_stats[field.id];
                if (!stat) return null;

                return (
                  <Card key={field.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm line-clamp-2">{field.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {stat.type === 'nps' && (
                        <div className="space-y-3">
                          <div className="text-center">
                            <div className={`text-4xl font-bold ${getNPSColor(stat.nps_score)}`}>{stat.nps_score}</div>
                            <div className="text-sm text-muted-foreground">NPS Score</div>
                          </div>
                          <div className="flex justify-around text-sm">
                            <div className="text-center">
                              <div className="font-medium text-green-500">{stat.promoters}</div>
                              <div className="text-xs text-muted-foreground">Promotores</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-yellow-500">{stat.passives}</div>
                              <div className="text-xs text-muted-foreground">Neutros</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-red-500">{stat.detractors}</div>
                              <div className="text-xs text-muted-foreground">Detratores</div>
                            </div>
                          </div>
                          <div className="text-xs text-center text-muted-foreground">Média: {stat.average} | {stat.total} respostas</div>
                        </div>
                      )}

                      {(stat.type === 'rating' || stat.type === 'scale') && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                            <span className="text-2xl font-bold">{stat.average}</span>
                            <span className="text-sm text-muted-foreground">/ {field.field_type === 'rating' ? 5 : field.max_value || 5}</span>
                          </div>
                          <div className="space-y-1">
                            {Object.entries(stat.distribution as Record<string, number>)
                              .sort(([a], [b]) => Number(b) - Number(a))
                              .map(([score, count]) => {
                                const pct = stat.total ? Math.round(((count as number) / stat.total) * 100) : 0;
                                return (
                                  <div key={score} className="flex items-center gap-2 text-sm">
                                    <span className="w-6 text-right">{score}</span>
                                    <div className="flex-1 bg-muted rounded-full h-2">
                                      <div className="bg-primary rounded-full h-2" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground w-12">{count} ({pct}%)</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {(stat.type === 'choice' || stat.type === 'multi_choice') && (
                        <div className="space-y-2">
                          {Object.entries(stat.distribution as Record<string, number>)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([option, count]) => {
                              const pct = stat.total ? Math.round(((count as number) / stat.total) * 100) : 0;
                              return (
                                <div key={option} className="flex items-center gap-2 text-sm">
                                  <span className="flex-1 truncate">{option}</span>
                                  <div className="w-24 bg-muted rounded-full h-2">
                                    <div className="bg-primary rounded-full h-2" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-16 text-right">{count} ({pct}%)</span>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {stat.type === 'text' && (
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">{stat.total} respostas</div>
                          {stat.sample?.map((s: string, i: number) => (
                            <div key={i} className="text-sm bg-muted p-2 rounded">{s}</div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="responses">
          {!results?.responses?.length ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma resposta</CardContent></Card>
          ) : (
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>E-mail</TableHead>
                    {results.fields.map(f => (
                      <TableHead key={f.id} className="min-w-[150px]">{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.responses.map(r => {
                    const ans = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{new Date(r.submitted_at).toLocaleString('pt-BR')}</TableCell>
                        <TableCell>{r.respondent_name || '-'}</TableCell>
                        <TableCell>{r.respondent_whatsapp || '-'}</TableCell>
                        <TableCell>{r.respondent_email || '-'}</TableCell>
                        {results.fields.map(f => (
                          <TableCell key={f.id}>
                            {Array.isArray(ans[f.id]) ? ans[f.id].join(', ') : String(ans[f.id] ?? '-')}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
