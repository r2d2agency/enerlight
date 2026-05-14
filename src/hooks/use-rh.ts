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
      const data = await api<Employee[]>('/api/rh/employees');
      return data;
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
      await api(`/api/rh/members/${userId}`, {
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

  return {
    loading,
    error,
    getEmployees,
    updateMember
  };
}
