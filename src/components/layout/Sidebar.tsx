import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  GitBranch,
  Kanban,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquare,
  MessagesSquare,
  MousePointerClick,
  Plug,
  Receipt,
  RefreshCw,
  Send,
  Settings,
  Shield,
  Sparkles,
  Target,
  User,
  Users,
  UserPlus,
  Zap,
  Bell,
  Lock,
  Webhook,
  Ghost,
  FolderKanban,
  Handshake,
  Presentation,
} from "lucide-react";
import { API_URL, getAuthToken } from "@/lib/api";
import gleegoLogo from "@/assets/gleego-logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { useThemedBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface NavItem {
  name: string;
  href: string;
  icon: any;
  moduleKey?: 'campaigns' | 'billing' | 'groups' | 'scheduled_messages' | 'chatbots' | 'chat' | 'crm' | 'ai_agents' | 'group_secretary' | 'ghost' | 'projects';
  adminOnly?: boolean;
  ownerOnly?: boolean;
  superadminOnly?: boolean;
  permissionKey?: string; // maps to user_permissions.can_view_*
}

interface NavSection {
  title: string;
  icon: any;
  items: NavItem[];
  moduleKey?: 'campaigns' | 'billing' | 'groups' | 'scheduled_messages' | 'chatbots' | 'chat' | 'crm' | 'ai_agents' | 'group_secretary' | 'ghost' | 'projects';
  adminOnly?: boolean;
  permissionKey?: string;
}

const getNavSections = (hasConnections: boolean): NavSection[] => [
  {
    title: "Atendimento",
    icon: MessagesSquare,
    items: [
      ...(hasConnections ? [{ name: "Chat", href: "/chat", icon: MessagesSquare, moduleKey: 'chat' as const, permissionKey: 'can_view_chat' }] : []),
      ...(hasConnections ? [{ name: "Secretária IA", href: "/secretaria-grupos", icon: Bot, moduleKey: 'group_secretary' as const, adminOnly: true, permissionKey: 'can_view_ai_secretary' }] : []),
      { name: "Agentes IA", href: "/agentes-ia", icon: Sparkles, superadminOnly: true, permissionKey: 'can_view_ai_agents' },
      ...(hasConnections ? [{ name: "Chatbots", href: "/chatbots", icon: Bot, moduleKey: 'chatbots' as const, adminOnly: true, permissionKey: 'can_view_chatbots' }] : []),
      ...(hasConnections ? [{ name: "Fluxos", href: "/fluxos", icon: GitBranch, moduleKey: 'chatbots' as const, adminOnly: true, permissionKey: 'can_view_flows' }] : []),
      { name: "Departamentos", href: "/departamentos", icon: Building2, adminOnly: true, permissionKey: 'can_view_departments' },
      { name: "Agendamentos", href: "/agendamentos", icon: Bell, moduleKey: 'scheduled_messages' as const, permissionKey: 'can_view_schedules' },
      { name: "Tags", href: "/tags", icon: Receipt, permissionKey: 'can_view_tags' },
      { name: "Contatos", href: "/contatos-chat", icon: Users, permissionKey: 'can_view_contacts' },
    ],
  },
  {
    title: "CRM",
    icon: Briefcase,
    moduleKey: 'crm',
    permissionKey: 'can_view_crm',
    items: [
      { name: "Negociações", href: "/crm/negociacoes", icon: Kanban, permissionKey: 'can_view_crm' },
      { name: "Prospects", href: "/crm/prospects", icon: UserPlus, permissionKey: 'can_view_prospects' },
      { name: "Empresas", href: "/crm/empresas", icon: Building2, permissionKey: 'can_view_companies' },
      { name: "Mapa", href: "/mapa", icon: Map, permissionKey: 'can_view_map' },
      { name: "Agenda", href: "/crm/agenda", icon: CalendarDays, permissionKey: 'can_view_calendar' },
      { name: "Tarefas", href: "/crm/tarefas", icon: ClipboardList, permissionKey: 'can_view_tasks' },
      { name: "Relatórios", href: "/crm/relatorios", icon: BarChart3, permissionKey: 'can_view_reports' },
      { name: "Representantes", href: "/crm/representantes", icon: Handshake, permissionKey: 'can_view_crm' },
      { name: "Metas", href: "/crm/metas", icon: Target, permissionKey: 'can_view_crm' },
      { name: "Revenue Intel", href: "/revenue-intelligence", icon: Brain, adminOnly: true, permissionKey: 'can_view_revenue_intel' },
      { name: "Fantasma", href: "/modulo-fantasma", icon: Ghost, ownerOnly: true, moduleKey: 'ghost', permissionKey: 'can_view_ghost' },
      { name: "Configurações", href: "/crm/configuracoes", icon: Settings, adminOnly: true, permissionKey: 'can_view_crm_settings' },
    ],
  },
  {
    title: "Projetos",
    icon: FolderKanban,
    moduleKey: 'projects',
    permissionKey: 'can_view_projects',
    items: [
      { name: "Kanban", href: "/projetos", icon: FolderKanban, permissionKey: 'can_view_projects' },
      { name: "Reuniões", href: "/reunioes", icon: Presentation, permissionKey: 'can_view_projects' },
    ],
  },
  {
    title: "Disparos",
    icon: Send,
    moduleKey: 'campaigns',
    permissionKey: 'can_view_campaigns',
    items: [
      { name: "Listas", href: "/contatos", icon: Users, permissionKey: 'can_view_campaigns' },
      { name: "Mensagens", href: "/mensagens", icon: MessageSquare, permissionKey: 'can_view_campaigns' },
      { name: "Campanhas", href: "/campanhas", icon: Send, permissionKey: 'can_view_campaigns' },
      { name: "Sequências", href: "/sequencias", icon: RefreshCw, adminOnly: true, permissionKey: 'can_view_sequences' },
      { name: "Fluxos Externos", href: "/fluxos-externos", icon: FileText, adminOnly: true, permissionKey: 'can_view_external_flows' },
      { name: "Webhooks", href: "/lead-webhooks", icon: Webhook, adminOnly: true, permissionKey: 'can_view_webhooks' },
      { name: "CTWA Analytics", href: "/ctwa-analytics", icon: MousePointerClick, adminOnly: true, permissionKey: 'can_view_ctwa' },
    ],
  },
  {
    title: "Minha Conta",
    icon: User,
    items: [
      { name: "Ajustes", href: "/configuracoes", icon: Settings, permissionKey: 'can_view_settings' },
    ],
  },
  {
    title: "Administração",
    icon: Shield,
    adminOnly: true,
    items: [
      { name: "Cobrança", href: "/cobranca", icon: Receipt, moduleKey: 'billing', permissionKey: 'can_view_billing' },
      { name: "Conexões", href: "/conexao", icon: Plug, permissionKey: 'can_view_connections' },
      { name: "Organizações", href: "/organizacoes", icon: Building2, permissionKey: 'can_view_organizations' },
    ],
  },
];

interface SidebarContentProps {
  isExpanded: boolean;
  isSuperadmin: boolean;
  onNavigate?: () => void;
}

function SidebarContentComponent({ isExpanded, isSuperadmin, onNavigate }: SidebarContentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user, modulesEnabled, userPermissions } = useAuth();
  const { branding } = useThemedBranding();
  const [openSections, setOpenSections] = useState<string[]>(["Atendimento"]);

  // Helper to check if user has admin-level role
  const isAdminRole = (role?: string) => ['owner', 'admin', 'manager'].includes(role || '');
  const isOwnerRole = (role?: string) => role === 'owner';
  const userIsAdmin = isSuperadmin || isAdminRole(user?.role);
  const userIsOwner = isSuperadmin || isOwnerRole(user?.role);
  const hasConnections = user?.has_connections !== false; // default true if undefined

  // Check permission - if user has custom permissions, use them; otherwise fall through to role-based
  const hasPermission = (permKey?: string): boolean => {
    if (!permKey) return true;
    if (isSuperadmin) return true;
    if (!userPermissions) return true; // no custom permissions = use role-based defaults
    return (userPermissions as any)[permKey] === true;
  };

  const navSections = getNavSections(hasConnections);

  // Filter sections and items based on modules enabled, role AND permissions
  const filteredSections = navSections
    .filter(section => {
      // Check module access
      if (section.moduleKey && !modulesEnabled[section.moduleKey] && !isSuperadmin) return false;
      // Check admin-only section
      if (section.adminOnly && !userIsAdmin) return false;
      // Check permission
      if (!hasPermission(section.permissionKey)) return false;
      return true;
    })
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        // Check module access
        if (item.moduleKey && !modulesEnabled[item.moduleKey] && !isSuperadmin) return false;
        // Check superadmin-only item
        if (item.superadminOnly && !isSuperadmin) return false;
        // Check admin-only item
        if (item.adminOnly && !userIsAdmin) return false;
        if (item.ownerOnly && !userIsOwner) return false;
        // Check permission
        if (!hasPermission(item.permissionKey)) return false;
        return true;
      })
    }))
    .filter(section => section.items.length > 0);

  const handleLogout = () => {
    logout();
    navigate("/login");
    onNavigate?.();
  };

  const toggleSection = (title: string) => {
    setOpenSections(prev =>
      prev.includes(title)
        ? prev.filter(s => s !== title)
        : [...prev, title]
    );
  };

  const isActiveRoute = (href: string) => location.pathname === href;

  const isSectionActive = (section: NavSection) =>
    section.items.some(item => isActiveRoute(item.href));

  const renderNavItem = (item: NavItem, indent = false) => {
    const isActive = isActiveRoute(item.href);
    
    const linkContent = (
      <Link
        key={item.name}
        to={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
          indent && isExpanded && "ml-4",
          isExpanded ? "" : "justify-center",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
        {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}
      </Link>
    );

    if (!isExpanded) {
      return (
        <Tooltip key={item.name} delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.name}
          </TooltipContent>
        </Tooltip>
      );
    }

    return linkContent;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 items-center gap-3 border-b border-border transition-all duration-300",
          isExpanded ? "px-6" : "px-3 justify-center"
        )}
      >
        {branding.logo_sidebar ? (
          <img 
            src={branding.logo_sidebar} 
            alt="Logo" 
            className="h-10 w-10 object-contain shrink-0 rounded-xl"
          />
        ) : (
          <img src={gleegoLogo} alt="Enerlight" className="h-10 w-10 object-contain shrink-0 rounded-xl" />
        )}
        {isExpanded && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-bold text-foreground whitespace-nowrap">Enerlight</h1>
            <p className="text-xs text-muted-foreground whitespace-nowrap">Gestão Comercial</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto scrollbar-none hover:scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        {/* Dashboard - always visible */}
        {renderNavItem({ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard })}

        {/* Sections */}
        {filteredSections.map((section) => {
          const isOpen = openSections.includes(section.title);
          const sectionActive = isSectionActive(section);

          if (!isExpanded) {
            // When collapsed, show items directly with tooltips
            return (
              <div key={section.title} className="space-y-1 pt-2">
                {section.items.map(item => renderNavItem(item))}
              </div>
            );
          }

          return (
            <Collapsible
              key={section.title}
              open={isOpen}
              onOpenChange={() => toggleSection(section.title)}
              className="pt-2"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <section.icon className={cn("h-4 w-4", sectionActive && "text-primary")} />
                  <span>{section.title}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    isOpen && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 pt-1 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
                {section.items.map((item, index) => (
                  <div 
                    key={item.name}
                    className="animate-fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {renderNavItem(item, true)}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {/* Superadmin Link */}
        {isSuperadmin && (
          <>
            {!isExpanded ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Link
                    to="/admin"
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 mt-4 border border-primary/30",
                      location.pathname === "/admin"
                        ? "bg-primary/20 text-primary neon-glow"
                        : "text-primary hover:bg-primary/10"
                    )}
                  >
                    <Shield className="h-5 w-5 shrink-0" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  Superadmin
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                to="/admin"
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 mt-4 border border-primary/30",
                  location.pathname === "/admin"
                    ? "bg-primary/20 text-primary neon-glow"
                    : "text-primary hover:bg-primary/10"
                )}
              >
                <Shield className="h-5 w-5 shrink-0" />
                <span className="whitespace-nowrap">Superadmin</span>
              </Link>
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "border-t border-border p-3 space-y-2",
          !isExpanded && "flex flex-col items-center"
        )}
      >
        {user && isExpanded && (
          <div className="rounded-lg bg-accent/50 p-3">
            <p className="text-xs font-medium text-accent-foreground truncate">
              {user.name || user.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        )}

        {!isExpanded ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center rounded-lg p-2.5 text-destructive hover:bg-destructive/10 transition-all duration-200"
              >
                <LogOut className="h-5 w-5 shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Sair
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap">Sair</span>
          </button>
        )}

        {isExpanded && (
          <div className="text-center space-y-0.5">
            <p className="text-xs font-medium text-primary">TNS R2D2</p>
            <p className="text-xs text-muted-foreground">Versão 1.0.0</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    checkSuperadmin();
  }, []);

  const checkSuperadmin = async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/admin/check`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setIsSuperadmin(data.isSuperadmin);
      }
    } catch {
      setIsSuperadmin(false);
    }
  };

  const collapsedWidth = "w-16";
  const expandedWidth = "w-64";

  return (
    <>
      {/* Mobile Menu Button - positioned safely */}
      <div className="fixed top-3 left-3 z-[60] lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10 bg-card/95 backdrop-blur-sm border-border shadow-lg rounded-full"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-card border-border z-[70]">
            <SidebarContentComponent
              isExpanded={true}
              isSuperadmin={isSuperadmin}
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen bg-card border-r border-border shadow-card transition-all duration-300 ease-in-out hidden lg:block",
          isHovered ? expandedWidth : collapsedWidth
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <SidebarContentComponent isExpanded={isHovered} isSuperadmin={isSuperadmin} />
      </aside>
    </>
  );
}

export const SIDEBAR_COLLAPSED_WIDTH = 64;
export const SIDEBAR_EXPANDED_WIDTH = 256;
