import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

export interface Employee {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  facial_registered?: boolean;
}

export function useRh() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getEmployees = useCallback(async (): Promise<Employee[]> => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Get organizations user belongs to
      const orgs = await api<any[]>('/api/organizations');
      if (!orgs || orgs.length === 0) {
        throw new Error("Usuário sem organização");
      }
      
      const orgId = orgs[0].id;

      // Step 2: Get members for that organization
      const response = await api<Employee[]>(`/api/organizations/${orgId}/members`);
      return Array.isArray(response) ? response : [];
    } catch (err: any) {
      console.error("useRh.getEmployees error:", err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const updateMember = useCallback(async (userId: string, data: Partial<Employee>): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await api<any[]>('/api/organizations');
      if (!orgs || orgs.length === 0) throw new Error("Usuário sem organização");
      const orgId = orgs[0].id;

      await api(`/api/organizations/${orgId}/members/${userId}`, {
        method: 'PATCH',
        body: data,
      });
      return true;
    } catch (err: any) {
      console.error("useRh.updateMember error:", err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const createMember = useCallback(async (data: { email: string; name: string; role: string; password?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const orgs = await api<any[]>('/api/organizations');
      if (!orgs || orgs.length === 0) throw new Error("Usuário sem organization");
      const orgId = orgs[0].id;

      await api(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        body: {
          ...data,
          password: data.password || '123456'
        },
      });
      return true;
    } catch (err: any) {
      console.error("useRh.createMember error:", err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getEmployees,
    updateMember,
    createMember
  };
}
