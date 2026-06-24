import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { eadApi } from '@/lib/ead-api';
import { EadLayout } from './EadLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Award, RotateCcw, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function EadQuiz() {
  const { id, slug } = useParams<{ id: string; slug?: string }>();
  const nav = useNavigate();
  const brandBase = slug ? `/marca/${slug}` : '/ead';
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    eadApi.quiz(id).then(d => setQuestions(d.questions)).catch(e => {
      toast.error(e.message);
      nav(`${brandBase}/curso/${id}`);
    }).finally(() => setLoading(false));
  }, [id, nav, brandBase]);

  async function submit() {
    if (Object.keys(answers).length < questions.length) {
      toast.error('Responda todas as perguntas');
      return;
    }
    setSubmitting(true);
    try {
      const r = await eadApi.attempt(id!, answers);
      setResult(r);
      if (r.passed) toast.success('🎉 100% de acertos! Certificado emitido.');
      else toast.warning(`Você acertou ${r.correct}/${r.total}. Tente novamente!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSubmitting(false); }
  }

  function reset() {
    setAnswers({}); setResult(null);
  }

  if (loading) return <EadLayout><div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div></EadLayout>;

  if (result?.passed) {
    return (
      <EadLayout breadcrumbs={[{ label: 'Cursos', to: `${brandBase}/cursos` }, { label: 'Curso', to: `${brandBase}/curso/${id}` }, { label: 'Prova' }]}>
        <Card className="max-w-lg mx-auto text-center">
          <CardContent className="p-8 space-y-4">
            <Award className="h-16 w-16 text-yellow-500 mx-auto" />
            <h2 className="text-2xl font-bold">Aprovado!</h2>
            <p className="text-muted-foreground">Você acertou 100% e ganhou seu certificado.</p>
            {result.certificate && (
              <a href={result.certificate.pdf_url} target="_blank" rel="noreferrer">
                <Button size="lg"><Download className="h-4 w-4 mr-2" />Baixar Certificado</Button>
              </a>
            )}
            <div><Link to={`${brandBase}/cursos`} className="text-sm text-muted-foreground hover:underline">Voltar ao catálogo</Link></div>
          </CardContent>
        </Card>
      </EadLayout>
    );
  }

  return (
    <EadLayout breadcrumbs={[{ label: 'Cursos', to: `${brandBase}/cursos` }, { label: 'Curso', to: `${brandBase}/curso/${id}` }, { label: 'Prova' }]}>
      <h1 className="text-2xl font-bold mb-1">Prova</h1>
      <p className="text-muted-foreground mb-6">Você precisa acertar 100% para ser aprovado. Pode tentar quantas vezes precisar.</p>

      {result && !result.passed && (
        <Card className="mb-4 border-orange-300 bg-orange-50">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-orange-900">Você acertou <strong>{result.correct} de {result.total}</strong>. Revise as respostas e tente novamente.</p>
            <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-1" />Refazer</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {questions.map((q, idx) => {
          const review = result?.review?.find((r: any) => r.question_id === q.id);
          return (
            <Card key={q.id}>
              <CardHeader><CardTitle className="text-base">{idx + 1}. {q.question}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {q.options.map((o: any) => {
                  const picked = answers[q.id] === o.id;
                  const isCorrect = review && o.id === review.correct_option;
                  const isWrong = review && picked && !review.ok;
                  return (
                    <label key={o.id} className={`flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50 ${picked ? 'border-primary bg-primary/5' : ''} ${isCorrect ? 'border-green-500 bg-green-50' : ''} ${isWrong ? 'border-red-500 bg-red-50' : ''}`}>
                      <input type="radio" name={q.id} disabled={!!result} checked={picked} onChange={() => setAnswers(a => ({ ...a, [q.id]: o.id }))} />
                      <span className="text-sm">{o.text}</span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!result && (
        <div className="mt-6 flex justify-end">
          <Button onClick={submit} disabled={submitting} size="lg">
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Enviar respostas
          </Button>
        </div>
      )}
    </EadLayout>
  );
}
