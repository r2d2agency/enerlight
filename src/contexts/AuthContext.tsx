import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, setAuthToken, clearAuthToken, getAuthToken } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface ModulesEnabled {
  campaigns: boolean;
  billing: boolean;
  groups: boolean;
  scheduled_messages: boolean;
  chatbots: boolean;
  chat: boolean;
  crm: boolean;
  ai_agents: boolean;
  group_secretary: boolean;
  ghost: boolean;
  projects: boolean;
}

export interface UserPermissions {
  can_view_chat: boolean;
  can_view_chatbots: boolean;
  can_view_flows: boolean;
  can_view_departments: boolean;
  can_view_schedules: boolean;
  can_view_tags: boolean;
  can_view_contacts: boolean;
  can_view_ai_secretary: boolean;
  can_view_ai_agents: boolean;
  can_view_crm: boolean;
  can_view_prospects: boolean;
  can_view_companies: boolean;
  can_view_map: boolean;
  can_view_calendar: boolean;
  can_view_tasks: boolean;
  can_view_reports: boolean;
  can_view_revenue_intel: boolean;
  can_view_ghost: boolean;
  can_view_crm_settings: boolean;
  can_view_projects: boolean;
  can_view_campaigns: boolean;
  can_view_sequences: boolean;
  can_view_external_flows: boolean;
  can_view_webhooks: boolean;
  can_view_ctwa: boolean;
  can_view_billing: boolean;
  can_view_connections: boolean;
  can_view_organizations: boolean;
  can_view_settings: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
  organization_id?: string;
  modules_enabled?: ModulesEnabled;
  has_connections?: boolean;
  user_permissions?: UserPermissions | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  modulesEnabled: ModulesEnabled;
  userPermissions: UserPermissions | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, planId?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const defaultModules: ModulesEnabled = {
    campaigns: true,
    billing: true,
    groups: true,
    scheduled_messages: true,
    chatbots: true,
    chat: true,
    crm: true,
    ai_agents: true,
    group_secretary: false,
    ghost: true,
    projects: false,
  };

  const refreshUser = async () => {
    const token = getAuthToken();
    if (token) {
      try {
        const { user } = await authApi.getMe();
        setUser(user);
      } catch {
        // Ignore errors on refresh
      }
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (token) {
        try {
          const { user } = await authApi.getMe();
          setUser(user);
        } catch {
          clearAuthToken();
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const { user, token } = await authApi.login(email, password);
    setAuthToken(token);
    setUser(user);
    toast({ title: 'Login realizado com sucesso!' });
  };

  const register = async (email: string, password: string, name: string, planId?: string) => {
    const { user, token } = await authApi.register(email, password, name, planId);
    setAuthToken(token);
    setUser(user);
    toast({ title: 'Conta criada com sucesso!' });
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
    toast({ title: 'Logout realizado' });
  };

  const modulesEnabled = user?.modules_enabled || defaultModules;
  const userPermissions = user?.user_permissions || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        modulesEnabled,
        userPermissions,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
