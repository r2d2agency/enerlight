import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Settings,
  User,
  Menu,
  ChevronDown,
  ShoppingCart,
  Users,
  Handshake,
  ClipboardList,
  Wallet,
  Zap,
} from "lucide-react";

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
  permissionKey?: string;
  managerOnly?: boolean;
}

interface NavSection {
  title: string;
  icon: any;
  items: NavItem[];
  managerOnly?: boolean;
}

const getNavSections = (isManager: boolean): NavSection[] => {
  const sections: NavSection[] = [];

  // Common/Rep Dashboard Section
  sections.push({
    title: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { name: "Dashboard", href: "/rep/dashboard", icon: LayoutDashboard },
    ]
  });

  if (isManager) {
    sections.push({
      title: "Gestão",
      icon: Users,
      items: [
        { name: "Representantes", href: "/rep/manager/representatives", icon: Users },
        { name: "Tabelas de Preços", href: "/rep/manager/price-lists", icon: ClipboardList },
        { name: "Produtos", href: "/rep/manager/products", icon: ShoppingCart },
        { name: "Orçamentos", href: "/rep/manager/quotes", icon: ClipboardList },
        { name: "Configurações", href: "/rep/manager/settings", icon: Settings },
      ]
    });
  } else {
    sections.push({
      title: "Vendas",
      icon: Handshake,
      items: [
        { name: "Novo Orçamento", href: "/rep/catalog", icon: Zap },
        { name: "Orçamentos", href: "/rep/quotes", icon: ClipboardList },
        { name: "Clientes", href: "/rep/clients", icon: Users },
        { name: "Comissões", href: "/rep/commissions", icon: Wallet },
      ]
    });
  }

  sections.push({
    title: "Minha Conta",
    icon: User,
    items: [
      { name: "Perfil", href: "/rep/profile", icon: User },
    ]
  });

  return sections;
};

export default function RepresentativeLayout({ children }: { children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { branding } = useThemedBranding();
  
  const isManager = user?.is_representative_manager === true || user?.is_superadmin === true;
  const sections = getNavSections(isManager);

  const [openSections, setOpenSections] = useState<string[]>(sections.map(s => s.title));

  const toggleSection = (title: string) => {
    setOpenSections(prev => 
      prev.includes(title) 
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full bg-sidebar border-r border-border/40 shrink-0">
      <div className={cn(
        "flex items-center gap-3 px-6 py-8",
        !isExpanded && !mobile && "px-4 justify-center"
      )}>
        {branding.logo_sidebar ? (
          <img src={branding.logo_sidebar} alt="Logo" className={cn("h-8 object-contain", !isExpanded && !mobile && "hidden")} />
        ) : (
          <div className="flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            {(isExpanded || mobile) && <span className="font-bold text-xl tracking-tight">REP Module</span>}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6 custom-scrollbar">
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            {isExpanded || mobile ? (
              <Collapsible
                open={openSections.includes(section.title)}
                onOpenChange={() => toggleSection(section.title)}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors group">
                  <div className="flex items-center gap-2">
                    <section.icon className="h-4 w-4" />
                    <span>{section.title}</span>
                  </div>
                  <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", openSections.includes(section.title) ? "rotate-0" : "-rotate-90")} />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pt-1">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all group relative",
                        location.pathname === item.href
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", location.pathname === item.href ? "text-primary" : "group-hover:text-foreground")} />
                      <span className="truncate">{item.name}</span>
                      {location.pathname === item.href && (
                        <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" />
                      )}
                    </Link>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div className="flex flex-col items-center gap-2">
                {section.items.map((item) => (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.href}
                        className={cn(
                          "p-2 rounded-md transition-all group relative",
                          location.pathname === item.href
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {location.pathname === item.href && (
                          <div className="absolute left-0 w-1 h-6 bg-primary rounded-r-full" />
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border/40 space-y-2">
        {(isExpanded || mobile) ? (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
        ) : (
           <div className="flex justify-center mb-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              {user?.name?.charAt(0)}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            !isExpanded && !mobile && "justify-center px-0"
          )}
          onClick={logout}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {(isExpanded || mobile) && <span className="ml-3">Sair</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:block transition-all duration-300 ease-in-out z-30 shrink-0 sticky top-0 h-screen",
        isExpanded ? "w-64" : "w-20"
      )}>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-border/40 flex items-center justify-between px-4 md:px-8 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-20 shrink-0 sticky top-0">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              asChild
            >
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72">
                  <SidebarContent mobile />
                </SheetContent>
              </Sheet>
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <Menu className="h-5 w-5 text-muted-foreground" />
            </Button>

            <h1 className="text-lg font-semibold tracking-tight">
              {sections.find(s => s.items.some(i => i.href === location.pathname))?.items.find(i => i.href === location.pathname)?.name || "Módulo Representante"}
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Header icons could go here */}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
