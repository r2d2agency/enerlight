import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { useBranding } from "@/hooks/use-branding";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Lazy load all pages for code splitting
const LandingPage = lazy(() => import("./pages/LandingPage"));
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Cadastro = lazy(() => import("./pages/Cadastro"));
const Conexao = lazy(() => import("./pages/Conexao"));
const Contatos = lazy(() => import("./pages/Contatos"));
const Mensagens = lazy(() => import("./pages/Mensagens"));
const Campanhas = lazy(() => import("./pages/Campanhas"));
const Chat = lazy(() => import("./pages/Chat"));
const Cobranca = lazy(() => import("./pages/Cobranca"));
const Organizacoes = lazy(() => import("./pages/Organizacoes"));
const Admin = lazy(() => import("./pages/Admin"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Agendamentos = lazy(() => import("./pages/Agendamentos"));
const Tags = lazy(() => import("./pages/Tags"));
const ContatosChat = lazy(() => import("./pages/ContatosChat"));
const Chatbots = lazy(() => import("./pages/Chatbots"));
const Fluxos = lazy(() => import("./pages/Fluxos"));
const Departamentos = lazy(() => import("./pages/Departamentos"));
const AgentesIA = lazy(() => import("./pages/AgentesIA"));
const CRMNegociacoes = lazy(() => import("./pages/CRMNegociacoes"));
const CRMProspects = lazy(() => import("./pages/CRMProspects"));
const CRMEmpresas = lazy(() => import("./pages/CRMEmpresas"));
const CRMTarefas = lazy(() => import("./pages/CRMTarefas"));
const CRMAgenda = lazy(() => import("./pages/CRMAgenda"));
const CRMConfiguracoes = lazy(() => import("./pages/CRMConfiguracoes"));
const CRMRelatorios = lazy(() => import("./pages/CRMRelatorios"));
const Mapa = lazy(() => import("./pages/Mapa"));
const PoliticaPrivacidade = lazy(() => import("./pages/PoliticaPrivacidade"));
const FluxosExternos = lazy(() => import("./pages/FluxosExternos"));
const PublicFormPage = lazy(() => import("./pages/PublicFormPage"));
const LeadWebhooks = lazy(() => import("./pages/LeadWebhooks"));
const SequenciasNurturing = lazy(() => import("./pages/SequenciasNurturing"));
const CTWAAnalytics = lazy(() => import("./pages/CTWAAnalytics"));
const RevenueIntelligence = lazy(() => import("./pages/RevenueIntelligence"));
const SecretariaGrupos = lazy(() => import("./pages/SecretariaGrupos"));
const ModuloFantasma = lazy(() => import("./pages/ModuloFantasma"));
const Projetos = lazy(() => import("./pages/Projetos"));
const CRMRepresentantes = lazy(() => import("./pages/CRMRepresentantes"));
const CRMMetas = lazy(() => import("./pages/CRMMetas"));
const Reunioes = lazy(() => import("./pages/Reunioes"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Cadastro />} />
              <Route path="/" element={<Login />} />
              <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/conexao" element={<ProtectedRoute><Conexao /></ProtectedRoute>} />
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
