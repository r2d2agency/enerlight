import { useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface InternalChannel {
  id: string;
  organization_id: string;
  department_id: string | null;
  name: string;
  description: string | null;
  created_by: string;
  created_by_name: string;
  department_name: string | null;
  is_archived: boolean;
  member_count: number;
  open_topics_count: number;
  created_at: string;
  updated_at: string;
}

export interface InternalTopic {
  id: string;
  channel_id: string;
  title: string;
  status: "open" | "in_progress" | "closed";
  created_by: string;
  created_by_name: string;
  message_count: number;
  last_message_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InternalMessageAttachment {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
}

export interface InternalMessage {
  id: string;
  topic_id: string;
  sender_id: string;
  sender_name: string;
  sender_email: string;
  content: string;
  mentions: string[];
  attachments: InternalMessageAttachment[];
  created_at: string;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  joined_at: string;
}

export interface UnreadMention {
  id: string;
  message_id: string;
  topic_id: string;
  channel_id: string;
  content: string;
  sender_name: string;
  topic_title: string;
  channel_name: string;
  created_at: string;
}

// Channels
export function useInternalChannels(departmentId?: string) {
  const params = departmentId ? `?department_id=${departmentId}` : "";
  return useQuery({
    queryKey: ["internal-channels", departmentId],
    queryFn: () => api<InternalChannel[]>(`/api/internal-chat/channels${params}`),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; department_id?: string; member_ids?: string[] }) =>
      api<InternalChannel>("/api/internal-chat/channels", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-channels"] }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; is_archived?: boolean }) =>
      api<InternalChannel>(`/api/internal-chat/channels/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-channels"] }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/internal-chat/channels/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["internal-channels"] }),
  });
}

// Channel members
export function useChannelMembers(channelId: string | null) {
  return useQuery({
    queryKey: ["internal-channel-members", channelId],
    queryFn: () => api<ChannelMember[]>(`/api/internal-chat/channels/${channelId}/members`),
    enabled: !!channelId,
  });
}

export function useAddChannelMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, userId }: { channelId: string; userId: string }) =>
      api(`/api/internal-chat/channels/${channelId}/members`, { method: "POST", body: { user_id: userId } }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["internal-channel-members", vars.channelId] }),
  });
}

export function useRemoveChannelMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, userId }: { channelId: string; userId: string }) =>
      api(`/api/internal-chat/channels/${channelId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["internal-channel-members", vars.channelId] }),
  });
}

// Topics
export function useTopics(channelId: string | null, statusFilter?: string) {
  const params = statusFilter ? `?status=${statusFilter}` : "";
  return useQuery({
    queryKey: ["internal-topics", channelId, statusFilter],
    queryFn: () => api<InternalTopic[]>(`/api/internal-chat/channels/${channelId}/topics${params}`),
    enabled: !!channelId,
  });
}

export function useCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, title }: { channelId: string; title: string }) =>
      api<InternalTopic>(`/api/internal-chat/channels/${channelId}/topics`, { method: "POST", body: { title } }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["internal-topics", vars.channelId] });
      qc.invalidateQueries({ queryKey: ["internal-channels"] });
    },
  });
}

export function useUpdateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; title?: string; channel_id?: string }) =>
      api(`/api/internal-chat/topics/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-topics"] });
      qc.invalidateQueries({ queryKey: ["internal-channels"] });
    },
  });
}

export function useDeleteTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/internal-chat/topics/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-topics"] });
      qc.invalidateQueries({ queryKey: ["internal-channels"] });
    },
  });
}

// Topic members
export interface TopicMember {
  id: string;
  topic_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  added_at: string;
}

export function useTopicMembers(topicId: string | null) {
  return useQuery({
    queryKey: ["internal-topic-members", topicId],
    queryFn: () => api<TopicMember[]>(`/api/internal-chat/topics/${topicId}/members`),
    enabled: !!topicId,
  });
}

export function useAddTopicMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, userId }: { topicId: string; userId: string }) =>
      api(`/api/internal-chat/topics/${topicId}/members`, { method: "POST", body: { user_id: userId } }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["internal-topic-members", vars.topicId] }),
  });
}

export function useRemoveTopicMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, userId }: { topicId: string; userId: string }) =>
      api(`/api/internal-chat/topics/${topicId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["internal-topic-members", vars.topicId] }),
  });
}

// Topic tasks
export interface TopicTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
}

export function useTopicTasks(topicId: string | null) {
  return useQuery({
    queryKey: ["internal-topic-tasks", topicId],
    queryFn: () => api<TopicTask[]>(`/api/internal-chat/topics/${topicId}/tasks`),
    enabled: !!topicId,
  });
}

export function useCreateTopicTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, ...data }: { topicId: string; title: string; description?: string; assigned_to?: string; priority?: string; due_date?: string }) =>
      api<any>(`/api/internal-chat/topics/${topicId}/tasks`, { method: "POST", body: data }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["internal-topic-tasks", vars.topicId] });
      qc.invalidateQueries({ queryKey: ["topic-links", vars.topicId] });
    },
  });
}

// Messages
export function useTopicMessages(topicId: string | null) {
  const initialFetchDone = useRef<string | null>(null);

  useEffect(() => {
    if (topicId !== initialFetchDone.current) {
      initialFetchDone.current = null;
    }
  }, [topicId]);

  return useQuery({
    queryKey: ["internal-messages", topicId],
    queryFn: async () => {
      const markRead = initialFetchDone.current !== topicId ? "true" : "false";
      const result = await api<InternalMessage[]>(`/api/internal-chat/topics/${topicId}/messages?mark_read=${markRead}`);
      initialFetchDone.current = topicId;
      return result;
    },
    enabled: !!topicId,
    refetchInterval: 10000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicId, content, mentions, attachments }: {
      topicId: string;
      content: string;
      mentions?: string[];
      attachments?: { file_url: string; file_name: string; file_size?: number; file_type?: string }[];
    }) =>
      api<InternalMessage>(`/api/internal-chat/topics/${topicId}/messages`, {
        method: "POST",
        body: { content, mentions, attachments },
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["internal-messages", vars.topicId] });
      qc.invalidateQueries({ queryKey: ["internal-topics"] });
    },
  });
}

// Mentions
export function useUnreadMentionCount() {
  return useQuery({
    queryKey: ["internal-mentions-count"],
    queryFn: () => api<{ count: number }>("/api/internal-chat/mentions/unread-count"),
    refetchInterval: 30000,
  });
}

export function useUnreadMentions() {
  return useQuery({
    queryKey: ["internal-mentions"],
    queryFn: () => api<UnreadMention[]>("/api/internal-chat/mentions/unread"),
  });
}

// Org members (for adding to channels)
export interface OrgMember {
  id: string;
  name: string;
  email: string;
}

export function useOrgMembers() {
  return useQuery({
    queryKey: ["internal-org-members"],
    queryFn: () => api<OrgMember[]>("/api/internal-chat/org-members"),
  });
}

// Search
export function useInternalSearch(query: string) {
  return useQuery({
    queryKey: ["internal-search", query],
    queryFn: () => api<any[]>(`/api/internal-chat/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
}
