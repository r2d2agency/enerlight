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
      // Use the organization members endpoint directly since rh endpoint might be redundant
      const response = await api<Employee[]>('/api/organizations/members');
      // The backend returns members as an array directly based on organizations.js
      return Array.isArray(response) ? response : [];
    } catch (err: any) {
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
      // Need org ID for organizations endpoint
      const me = await api<{user: {organization_id: string}}>('/api/auth/me');
      const orgId = me.user.organization_id;
      
      await api(`/api/organizations/${orgId}/members/${userId}`, {
        method: 'PATCH',
        body: data,
      });
      return true;
    } catch (err: any) {
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
      const me = await api<{user: {organization_id: string}}>('/api/auth/me');
      const orgId = me.user.organization_id;
      
      await api(`/api/organizations/${orgId}/members`, {
        method: 'POST',
        body: {
          ...data,
          password: data.password || '123456' // Default password if not provided
        },
      });
      return true;
    } catch (err: any) {
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
