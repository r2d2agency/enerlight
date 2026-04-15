import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface SurveyField {
  id: string;
  survey_id: string;
  field_type: 'nps' | 'rating' | 'text' | 'textarea' | 'select' | 'multi_select' | 'yes_no' | 'scale';
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  min_value?: number;
  max_value?: number;
  sort_order: number;
}

interface Survey {
  id: string;
  title: string;
  description?: string;
  introduction?: string;
  thumbnail_url?: string;
  status: 'draft' | 'active' | 'paused' | 'closed';
  template_type?: string;
  share_slug: string;
  display_mode?: 'typeform' | 'scroll';
  organization_logo?: string;
  require_name: boolean;
  require_whatsapp: boolean;
  require_email: boolean;
  allow_anonymous: boolean;
  thank_you_message: string;
  created_by_name?: string;
  field_count?: number;
  response_count?: number;
  created_at: string;
  fields?: SurveyField[];
}

interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  introduction: string;
  fields: Array<{
    field_type: string;
    label: string;
    required: boolean;
    options?: string[];
    min_value?: number;
    max_value?: number;
  }>;
}

interface SurveyResponse {
  id: string;
  survey_id: string;
  respondent_name?: string;
  respondent_whatsapp?: string;
  respondent_email?: string;
  answers: Record<string, any>;
  submitted_at: string;
}

interface SurveyResults {
  responses: SurveyResponse[];
  fields: SurveyField[];
  stats: {
    total_responses: number;
    field_stats: Record<string, any>;
  };
}

interface SurveyOverview {
  total_surveys: number;
  active_surveys: number;
  total_responses: number;
  surveys: Survey[];
}

export function useSurveys() {
  return useQuery<Survey[]>({
    queryKey: ['surveys'],
    queryFn: () => api('/api/surveys'),
  });
}

export function useSurvey(id: string | null) {
  return useQuery<Survey>({
    queryKey: ['surveys', id],
    queryFn: () => api(`/api/surveys/${id}`),
    enabled: !!id,
  });
}

export function useSurveyTemplates() {
  return useQuery<SurveyTemplate[]>({
    queryKey: ['survey-templates'],
    queryFn: () => api('/api/surveys/templates'),
  });
}

export function useSurveyResults(surveyId: string | null) {
  return useQuery<SurveyResults>({
    queryKey: ['survey-results', surveyId],
    queryFn: () => api(`/api/surveys/${surveyId}/responses`),
    enabled: !!surveyId,
  });
}

export function useSurveyOverview() {
  return useQuery<SurveyOverview>({
    queryKey: ['survey-overview'],
    queryFn: () => api('/api/surveys/stats/overview'),
  });
}

export function usePublicSurvey(slug: string | null) {
  return useQuery<Survey>({
    queryKey: ['public-survey', slug],
    queryFn: () => api(`/api/surveys/public/${slug}`, { auth: false }),
    enabled: !!slug,
  });
}

export function useSurveyMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (data: Record<string, any>) => api('/api/surveys', { method: 'POST', body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: Record<string, any>) => api(`/api/surveys/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/surveys/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); },
  });

  const addField = useMutation({
    mutationFn: ({ surveyId, ...data }: Record<string, any>) => api(`/api/surveys/${surveyId}/fields`, { method: 'POST', body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); },
  });

  const updateField = useMutation({
    mutationFn: ({ surveyId, fieldId, ...data }: Record<string, any>) => api(`/api/surveys/${surveyId}/fields/${fieldId}`, { method: 'PATCH', body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); },
  });

  const removeField = useMutation({
    mutationFn: ({ surveyId, fieldId }: { surveyId: string; fieldId: string }) => api(`/api/surveys/${surveyId}/fields/${fieldId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['surveys'] }); },
  });

  const submitResponse = useMutation({
    mutationFn: ({ slug, ...data }: Record<string, any>) => api(`/api/surveys/public/${slug}/respond`, { method: 'POST', body: data, auth: false }),
  });

  return { create, update, remove, addField, updateField, removeField, submitResponse };
}

export type { Survey, SurveyField, SurveyTemplate, SurveyResponse, SurveyResults, SurveyOverview };
