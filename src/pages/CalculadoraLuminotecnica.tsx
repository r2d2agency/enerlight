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
import enerlightLogo from "@/assets/enerlight-logo.png";

// Enerlight brand colors (from logo)
const ENERLIGHT_BLUE = "#1B3FB8";
const ENERLIGHT_NAVY = "#0B1B5C";
const ENERLIGHT_YELLOW = "#FFD400";


// ABNT NBR ISO/CIE 8995-1 simplified data
const ABNT_STANDARDS = [
  { id: "office", name: "Escritório", lux: 500 },
  { id: "meeting", name: "Sala de Reuniões", lux: 500 },
  { id: "corridor", name: "Corredores/Circulação", lux: 100 },
  { id: "bathroom", name: "Sanitários", lux: 200 },
  { id: "classroom", name: "Sala de Aula", lux: 500 },
  { id: "retail", name: "Lojas e Comércio", lux: 500 },
  { id: "drawing", name: "Desenho Técnico", lux: 750 },
  { id: "warehouse", name: "Almoxarifado/Depósito", lux: 200 },
  { id: "factory", name: "Fábrica - Produção", lux: 300 },
  { id: "hospital", name: "Quartos de Hospital", lux: 100 },
  { id: "surgery", name: "Sala de Cirurgia", lux: 1000 },
  { id: "kitchen", name: "Cozinha/Refeitório", lux: 300 },
  { id: "living", name: "Área de Estar/Lounge", lux: 150 },
  { id: "parking", name: "Estacionamentos", lux: 75 },
];

const BRAZILIAN_STATES = [
  { value: "AC", label: "Acre" },
  { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" },
  { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" },
  { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" },
  { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" },
  { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" },
  { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" },
  { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" },
  { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" },
  { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" },
  { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" },
  { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" },
  { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" },
  { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
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
    company: "",
    city: "",
    state: "",
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


      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 print:p-0">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 print:hidden">
          <div>
            <h2 className="text-2xl font-bold">Simulação Luminotécnica</h2>
            <p className="text-muted-foreground">Cálculos baseados na norma ABNT NBR ISO/CIE 8995-1</p>
          </div>
          <div className="flex bg-muted p-1 rounded-lg">
            <Button 
              variant={isWizardMode ? "default" : "ghost"} 
              size="sm" 
              onClick={() => setIsWizardMode(true)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Modo Guiado (Rápido)
            </Button>
            <Button 
              variant={!isWizardMode ? "default" : "ghost"} 
              size="sm" 
              onClick={() => setIsWizardMode(false)}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              Modo Técnico (Avançado)
            </Button>
          </div>
        </div>

        {isWizardMode ? (
          <Card className="mb-8 border-primary/20 shadow-md print:hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Passo {wizardStep} de 4</CardTitle>
                  <CardDescription>Responda algumas perguntas para um cálculo rápido</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className={cn("h-2 w-12 rounded-full", wizardStep >= 1 ? "bg-primary" : "bg-muted")} />
                  <div className={cn("h-2 w-12 rounded-full", wizardStep >= 2 ? "bg-primary" : "bg-muted")} />
                  <div className={cn("h-2 w-12 rounded-full", wizardStep >= 3 ? "bg-primary" : "bg-muted")} />
                  <div className={cn("h-2 w-12 rounded-full", wizardStep >= 4 ? "bg-primary" : "bg-muted")} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {wizardStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium">Qual o tipo de ambiente?</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { id: "office", name: "Escritório", icon: Briefcase },
                      { id: "retail", name: "Loja/Comércio", icon: Building2 },
                      { id: "warehouse", name: "Galpão/Depósito", icon: Home },
                      { id: "factory", name: "Fábrica", icon: Zap },
                      { id: "classroom", name: "Escola/Sala", icon: Monitor },
                      { id: "hospital", name: "Saúde/Hospital", icon: ShieldCheck },
                      { id: "corridor", name: "Corredor/Circulação", icon: Ruler },
                      { id: "meeting", name: "Sala Reunião", icon: Layout },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setCalcData({ ...calcData, environmentId: item.id });
                          setWizardStep(2);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all hover:border-primary/50",
                          calcData.environmentId === item.id ? "border-primary bg-primary/5 shadow-sm" : "border-muted"
                        )}
                      >
                        <item.icon className="h-8 w-8 text-primary" />
                        <span className="text-sm font-medium text-center">{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <h3 className="text-lg font-medium">Quais as dimensões do local?</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Comprimento (metros)</Label>
                      <Input 
                        type="number" 
                        value={calcData.length} 
                        onChange={(e) => setCalcData({ ...calcData, length: Number(e.target.value) })}
                        placeholder="Ex: 5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Largura (metros)</Label>
                      <Input 
                        type="number" 
                        value={calcData.width} 
                        onChange={(e) => setCalcData({ ...calcData, width: Number(e.target.value) })}
                        placeholder="Ex: 4"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Altura do Teto (Pé-direito)</Label>
                      <Input 
                        type="number" 
                        value={calcData.height} 
                        onChange={(e) => setCalcData({ ...calcData, height: Number(e.target.value) })}
                        placeholder="Ex: 3"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Altura da mesa/trabalho (m)</Label>
                      <Input 
                        type="number" 
                        value={calcData.workPlaneHeight} 
                        onChange={(e) => setCalcData({ ...calcData, workPlaneHeight: Number(e.target.value) })}
                        placeholder="Padrão: 0.75"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setWizardStep(1)} className="gap-2">
                      <ChevronLeft className="h-4 w-4" /> Voltar
                    </Button>
                    <Button onClick={() => setWizardStep(3)} className="gap-2">
                      Próximo Passo <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-6 max-w-2xl mx-auto">
                  <h3 className="text-lg font-medium">Como é o ambiente fisicamente?</h3>
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label>Cores predominantes (Teto e Paredes)</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {REFLECTANCES.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setCalcData({ ...calcData, reflectanceId: r.id })}
                            className={cn(
                              "p-3 rounded-lg border text-sm transition-all",
                              calcData.reflectanceId === r.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"
                            )}
                          >
                            {r.name.split(' (')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label>Nível de limpeza/poeira</Label>
                      <div className="grid grid-cols-3 gap-3">
                        {MAINTENANCE_FACTORS.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setCalcData({ ...calcData, maintenanceFactor: f.value })}
                            className={cn(
                              "p-3 rounded-lg border text-sm transition-all",
                              calcData.maintenanceFactor === f.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card"
                            )}
                          >
                            {f.name.split(' (')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setWizardStep(2)} className="gap-2">
                      <ChevronLeft className="h-4 w-4" /> Voltar
                    </Button>
                    <Button onClick={() => setWizardStep(4)} className="gap-2">
                      Finalizar <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-6 text-center py-4">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold">Cálculo Concluído com Sucesso!</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Seu relatório comercial Enerlight está pronto. Você pode visualizar os detalhes técnicos abaixo ou imprimir agora.
                  </p>
                  <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
                    <Button variant="outline" onClick={() => setWizardStep(1)} className="gap-2">
                      <Layout className="h-4 w-4" />
                      Novo Cálculo
                    </Button>
                    <Button onClick={handlePrint} className="gap-2">
                      <Printer className="h-4 w-4" />
                      Imprimir Relatório Enerlight
                    </Button>
                    <Button variant="secondary" onClick={() => {
                      setIsWizardMode(false);
                      setWizardStep(1);
                    }}>
                      Ajustes Técnicos
                    </Button>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>
        ) : null}

        <div className={cn("grid grid-cols-1 lg:grid-cols-3 gap-8", isWizardMode && wizardStep < 4 ? "opacity-30 pointer-events-none" : "")}>

          
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
                      <Button className="w-full gap-2 py-6 text-lg" onClick={handlePrint}>
                        <Printer className="h-5 w-5" />
                        Imprimir Relatório Comercial
                      </Button>
                      <p className="text-center text-xs text-muted-foreground mt-2">
                        Relatório completo com especificações técnicas e normas ABNT.
                      </p>
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

          </div>
        </div>
      </main>

      {/* Printable Report Section - Enerlight Branded */}
      <div className="hidden print:block p-8 bg-white text-black min-h-screen">
        <style>{`
          @media print {
            @page { margin: 12mm; size: A4; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>

        <div
          className="flex justify-between items-center pb-6 mb-8"
          style={{ borderBottom: `4px solid ${ENERLIGHT_BLUE}` }}
        >
          <img src={enerlightLogo} alt="Enerlight" className="h-16 w-auto" />
          <div className="text-right text-sm" style={{ color: ENERLIGHT_NAVY }}>
            <p className="font-black text-base uppercase tracking-widest" style={{ color: ENERLIGHT_BLUE }}>
              Relatório Luminotécnico
            </p>
            <p>Data: {new Date().toLocaleDateString('pt-BR')}</p>
            <p className="text-xs text-gray-500 mt-1">Norma: ABNT NBR ISO/CIE 8995-1</p>
          </div>
        </div>

        <div
          className="inline-block px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6"
          style={{ background: ENERLIGHT_YELLOW, color: ENERLIGHT_NAVY }}
        >
          Soluções em Iluminação Profissional
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="space-y-4">
            <h2 className="text-xl font-bold pb-2" style={{ color: ENERLIGHT_NAVY, borderBottom: `2px solid ${ENERLIGHT_YELLOW}` }}>
              Dados do Ambiente
            </h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-600">Tipo:</dt>
              <dd className="font-bold" style={{ color: ENERLIGHT_NAVY }}>{ABNT_STANDARDS.find(s => s.id === calcData.environmentId)?.name}</dd>
              <dt className="text-gray-600">Dimensões:</dt>
              <dd>{calcData.length}m x {calcData.width}m</dd>
              <dt className="text-gray-600">Área Total:</dt>
              <dd>{results.area} m²</dd>
              <dt className="text-gray-600">Pé Direito:</dt>
              <dd>{calcData.height}m</dd>
            </dl>
          </div>
          <div className="space-y-4">
            <h2 className="text-xl font-bold pb-2" style={{ color: ENERLIGHT_NAVY, borderBottom: `2px solid ${ENERLIGHT_YELLOW}` }}>
              Especificação Técnica
            </h2>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-gray-600">Luminária:</dt>
              <dd>LED Profissional Enerlight</dd>
              <dt className="text-gray-600">Fluxo Unitário:</dt>
              <dd>{calcData.fixtureLumens} lm</dd>
              <dt className="text-gray-600">Potência Unitária:</dt>
              <dd>{calcData.fixtureWattage} W</dd>
              <dt className="text-gray-600">Eficiência:</dt>
              <dd>{Math.round(calcData.fixtureLumens / calcData.fixtureWattage)} lm/W</dd>
            </dl>
          </div>
        </div>

        <div
          className="p-8 rounded-2xl mb-10"
          style={{ background: `linear-gradient(135deg, ${ENERLIGHT_NAVY} 0%, ${ENERLIGHT_BLUE} 100%)`, color: "white" }}
        >
          <h2 className="text-2xl font-bold mb-6 text-center text-white">Resultado da Simulação</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-white rounded-xl shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Quantidade de Pontos</p>
              <p className="text-4xl font-black" style={{ color: ENERLIGHT_BLUE }}>{results.fixtureCount}</p>
            </div>
            <div className="p-4 bg-white rounded-xl shadow-sm">
              <p className="text-xs text-gray-500 uppercase mb-1">Iluminância (Lux)</p>
              <p className="text-4xl font-black" style={{ color: ENERLIGHT_BLUE }}>{results.requiredLux}</p>
            </div>
            <div className="p-4 rounded-xl shadow-sm" style={{ background: ENERLIGHT_YELLOW }}>
              <p className="text-xs uppercase mb-1" style={{ color: ENERLIGHT_NAVY }}>Potência Total</p>
              <p className="text-4xl font-black" style={{ color: ENERLIGHT_NAVY }}>{results.totalPower}W</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-bold pb-2" style={{ color: ENERLIGHT_NAVY, borderBottom: `2px solid ${ENERLIGHT_YELLOW}` }}>
            Entendendo os Resultados
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-2">
              <p className="font-bold" style={{ color: ENERLIGHT_BLUE }}>O que é LUX?</p>
              <p className="text-gray-700">
                É a unidade de medida da iluminância, ou seja, a quantidade de luz que chega em uma superfície (plano de trabalho).
                A norma ABNT define o mínimo necessário para cada tipo de atividade para garantir saúde e produtividade.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-bold" style={{ color: ENERLIGHT_BLUE }}>O que é Lúmen (lm)?</p>
              <p className="text-gray-700">
                É a quantidade total de luz emitida por uma fonte. Quanto maior o lúmen, mais luz a luminária emite.
                Não confunda com Watt (potência), que é apenas o consumo de energia.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-bold" style={{ color: ENERLIGHT_BLUE }}>Fator de Manutenção</p>
              <p className="text-gray-700">
                Consideramos que ao longo do tempo as luminárias perdem eficiência e acumulam poeira.
                Nosso cálculo já prevê essa perda para garantir que o ambiente continue iluminado no futuro.
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-bold" style={{ color: ENERLIGHT_BLUE }}>Densidade de Potência ({results.powerDensity} W/m²)</p>
              <p className="text-gray-700">
                Indica o consumo de energia por metro quadrado. Sistemas modernos com LED da Enerlight
                buscam a maior iluminação com o menor consumo possível.
              </p>
            </div>
          </div>
        </div>

        <div
          className="mt-16 pt-6 text-center text-xs"
          style={{ borderTop: `2px solid ${ENERLIGHT_BLUE}`, color: ENERLIGHT_NAVY }}
        >
          <img src={enerlightLogo} alt="Enerlight" className="h-8 w-auto mx-auto mb-3 opacity-90" />
          <p className="font-semibold">Este relatório é uma simulação preliminar baseada no método dos lúmens.</p>
          <p className="text-gray-500">Para projetos executivos e validação oficial, consulte um especialista Enerlight.</p>
        </div>
      </div>

      <footer className="mt-12 py-8 border-t bg-background print:hidden">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {branding.company_name || "Enerlight"} - Excelência em Iluminação Profissional.</p>
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
