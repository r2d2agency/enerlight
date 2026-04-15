import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { usePublicSurvey, useSurveyMutations, type SurveyField } from "@/hooks/use-surveys";
import { useBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

function NPSSelector({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 11 }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
            value === i
              ? i <= 6 ? "bg-red-500 text-white border-red-500"
              : i <= 8 ? "bg-yellow-500 text-white border-yellow-500"
              : "bg-green-500 text-white border-green-500"
              : "bg-background hover:bg-muted border-input"
          }`}
        >
          {i}
        </button>
      ))}
      <div className="w-full flex justify-between text-xs text-muted-foreground mt-1">
        <span>Nada provável</span>
        <span>Extremamente provável</span>
      </div>
    </div>
  );
}

function RatingStars({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange(i)}>
          <Star className={`h-8 w-8 transition-colors ${i <= (value || 0) ? "fill-warning text-warning" : "fill-transparent text-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

function ScaleSelector({ value, onChange, min = 1, max = 5 }: { value: number | null; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: max - min + 1 }, (_, i) => i + min).map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={`w-10 h-10 rounded-full border text-sm font-medium transition-colors ${
            value === i ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted border-input"
          }`}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

export default function PublicSurveyPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: survey, isLoading, error } = usePublicSurvey(slug || null);
  const { submitResponse } = useSurveyMutations();
  const { branding } = useBranding();
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const brandLogo = branding.logo_login || branding.logo_topbar;

  useEffect(() => {
    if (!survey) return;

    const previousTitle = document.title;
    const description = survey.description || survey.introduction || survey.title;
    const image = survey.thumbnail_url || brandLogo || undefined;
    const metaConfigs = [
      { key: "description", attribute: "name", value: description },
      { key: "og:title", attribute: "property", value: survey.title },
      { key: "og:description", attribute: "property", value: description },
      { key: "twitter:title", attribute: "name", value: survey.title },
      { key: "twitter:description", attribute: "name", value: description },
      ...(image
        ? [
            { key: "og:image", attribute: "property", value: image },
            { key: "twitter:image", attribute: "name", value: image },
          ]
        : []),
    ];

    const updatedMeta = metaConfigs.map(({ key, attribute, value }) => {
      let element = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
      const existed = Boolean(element);
      const previousContent = element?.getAttribute("content") ?? null;

      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }

      element.setAttribute("content", value);

      return { element, existed, previousContent };
    });

    document.title = survey.title;

    return () => {
      document.title = previousTitle;
      updatedMeta.forEach(({ element, existed, previousContent }) => {
        if (!existed) {
          element.remove();
          return;
        }

        if (previousContent === null) {
          element.removeAttribute("content");
          return;
        }

        element.setAttribute("content", previousContent);
      });
    };
  }, [brandLogo, survey]);

  const setAnswer = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  };

  const formatWhatsapp = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSubmit = () => {
    if (survey?.require_name && !name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (survey?.require_whatsapp) {
      const cleaned = whatsapp.replace(/\D/g, '');
      if (cleaned.length < 10 || cleaned.length > 11) {
        toast({ title: "Número de WhatsApp inválido", variant: "destructive" });
        return;
      }
    }
    if (survey?.require_email && (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return;
    }

    // Check required fields
    for (const field of (survey?.fields || [])) {
      if (field.required && (answers[field.id] === undefined || answers[field.id] === null || answers[field.id] === '')) {
        toast({ title: `"${field.label}" é obrigatória`, variant: "destructive" });
        return;
      }
    }

    submitResponse.mutate(
      { slug, respondent_name: name, respondent_whatsapp: whatsapp, respondent_email: email, answers },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err: any) => toast({ title: err.message || "Erro ao enviar", variant: "destructive" }),
      }
    );
  };

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
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Pesquisa não encontrada ou não está mais ativa.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
            <h2 className="text-xl font-bold">Resposta enviada!</h2>
            <p className="text-muted-foreground">{survey.thank_you_message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {brandLogo && (
          <div className="flex justify-center px-4">
            <img
              src={brandLogo}
              alt={`Logo ${branding.company_name || "Enerlight"}`}
              className="h-16 max-w-[220px] object-contain"
              loading="eager"
            />
          </div>
        )}

        {/* Header */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {survey.thumbnail_url && (
              <img src={survey.thumbnail_url} alt={`Imagem da pesquisa ${survey.title}`} className="w-full h-48 object-cover rounded-lg" />
            )}
            <h1 className="text-2xl font-bold">{survey.title}</h1>
            {survey.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{survey.description}</p>}
            {survey.introduction && <p className="text-muted-foreground whitespace-pre-wrap">{survey.introduction}</p>}
          </CardContent>
        </Card>

        {/* Respondent Info */}
        {(survey.require_name || survey.require_whatsapp || survey.require_email) && (
          <Card>
            <CardHeader><CardTitle className="text-base">Seus dados</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {survey.require_name && (
                <div>
                  <Label htmlFor="respondent-name">Nome *</Label>
                  <Input
                    id="respondent-name"
                    name="respondent_name"
                    autoComplete="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>
              )}
              {survey.require_whatsapp && (
                <div>
                  <Label htmlFor="respondent-whatsapp">WhatsApp *</Label>
                  <Input
                    id="respondent-whatsapp"
                    name="respondent_whatsapp"
                    type="tel"
                    autoComplete="tel"
                    value={whatsapp}
                    onChange={e => setWhatsapp(formatWhatsapp(e.target.value))}
                    placeholder="(11) 99999-9999"
                    inputMode="numeric"
                  />
                </div>
              )}
              {survey.require_email && (
                <div>
                  <Label htmlFor="respondent-email">E-mail *</Label>
                  <Input
                    id="respondent-email"
                    name="respondent_email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Fields */}
        {(survey.fields || []).map((field, idx) => (
          <Card key={field.id}>
            <CardContent className="pt-6 space-y-3">
              <Label className="text-base">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {field.description && <p className="text-sm text-muted-foreground">{field.description}</p>}

              {field.field_type === 'nps' && (
                <NPSSelector value={answers[field.id] ?? null} onChange={v => setAnswer(field.id, v)} />
              )}
              {field.field_type === 'rating' && (
                <RatingStars value={answers[field.id] ?? null} onChange={v => setAnswer(field.id, v)} />
              )}
              {field.field_type === 'scale' && (
                <ScaleSelector value={answers[field.id] ?? null} onChange={v => setAnswer(field.id, v)} min={field.min_value || 1} max={field.max_value || 5} />
              )}
              {field.field_type === 'text' && (
                <Input value={answers[field.id] || ''} onChange={e => setAnswer(field.id, e.target.value)} placeholder="Sua resposta" />
              )}
              {field.field_type === 'textarea' && (
                <Textarea value={answers[field.id] || ''} onChange={e => setAnswer(field.id, e.target.value)} placeholder="Sua resposta" rows={4} />
              )}
              {field.field_type === 'select' && (
                <div className="space-y-2">
                  {(field.options || []).map((opt: string) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswer(field.id, opt)}
                      className={`w-full text-left px-4 py-2 rounded-lg border transition-colors ${
                        answers[field.id] === opt ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              {field.field_type === 'multi_select' && (
                <div className="space-y-2">
                  {(field.options || []).map((opt: string) => {
                    const selected = Array.isArray(answers[field.id]) && answers[field.id].includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          const current = Array.isArray(answers[field.id]) ? [...answers[field.id]] : [];
                          if (selected) setAnswer(field.id, current.filter((i: string) => i !== opt));
                          else setAnswer(field.id, [...current, opt]);
                        }}
                        className={`w-full text-left px-4 py-2 rounded-lg border transition-colors ${
                          selected ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
              {field.field_type === 'yes_no' && (
                <div className="flex gap-3">
                  {['Sim', 'Não'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAnswer(field.id, opt)}
                      className={`flex-1 px-4 py-3 rounded-lg border font-medium transition-colors ${
                        answers[field.id] === opt ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* Submit */}
        <Button onClick={handleSubmit} className="w-full" size="lg" disabled={submitResponse.isPending}>
          {submitResponse.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Enviar Resposta
        </Button>
      </div>
    </div>
  );
}
