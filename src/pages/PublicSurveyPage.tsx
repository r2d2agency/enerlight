import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { usePublicSurvey, useSurveyMutations, type SurveyField } from "@/hooks/use-surveys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Star, CheckCircle2, Loader2, ChevronRight, ChevronLeft, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ============ Shared field renderers ============ */

function NPSSelector({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {Array.from({ length: 11 }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={cn(
            "w-11 h-11 rounded-xl border-2 text-sm font-bold transition-all duration-200",
            value === i
              ? i <= 6 ? "bg-red-500 text-white border-red-500 scale-110"
              : i <= 8 ? "bg-yellow-500 text-white border-yellow-500 scale-110"
              : "bg-green-500 text-white border-green-500 scale-110"
              : "bg-background hover:bg-muted border-input hover:scale-105"
          )}
        >
          {i}
        </button>
      ))}
      <div className="w-full flex justify-between text-xs text-muted-foreground mt-2 px-1">
        <span>Nada provável</span>
        <span>Extremamente provável</span>
      </div>
    </div>
  );
}

function RatingStars({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2 justify-center">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)} className="transition-transform duration-200 hover:scale-125">
          <Star className={cn("h-10 w-10 transition-colors duration-200", i <= (value || 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

function ScaleSelector({ value, onChange, min = 1, max = 5 }: { value: number | null; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={cn(
            "w-12 h-12 rounded-full border-2 text-sm font-bold transition-all duration-200",
            value === i ? "bg-primary text-primary-foreground border-primary scale-110" : "bg-background hover:bg-muted border-input hover:scale-105"
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function FieldRenderer({ field, value, onChange }: { field: SurveyField; value: any; onChange: (v: any) => void }) {
  switch (field.field_type) {
    case 'nps': return <NPSSelector value={value ?? null} onChange={onChange} />;
    case 'rating': return <RatingStars value={value ?? null} onChange={onChange} />;
    case 'scale': return <ScaleSelector value={value ?? null} onChange={onChange} min={field.min_value || 1} max={field.max_value || 5} />;
    case 'text': return <Input value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Sua resposta" className="text-base" />;
    case 'textarea': return <Textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Sua resposta" rows={4} className="text-base" />;
    case 'select':
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt: string) => (
            <button key={opt} type="button" onClick={() => onChange(opt)}
              className={cn("w-full text-left px-5 py-3 rounded-xl border-2 transition-all duration-200 font-medium",
                value === opt ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input"
              )}>{opt}</button>
          ))}
        </div>
      );
    case 'multi_select':
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt: string) => {
            const sel = Array.isArray(value) && value.includes(opt);
            return (
              <button key={opt} type="button"
                onClick={() => {
                  const cur = Array.isArray(value) ? [...value] : [];
                  onChange(sel ? cur.filter((i: string) => i !== opt) : [...cur, opt]);
                }}
                className={cn("w-full text-left px-5 py-3 rounded-xl border-2 transition-all duration-200 font-medium",
                  sel ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input"
                )}>{opt}</button>
            );
          })}
        </div>
      );
    case 'yes_no':
      return (
        <div className="flex gap-4 justify-center">
          {['Sim', 'Não'].map(opt => (
            <button key={opt} type="button" onClick={() => onChange(opt)}
              className={cn("flex-1 max-w-[200px] px-6 py-4 rounded-xl border-2 font-bold text-lg transition-all duration-200",
                value === opt ? "bg-primary text-primary-foreground border-primary scale-105" : "bg-background hover:bg-muted border-input"
              )}>{opt}</button>
          ))}
        </div>
      );
    default: return null;
  }
}

/* ============ Logo Header ============ */
function SurveyLogo({ logoUrl, thumbnailUrl }: { logoUrl?: string; thumbnailUrl?: string }) {
  if (!logoUrl && !thumbnailUrl) return null;
  return (
    <div className="flex flex-col items-center gap-4">
      {logoUrl && (
        <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain animate-fade-in" />
      )}
      {thumbnailUrl && (
        <img src={thumbnailUrl} alt="" className="w-full max-w-lg h-48 object-cover rounded-2xl animate-fade-in" />
      )}
    </div>
  );
}

/* ============ Typeform Mode ============ */
function TypeformMode({
  survey,
  answers,
  setAnswer,
  name, setName,
  whatsapp, setWhatsapp,
  email, setEmail,
  onSubmit,
  submitting,
}: any) {
  // Steps: intro -> respondent info -> each field -> submit
  const hasRespondentStep = survey.require_name || survey.require_whatsapp || survey.require_email;
  const fields: SurveyField[] = survey.fields || [];
  const totalSteps = 1 + (hasRespondentStep ? 1 : 0) + fields.length;
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [animKey, setAnimKey] = useState(0);

  const goNext = () => {
    if (step >= totalSteps - 1) { onSubmit(); return; }
    setDirection('forward');
    setStep(s => s + 1);
    setAnimKey(k => k + 1);
  };

  const goBack = () => {
    if (step <= 0) return;
    setDirection('back');
    setStep(s => s - 1);
    setAnimKey(k => k + 1);
  };

  const formatWhatsapp = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const progress = ((step + 1) / totalSteps) * 100;

  // Map step index to content
  let currentContent: React.ReactNode = null;
  let canProceed = true;
  let isLastStep = false;

  if (step === 0) {
    // Intro
    currentContent = (
      <div className="text-center space-y-6">
        <SurveyLogo logoUrl={survey.organization_logo} thumbnailUrl={survey.thumbnail_url} />
        <h1 className="text-3xl font-bold tracking-tight">{survey.title}</h1>
        {survey.introduction && (
          <p className="text-lg text-muted-foreground max-w-md mx-auto whitespace-pre-wrap leading-relaxed">{survey.introduction}</p>
        )}
      </div>
    );
  } else if (hasRespondentStep && step === 1) {
    currentContent = (
      <div className="space-y-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-center">Seus dados</h2>
        {survey.require_name && (
          <div className="space-y-2">
            <Label className="text-base">Nome *</Label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Seu nome" className="text-base h-12" />
          </div>
        )}
        {survey.require_whatsapp && (
          <div className="space-y-2">
            <Label className="text-base">WhatsApp *</Label>
            <Input value={whatsapp} onChange={(e: any) => setWhatsapp(formatWhatsapp(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" className="text-base h-12" />
          </div>
        )}
        {survey.require_email && (
          <div className="space-y-2">
            <Label className="text-base">E-mail *</Label>
            <Input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="seu@email.com" className="text-base h-12" />
          </div>
        )}
      </div>
    );
    if (survey.require_name && !name.trim()) canProceed = false;
    if (survey.require_whatsapp && whatsapp.replace(/\D/g, '').length < 10) canProceed = false;
    if (survey.require_email && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) canProceed = false;
  } else {
    const fieldIdx = step - 1 - (hasRespondentStep ? 1 : 0);
    const field = fields[fieldIdx];
    if (field) {
      isLastStep = fieldIdx === fields.length - 1;
      const val = answers[field.id];
      if (field.required && (val === undefined || val === null || val === '')) canProceed = false;

      currentContent = (
        <div className="space-y-8 max-w-lg mx-auto">
          <div className="text-center space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pergunta {fieldIdx + 1} de {fields.length}
            </span>
            <h2 className="text-2xl font-bold leading-snug">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </h2>
            {field.description && <p className="text-muted-foreground">{field.description}</p>}
          </div>
          <FieldRenderer field={field} value={val} onChange={v => setAnswer(field.id, v)} />
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <Progress value={progress} className="h-1.5 rounded-none" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 pt-12">
        <div
          key={animKey}
          className={cn(
            "w-full max-w-2xl",
            direction === 'forward' ? "animate-fade-in" : "animate-fade-in"
          )}
          style={{
            animation: direction === 'forward'
              ? 'slideInFromRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              : 'slideInFromLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {currentContent}
        </div>
      </div>

      {/* Navigation */}
      <div className="p-6 flex items-center justify-between max-w-2xl mx-auto w-full">
        <Button variant="ghost" onClick={goBack} disabled={step === 0} className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>

        {isLastStep ? (
          <Button onClick={onSubmit} disabled={!canProceed || submitting} size="lg" className="gap-2 px-8">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enviar Resposta
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={goNext} disabled={!canProceed} size="lg" className="gap-2 px-8">
            {step === 0 ? 'Começar' : 'Próxima'}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Custom keyframes */}
      <style>{`
        @keyframes slideInFromRight {
          from { opacity: 0; transform: translateX(60px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInFromLeft {
          from { opacity: 0; transform: translateX(-60px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ============ Scroll Mode ============ */
function ScrollMode({
  survey,
  answers,
  setAnswer,
  name, setName,
  whatsapp, setWhatsapp,
  email, setEmail,
  onSubmit,
  submitting,
}: any) {
  const formatWhatsapp = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <Card className="overflow-hidden">
          <CardContent className="pt-6 space-y-4">
            <SurveyLogo logoUrl={survey.organization_logo} thumbnailUrl={survey.thumbnail_url} />
            <h1 className="text-2xl font-bold text-center">{survey.title}</h1>
            {survey.introduction && <p className="text-muted-foreground whitespace-pre-wrap text-center">{survey.introduction}</p>}
          </CardContent>
        </Card>

        {/* Respondent Info */}
        {(survey.require_name || survey.require_whatsapp || survey.require_email) && (
          <Card className="animate-fade-in">
            <CardHeader><CardTitle className="text-base">Seus dados</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {survey.require_name && (
                <div><Label>Nome *</Label><Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Seu nome" /></div>
              )}
              {survey.require_whatsapp && (
                <div><Label>WhatsApp *</Label><Input value={whatsapp} onChange={(e: any) => setWhatsapp(formatWhatsapp(e.target.value))} placeholder="(11) 99999-9999" inputMode="numeric" /></div>
              )}
              {survey.require_email && (
                <div><Label>E-mail *</Label><Input type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="seu@email.com" /></div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Fields */}
        {(survey.fields || []).map((field: SurveyField) => (
          <Card key={field.id} className="animate-fade-in">
            <CardContent className="pt-6 space-y-4">
              <Label className="text-base font-semibold">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}
              <FieldRenderer field={field} value={answers[field.id]} onChange={v => setAnswer(field.id, v)} />
            </CardContent>
          </Card>
        ))}

        <Button onClick={onSubmit} className="w-full" size="lg" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Enviar Resposta
        </Button>
      </div>
    </div>
  );
}

/* ============ Main Page ============ */
export default function PublicSurveyPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: survey, isLoading, error } = usePublicSurvey(slug || null);
  const { submitResponse } = useSurveyMutations();
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const setAnswer = useCallback((fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!survey) return;
    if (survey.require_name && !name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" }); return;
    }
    if (survey.require_whatsapp) {
      const cleaned = whatsapp.replace(/\D/g, '');
      if (cleaned.length < 10 || cleaned.length > 11) {
        toast({ title: "Número de WhatsApp inválido", variant: "destructive" }); return;
      }
    }
    if (survey.require_email && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      toast({ title: "E-mail inválido", variant: "destructive" }); return;
    }
    for (const field of (survey.fields || [])) {
      if (field.required && (answers[field.id] === undefined || answers[field.id] === null || answers[field.id] === '')) {
        toast({ title: `"${field.label}" é obrigatória`, variant: "destructive" }); return;
      }
    }
    submitResponse.mutate(
      { slug, respondent_name: name, respondent_whatsapp: whatsapp, respondent_email: email, answers },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err: any) => toast({ title: err.message || "Erro ao enviar", variant: "destructive" }),
      }
    );
  }, [survey, name, whatsapp, email, answers, slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-lg font-medium">Pesquisa não disponível</p>
            <p className="text-muted-foreground">Esta pesquisa não foi encontrada ou não está mais ativa.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-6 animate-scale-in">
          {survey.organization_logo && (
            <img src={survey.organization_logo} alt="Logo" className="h-12 w-auto mx-auto object-contain" />
          )}
          <CheckCircle2 className="h-20 w-20 mx-auto text-green-500" />
          <h2 className="text-2xl font-bold">Resposta enviada!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{survey.thank_you_message}</p>
        </div>
      </div>
    );
  }

  const sharedProps = {
    survey,
    answers,
    setAnswer,
    name, setName,
    whatsapp, setWhatsapp,
    email, setEmail,
    onSubmit: handleSubmit,
    submitting: submitResponse.isPending,
  };

  if (survey.display_mode === 'scroll') {
    return <ScrollMode {...sharedProps} />;
  }

  return <TypeformMode {...sharedProps} />;
}
