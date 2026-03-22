import { useState, useCallback } from 'react';
import { API_URL, getAuthToken } from '@/lib/api';

export interface DocSigner {
  id?: string;
  name: string;
  email: string;
  cpf?: string;
  phone?: string;
  role?: string;
  sign_order?: number;
  status?: string;
  signed_at?: string;
  access_token?: string;
}

export interface DocPlacement {
  id?: string;
  signer_id: string;
  page_number: number;
  x_position: number;
  y_position: number;
  width?: number;
  height?: number;
}

export interface SignatureDocument {
  id: string;
  org_id: string;
  title: string;
  description?: string;
  original_url: string;
  original_filename: string;
  original_mimetype: string;
  signed_pdf_url?: string;
  status: 'draft' | 'pending' | 'partially_signed' | 'completed' | 'cancelled';
  created_by?: string;
  creator_name?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  total_signers?: number;
  signed_count?: number;
  signers?: DocSigner[];
  placements?: DocPlacement[];
  audit_log?: any[];
}

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`
});

export function useDocumentSignatures() {
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/document-signatures`, { headers: getHeaders() });
      if (res.ok) setDocuments(await res.json());
    } catch (err) {
      console.error('Fetch docs error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const getDocument = useCallback(async (id: string): Promise<SignatureDocument | null> => {
    try {
      const res = await fetch(`${API_URL}/api/document-signatures/${id}`, { headers: getHeaders() });
      if (res.ok) return res.json();
      return null;
    } catch { return null; }
  }, []);

  const createDocument = useCallback(async (data: {
    title: string;
    description?: string;
    original_url: string;
    original_filename?: string;
    original_mimetype?: string;
    signers?: Omit<DocSigner, 'id' | 'status' | 'signed_at' | 'access_token'>[];
  }): Promise<SignatureDocument | null> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/document-signatures`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(data)
      });
      if (res.ok) { const doc = await res.json(); await fetchDocuments(); return doc; }
      return null;
    } catch { return null; } finally { setLoading(false); }
  }, [fetchDocuments]);

  const updateDocument = useCallback(async (id: string, data: any): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/document-signatures/${id}`, {
        method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data)
      });
      if (res.ok) { await fetchDocuments(); return true; }
      return false;
    } catch { return false; }
  }, [fetchDocuments]);

  const sendForSigning = useCallback(async (id: string): Promise<{ signing_links?: any[] } | null> => {
    try {
      const res = await fetch(`${API_URL}/api/document-signatures/${id}/send`, {
        method: 'POST', headers: getHeaders()
      });
      if (res.ok) { const data = await res.json(); await fetchDocuments(); return data; }
      return null;
    } catch { return null; }
  }, [fetchDocuments]);

  const deleteDocument = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/document-signatures/${id}`, {
        method: 'DELETE', headers: getHeaders()
      });
      if (res.ok) { await fetchDocuments(); return true; }
      return false;
    } catch { return false; }
  }, [fetchDocuments]);

  // Public signing endpoints
  const getSigningPage = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/document-signatures/sign/${token}`);
      if (res.ok) return res.json();
      return null;
    } catch { return null; }
  }, []);

  const submitSignature = useCallback(async (token: string, data: {
    signature_data: string;
    cpf?: string;
    geolocation?: string;
  }) => {
    try {
      const res = await fetch(`${API_URL}/api/document-signatures/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.ok;
    } catch { return false; }
  }, []);

  return {
    loading, documents, fetchDocuments, getDocument,
    createDocument, updateDocument, sendForSigning, deleteDocument,
    getSigningPage, submitSignature
  };
}
