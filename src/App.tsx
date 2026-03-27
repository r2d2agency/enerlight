import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useBranding } from "@/hooks/use-branding";
import ProtectedRoute from "@/components/ProtectedRoute";
import { UpdateNotification } from "@/components/layout/UpdateNotification";
import { Loader2 } from "lucide-react";

// Auto-reload helper for stale chunks after deploy
const lazyRetry = (importFn: () => Promise<any>) =>
  lazy(() =>
    importFn().catch(() => {
      // If chunk fails to load (404 after new deploy), reload once
      const reloaded = sessionStorage.getItem('chunk-reload');
      if (!reloaded) {
        sessionStorage.setItem('chunk-reload', '1');
        window.location.reload();
      }
      sessionStorage.removeItem('chunk-reload');
      return importFn();
    })
  );

// Lazy load all pages for code splitting
const LandingPage = lazyRetry(() => import("./pages/LandingPage"));
const Index = lazyRetry(() => import("./pages/Index"));
const Login = lazyRetry(() => import("./pages/Login"));
const Cadastro = lazyRetry(() => import("./pages/Cadastro"));
const Conexao = lazyRetry(() => import("./pages/Conexao"));
const MetaTemplates = lazyRetry(() => import("./pages/MetaTemplates"));
const Contatos = lazyRetry(() => import("./pages/Contatos"));
const Mensagens = lazyRetry(() => import("./pages/Mensagens"));
const Campanhas = lazyRetry(() => import("./pages/Campanhas"));
const Chat = lazyRetry(() => import("./pages/Chat"));
const Cobranca = lazyRetry(() => import("./pages/Cobranca"));
const Organizacoes = lazyRetry(() => import("./pages/Organizacoes"));
const Admin = lazyRetry(() => import("./pages/Admin"));
const Configuracoes = lazyRetry(() => import("./pages/Configuracoes"));
const Agendamentos = lazyRetry(() => import("./pages/Agendamentos"));
const Tags = lazyRetry(() => import("./pages/Tags"));
const ContatosChat = lazyRetry(() => import("./pages/ContatosChat"));
const Chatbots = lazyRetry(() => import("./pages/Chatbots"));
const Fluxos = lazyRetry(() => import("./pages/Fluxos"));
const Departamentos = lazyRetry(() => import("./pages/Departamentos"));
const AgentesIA = lazyRetry(() => import("./pages/AgentesIA"));
const CRMNegociacoes = lazyRetry(() => import("./pages/CRMNegociacoes"));
const CRMProspects = lazyRetry(() => import("./pages/CRMProspects"));
const CRMEmpresas = lazyRetry(() => import("./pages/CRMEmpresas"));
const CRMTarefas = lazyRetry(() => import("./pages/CRMTarefas"));
const CRMAgenda = lazyRetry(() => import("./pages/CRMAgenda"));
const CRMConfiguracoes = lazyRetry(() => import("./pages/CRMConfiguracoes"));
const CRMRelatorios = lazyRetry(() => import("./pages/CRMRelatorios"));
const Mapa = lazyRetry(() => import("./pages/Mapa"));
const PoliticaPrivacidade = lazyRetry(() => import("./pages/PoliticaPrivacidade"));
const FluxosExternos = lazyRetry(() => import("./pages/FluxosExternos"));
const PublicFormPage = lazyRetry(() => import("./pages/PublicFormPage"));
const LeadWebhooks = lazyRetry(() => import("./pages/LeadWebhooks"));
const SequenciasNurturing = lazyRetry(() => import("./pages/SequenciasNurturing"));
const CTWAAnalytics = lazyRetry(() => import("./pages/CTWAAnalytics"));
const RevenueIntelligence = lazyRetry(() => import("./pages/RevenueIntelligence"));
const SecretariaGrupos = lazyRetry(() => import("./pages/SecretariaGrupos"));
const ModuloFantasma = lazyRetry(() => import("./pages/ModuloFantasma"));
const Projetos = lazyRetry(() => import("./pages/Projetos"));
const CRMRepresentantes = lazyRetry(() => import("./pages/CRMRepresentantes"));
const CRMMetas = lazyRetry(() => import("./pages/CRMMetas"));
const Reunioes = lazyRetry(() => import("./pages/Reunioes"));
const ComunicacaoInterna = lazyRetry(() => import("./pages/ComunicacaoInterna"));
const Homologacao = lazyRetry(() => import("./pages/Homologacao"));
const LicitacoesPage = lazyRetry(() => import("./pages/Licitacoes"));
const TarefasKanban = lazyRetry(() => import("./pages/TarefasKanban"));
const LeadGleego = lazyRetry(() => import("./pages/LeadGleego"));
const VisitasExternas = lazyRetry(() => import("./pages/VisitasExternas"));
const Captador = lazyRetry(() => import("./pages/Captador"));
const AssinaturasDoc = lazyRetry(() => import("./pages/AssinaturasDoc"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Component to handle favicon update
function FaviconUpdater() {
  const { branding } = useBranding();

  useEffect(() => {
    if (branding.favicon) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link) {
        link.href = branding.favicon;
      } else {
        const newLink = document.createElement('link');
        newLink.rel = 'icon';
        newLink.href = branding.favicon;
        document.head.appendChild(newLink);
      }
    }
  }, [branding.favicon]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <FaviconUpdater />
      <UpdateNotification />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Cadastro />} />
              <Route path="/" element={<Login />} />
              <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/conexao" element={<ProtectedRoute><Conexao /></ProtectedRoute>} />
              <Route path="/meta-templates" element={<ProtectedRoute><MetaTemplates /></ProtectedRoute>} />
              <Route path="/contatos" element={<ProtectedRoute><Contatos /></ProtectedRoute>} />
              <Route path="/mensagens" element={<ProtectedRoute><Mensagens /></ProtectedRoute>} />
              <Route path="/campanhas" element={<ProtectedRoute><Campanhas /></ProtectedRoute>} />
              <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/agendamentos" element={<ProtectedRoute><Agendamentos /></ProtectedRoute>} />
              <Route path="/tags" element={<ProtectedRoute><Tags /></ProtectedRoute>} />
              <Route path="/contatos-chat" element={<ProtectedRoute><ContatosChat /></ProtectedRoute>} />
              <Route path="/cobranca" element={<ProtectedRoute><Cobranca /></ProtectedRoute>} />
              <Route path="/organizacoes" element={<ProtectedRoute><Organizacoes /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
              <Route path="/chatbots" element={<ProtectedRoute><Chatbots /></ProtectedRoute>} />
              <Route path="/fluxos" element={<ProtectedRoute><Fluxos /></ProtectedRoute>} />
              <Route path="/departamentos" element={<ProtectedRoute><Departamentos /></ProtectedRoute>} />
              <Route path="/agentes-ia" element={<ProtectedRoute><AgentesIA /></ProtectedRoute>} />
              <Route path="/crm/negociacoes" element={<ProtectedRoute><CRMNegociacoes /></ProtectedRoute>} />
              <Route path="/crm/prospects" element={<ProtectedRoute><CRMProspects /></ProtectedRoute>} />
              <Route path="/crm/empresas" element={<ProtectedRoute><CRMEmpresas /></ProtectedRoute>} />
              <Route path="/crm/tarefas" element={<ProtectedRoute><CRMTarefas /></ProtectedRoute>} />
              <Route path="/crm/agenda" element={<ProtectedRoute><CRMAgenda /></ProtectedRoute>} />
              <Route path="/crm/configuracoes" element={<ProtectedRoute><CRMConfiguracoes /></ProtectedRoute>} />
              <Route path="/crm/relatorios" element={<ProtectedRoute><CRMRelatorios /></ProtectedRoute>} />
              <Route path="/crm/representantes" element={<ProtectedRoute><CRMRepresentantes /></ProtectedRoute>} />
              <Route path="/crm/metas" element={<ProtectedRoute><CRMMetas /></ProtectedRoute>} />
              <Route path="/mapa" element={<ProtectedRoute><Mapa /></ProtectedRoute>} />
              <Route path="/fluxos-externos" element={<ProtectedRoute><FluxosExternos /></ProtectedRoute>} />
              <Route path="/lead-webhooks" element={<ProtectedRoute><LeadWebhooks /></ProtectedRoute>} />
              <Route path="/sequencias" element={<ProtectedRoute><SequenciasNurturing /></ProtectedRoute>} />
              <Route path="/ctwa-analytics" element={<ProtectedRoute><CTWAAnalytics /></ProtectedRoute>} />
              <Route path="/revenue-intelligence" element={<ProtectedRoute><RevenueIntelligence /></ProtectedRoute>} />
              <Route path="/secretaria-grupos" element={<ProtectedRoute><SecretariaGrupos /></ProtectedRoute>} />
              <Route path="/modulo-fantasma" element={<ProtectedRoute><ModuloFantasma /></ProtectedRoute>} />
              <Route path="/projetos" element={<ProtectedRoute><Projetos /></ProtectedRoute>} />
              <Route path="/reunioes" element={<ProtectedRoute><Reunioes /></ProtectedRoute>} />
              <Route path="/comunicacao" element={<ProtectedRoute><ComunicacaoInterna /></ProtectedRoute>} />
              <Route path="/homologacao" element={<ProtectedRoute><Homologacao /></ProtectedRoute>} />
              <Route path="/licitacoes" element={<ProtectedRoute><LicitacoesPage /></ProtectedRoute>} />
              <Route path="/tarefas" element={<ProtectedRoute><TarefasKanban /></ProtectedRoute>} />
              <Route path="/lead-gleego" element={<ProtectedRoute><LeadGleego /></ProtectedRoute>} />
              <Route path="/crm/visitas-externas" element={<ProtectedRoute><VisitasExternas /></ProtectedRoute>} />
              <Route path="/captador" element={<ProtectedRoute><Captador /></ProtectedRoute>} />
              <Route path="/assinaturas" element={<ProtectedRoute><AssinaturasDoc /></ProtectedRoute>} />
              <Route path="/assinar/:token" element={<AssinaturasDoc />} />
              <Route path="/f/:slug" element={<PublicFormPage />} />
              <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
