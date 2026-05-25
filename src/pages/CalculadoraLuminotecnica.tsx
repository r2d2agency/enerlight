import { useState, useMemo, useRef } from "react";
import { ScrollReveal } from "@/hooks/use-scroll-animation";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranding } from "@/hooks/use-branding";
import { API_URL } from "@/lib/api";
import { toast } from "sonner";
import { 
  Calculator, 
  Lightbulb, 
  ArrowRight, 
  CheckCircle2, 
  Info, 
  Layout, 
  Ruler, 
  Zap,
  Building2,
  FileText,
  Target,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Download,
  Printer,
  Sparkles,
  Home,
  Briefcase,
  Monitor,
  LightbulbIcon
} from "lucide-react";
import { cn } from "@/lib/utils";


// ABNT NBR ISO/CIE 8995-1 simplified data
const ABNT_STANDARDS = [
  { id: "office", name: "Escritório - Geral", lux: 500 },
  { id: "meeting", name: "Sala de Reuniões", lux: 500 },
  { id: "corridor", name: "Corredores/Circulação", lux: 100 },
  { id: "bathroom", name: "Sanitários", lux: 200 },
  { id: "classroom", name: "Sala de Aula", lux: 500 },
  { id: "retail", name: "Lojas e Comércio", lux: 500 },
  { id: "drawing", name: "Desenho Técnico", lux: 750 },
  { id: "warehouse", name: "Almoxarifado/Depósito", lux: 200 },
  { id: "factory", name: "Fábrica - Produção Geral", lux: 300 },
  { id: "hospital", name: "Quartos de Hospital", lux: 100 },
  { id: "surgery", name: "Sala de Cirurgia (Geral)", lux: 1000 },
];

const MAINTENANCE_FACTORS = [
  { id: "clean", name: "Limpo (0.80)", value: 0.8 },
  { id: "medium", name: "Médio (0.70)", value: 0.7 },
  { id: "dirty", name: "Sujo (0.60)", value: 0.6 },
];

const REFLECTANCES = [
  { id: "standard", name: "Padrão (Teto 70%, Parede 50%, Piso 20%)", ceiling: 0.7, wall: 0.5, floor: 0.2 },
  { id: "light", name: "Claro (Teto 80%, Parede 70%, Piso 30%)", ceiling: 0.8, wall: 0.7, floor: 0.3 },
  { id: "dark", name: "Escuro (Teto 50%, Parede 30%, Piso 10%)", ceiling: 0.5, wall: 0.3, floor: 0.1 },
];

export default function CalculadoraLuminotecnica() {
  const { branding } = useBranding();
  const [isRegistered, setIsRegistered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    whatsapp: "",
  });

  // Calculator State
  const [isWizardMode, setIsWizardMode] = useState(true);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({
    environmentId: "office",
    reflectanceId: "standard",
    maintenanceFactor: 0.8,
  });

  // Calculator State
  const [calcData, setCalcData] = useState({
    length: 5,
    width: 4,
    height: 3,
    workPlaneHeight: 0.75,
    environmentId: "office",
    maintenanceFactor: 0.8,
    fixtureLumens: 2000,
    fixtureWattage: 18,
    reflectanceId: "standard",
  });


  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.whatsapp.trim()) {
      toast.error("Por favor, preencha todos os campos");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Por favor, insira um email válido");
      return;
    }

    const phone = formData.whatsapp.replace(/\D/g, "");
    if (phone.length < 10) {
      toast.error("Por favor, insira um WhatsApp válido");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/public/pre-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          whatsapp: phone,
          source: "Calculadora Luminotécnica",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao enviar cadastro");
      }

      toast.success("Cadastro realizado! Bem-vindo à nossa calculadora.");
      setIsRegistered(true);
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar cadastro");
    } finally {
      setIsSubmitting(false);
    }
  };

  const results = useMemo(() => {
    const area = calcData.length * calcData.width;
    const h = calcData.height - calcData.workPlaneHeight;
    const k = (calcData.length * calcData.width) / (h * (calcData.length + calcData.width));
    
    const standard = ABNT_STANDARDS.find(s => s.id === calcData.environmentId);
    const requiredLux = standard ? standard.lux : 500;
    
    // Utilization factor estimation based on K (simplified)
    // In reality, this comes from tables, but we can approximate:
    // Typical range is 0.3 to 0.7
    let u = 0.3 + (k / (k + 1.5)) * 0.4;
    
    // Adjust u based on reflectance (very simplified)
    const reflectance = REFLECTANCES.find(r => r.id === calcData.reflectanceId);
    if (reflectance) {
      const avgRef = (reflectance.ceiling + reflectance.wall + reflectance.floor) / 3;
      u = u * (avgRef / 0.46); // 0.46 is avg of standard
    }

    const totalLumensNeeded = (requiredLux * area) / (u * calcData.maintenanceFactor);
    const fixtureCount = Math.ceil(totalLumensNeeded / calcData.fixtureLumens);
    const totalPower = fixtureCount * calcData.fixtureWattage;
    const powerDensity = totalPower / area;

    return {
      area: area.toFixed(2),
      k: k.toFixed(2),
      requiredLux,
      u: u.toFixed(2),
      totalLumensNeeded: Math.round(totalLumensNeeded),
      fixtureCount,
      totalPower,
      powerDensity: powerDensity.toFixed(2),
    };
  }, [calcData]);

  const handlePrint = () => {
    window.print();
  };

  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <ScrollReveal className="w-full max-w-md">
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="bg-primary/10 p-4 rounded-full">
              <Lightbulb className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight">Cálculo Luminotécnico</h1>
              <p className="text-muted-foreground mt-2">
                Simule seus projetos de acordo com as normas ABNT de forma rápida e precisa.
              </p>
            </div>
          </div>

          <Card className="border-2 border-primary/20 shadow-xl">
            <CardHeader>
              <CardTitle>Acesse a Calculadora</CardTitle>
              <CardDescription>
                Identifique-se para começar suas simulações gratuitas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input 
                    id="name" 
                    placeholder="Seu nome" 
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Profissional</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="email@exemplo.com" 
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input 
                    id="whatsapp" 
                    placeholder="(00) 00000-0000" 
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    required
                  />
                </div>
                <Button className="w-full gap-2" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  Liberar Acesso Grátis
                </Button>
              </form>
            </CardContent>
            <CardHeader className="pt-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-green-500" />
                Seus dados estão protegidos e seguem a LGPD.
              </div>
            </CardHeader>
          </Card>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50 border">
              <Building2 className="h-5 w-5 text-primary mb-2" />
              <span className="text-xs font-medium text-center">Normas ABNT</span>
            </div>
            <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50 border">
              <FileText className="h-5 w-5 text-primary mb-2" />
              <span className="text-xs font-medium text-center">Relatório Completo</span>
            </div>
          </div>
        </ScrollReveal>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-12">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Lightbulb className="h-6 w-6 text-primary" />
            </div>
            <span className="font-bold text-xl hidden sm:inline-block">Calculadora Enerlight</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              Imprimir Relatório
            </Button>
          </div>
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Inputs Column */}
          <div className="lg:col-span-1 space-y-6 print:hidden">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Layout className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Dimensões do Ambiente</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Comprimento (m)</Label>
                    <Input 
                      type="number" 
                      step="0.1"
                      value={calcData.length} 
                      onChange={(e) => setCalcData({ ...calcData, length: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Largura (m)</Label>
                    <Input 
                      type="number" 
                      step="0.1"
                      value={calcData.width} 
                      onChange={(e) => setCalcData({ ...calcData, width: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Altura Teto (m)</Label>
                    <Input 
                      type="number" 
                      step="0.1"
                      value={calcData.height} 
                      onChange={(e) => setCalcData({ ...calcData, height: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Plano Trabalho (m)</Label>
                    <Input 
                      type="number" 
                      step="0.05"
                      value={calcData.workPlaneHeight} 
                      onChange={(e) => setCalcData({ ...calcData, workPlaneHeight: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Parâmetros de Norma</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Ambiente (ABNT)</Label>
                  <Select 
                    value={calcData.environmentId} 
                    onValueChange={(v) => setCalcData({ ...calcData, environmentId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ABNT_STANDARDS.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.lux} lux)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fator de Manutenção</Label>
                  <Select 
                    value={String(calcData.maintenanceFactor)} 
                    onValueChange={(v) => setCalcData({ ...calcData, maintenanceFactor: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_FACTORS.map(f => (
                        <SelectItem key={f.id} value={String(f.value)}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Refletância</Label>
                  <Select 
                    value={calcData.reflectanceId} 
                    onValueChange={(v) => setCalcData({ ...calcData, reflectanceId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFLECTANCES.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Especificação da Luminária</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fluxo Luminoso por Luminária (lm)</Label>
                  <Input 
                    type="number" 
                    value={calcData.fixtureLumens} 
                    onChange={(e) => setCalcData({ ...calcData, fixtureLumens: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Potência por Luminária (W)</Label>
                  <Input 
                    type="number" 
                    value={calcData.fixtureWattage} 
                    onChange={(e) => setCalcData({ ...calcData, fixtureWattage: Number(e.target.value) })}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
              <Card className="bg-primary text-primary-foreground border-none shadow-lg">
                <CardHeader className="pb-2">
                  <CardDescription className="text-primary-foreground/80">Qtd. Luminárias</CardDescription>
                  <CardTitle className="text-3xl font-bold">{results.fixtureCount}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-md">
                <CardHeader className="pb-2">
                  <CardDescription>Fluxo Total (lm)</CardDescription>
                  <CardTitle className="text-2xl">{results.totalLumensNeeded.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-md">
                <CardHeader className="pb-2">
                  <CardDescription>Potência Total (W)</CardDescription>
                  <CardTitle className="text-2xl">{results.totalPower}W</CardTitle>
                </CardHeader>
              </Card>
              <Card className="shadow-md">
                <CardHeader className="pb-2">
                  <CardDescription>Meta ABNT (lux)</CardDescription>
                  <CardTitle className="text-2xl">{results.requiredLux}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card className="overflow-hidden border-2 border-primary/10">
              <CardHeader className="bg-muted/50 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>Resultados Detalhados da Simulação</CardTitle>
                  <Badge variant="outline">Baseado na ABNT NBR ISO/CIE 8995-1</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                  <div className="p-6 space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Dimensões</h4>
                      <dl className="grid grid-cols-2 gap-y-3 text-sm">
                        <dt>Área Total:</dt>
                        <dd className="font-medium text-right">{results.area} m²</dd>
                        <dt>Índice do Recinto (K):</dt>
                        <dd className="font-medium text-right">{results.k}</dd>
                        <dt>Fator de Utilização (u):</dt>
                        <dd className="font-medium text-right">{results.u}</dd>
                        <dt>Fator de Manutenção:</dt>
                        <dd className="font-medium text-right">{calcData.maintenanceFactor.toFixed(2)}</dd>
                      </dl>
                    </div>

                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Eficiência</h4>
                      <dl className="grid grid-cols-2 gap-y-3 text-sm">
                        <dt>Densidade de Potência:</dt>
                        <dd className="font-medium text-right">{results.powerDensity} W/m²</dd>
                        <dt>Eficiência do Sistema:</dt>
                        <dd className="font-medium text-right">{Math.round(calcData.fixtureLumens / calcData.fixtureWattage)} lm/W</dd>
                      </dl>
                    </div>
                  </div>

                  <div className="p-6 bg-primary/[0.02] flex flex-col justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Resumo do Projeto</h4>
                      <p className="text-sm text-muted-foreground mb-6">
                        Para o ambiente de <strong>{ABNT_STANDARDS.find(s => s.id === calcData.environmentId)?.name}</strong>, 
                        com área de {results.area} m², são recomendados no mínimo {results.fixtureCount} pontos de luz utilizando 
                        luminárias de {calcData.fixtureLumens} lumens cada.
                      </p>

                      <div className="bg-white p-4 rounded-lg border shadow-sm space-y-3 print:bg-transparent">
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-sm font-semibold">Atende Norma ABNT</span>
                        </div>
                        <p className="text-xs text-muted-foreground italic">
                          "O projeto deve garantir a iluminância mantida mínima no plano de trabalho conforme definido na NBR ISO/CIE 8995-1."
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-3 print:hidden">
                      <Button className="w-full gap-2" variant="outline" onClick={handlePrint}>
                        <FileText className="h-4 w-4" />
                        Gerar PDF do Projeto
                      </Button>
                      <Button 
                        className="w-full gap-2"
                        onClick={() => toast.success("Um especialista entrará em contato com você em breve pelo WhatsApp informado!")}
                      >
                        Solicitar Orçamento de Luminárias
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ABNT Reference Table */}
            <Card className="print:hidden">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-lg">Guia Rápido de Iluminância (ABNT)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                  {ABNT_STANDARDS.slice(0, 10).map(s => (
                    <div key={s.id} className="flex justify-between items-center py-2 border-b border-dashed last:border-0">
                      <span className="text-sm">{s.name}</span>
                      <Badge variant="secondary">{s.lux} lux</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Footer / Contact for Architects */}
            <div className="bg-primary/5 rounded-xl p-8 border border-primary/10 flex flex-col md:flex-row items-center gap-6 print:hidden">
              <div className="flex-1 space-y-2">
                <h3 className="text-xl font-bold">Você é arquiteto ou engenheiro?</h3>
                <p className="text-muted-foreground">
                  Temos condições especiais e suporte técnico dedicado para seus projetos luminotécnicos. 
                  Entre em contato com nosso departamento de projetos.
                </p>
              </div>
              <Button size="lg" className="shrink-0">
                Falar com Especialista
              </Button>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-12 py-8 border-t bg-background print:hidden">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2026 {branding.company_name || "Enerlight"} - Simulador baseado na NBR ISO/CIE 8995-1.</p>
        </div>
      </footer>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("animate-spin", className)}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
