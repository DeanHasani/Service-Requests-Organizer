import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  Activity,
  AssignmentInput,
  CreateRequestInput,
  CreateUserInput,
  Analytics,
  AnalyticsRange,
  AttentionItem,
  NotificationList,
  DashboardSummary,
  Insights,
  ListRequestsQuery,
  Note,
  Page,
  PasswordReset,
  Recommendations,
  ServiceRequest,
  StatusChangeInput,
  TeamMember,
  UpdateRequestInput,
} from '@deskflow/shared';
import { api, ApiError, errorMessage, toQueryString } from './api';

export const keys = {
  requests: ['requests'] as const,
  list: (q: ListRequestsQuery) => ['requests', 'list', q] as const,
  request: (id: number) => ['requests', 'detail', id] as const,
  notes: (id: number) => ['requests', 'detail', id, 'notes'] as const,
  activity: (id: number) => ['requests', 'detail', id, 'activity'] as const,
  feed: ['activity'] as const,
  dashboard: ['dashboard'] as const,
  team: ['team'] as const,
  insights: (id: number) => ['team', 'insights', id] as const,
};

// ---------- reads ----------

export const useRequests = (q: ListRequestsQuery) =>
  useQuery({
    queryKey: keys.list(q),
    queryFn: () => api.get<Page<ServiceRequest>>(`/requests${toQueryString(q)}`),
    placeholderData: keepPreviousData,
  });

export const useRequest = (id: number) =>
  useQuery({
    queryKey: keys.request(id),
    queryFn: () => api.get<ServiceRequest>(`/requests/${id}`),
  });

export const useNotes = (id: number) =>
  useQuery({ queryKey: keys.notes(id), queryFn: () => api.get<Note[]>(`/requests/${id}/notes`) });

export const useRequestActivity = (id: number) =>
  useQuery({
    queryKey: keys.activity(id),
    queryFn: () => api.get<Activity[]>(`/requests/${id}/activity`),
  });

export const useActivityFeed = (limit = 12) =>
  useQuery({
    queryKey: [...keys.feed, limit],
    queryFn: () => api.get<Activity[]>(`/activity?limit=${limit}`),
  });

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<DashboardSummary>('/dashboard') });

export const useTeam = () =>
  useQuery({ queryKey: keys.team, queryFn: () => api.get<TeamMember[]>('/users') });

// ---------- deadlines and notifications ----------

/** Your notifications; checked every 30 seconds while the app is open. */
export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'] as const,
    queryFn: () => api.get<NotificationList>('/notifications'),
    refetchInterval: 30_000,
  });

export function useMarkNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: number; read: boolean }) =>
      api.patch<NotificationList>(`/notifications/${id}`, { read }),
    onSuccess: (data) => qc.setQueryData(['notifications'], data),
  });
}

export function useMarkAllNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<NotificationList>('/notifications/read-all'),
    onSuccess: (data) => qc.setQueryData(['notifications'], data),
  });
}

/** Requests whose deadline is close or past: all for managers, your own for employees. */
export const useAttention = () =>
  useQuery({
    queryKey: ['attention'] as const,
    queryFn: () => api.get<AttentionItem[]>('/attention'),
    refetchInterval: 60_000,
  });

/** Smart assignment suggestions for an existing, unassigned request (managers). */
export const useRecommendations = (requestId: number, enabled = true) =>
  useQuery({
    queryKey: ['recommendations', 'request', requestId] as const,
    queryFn: () => api.get<Recommendations>(`/requests/${requestId}/recommendations`),
    enabled,
    staleTime: 30_000,
  });

/** Suggestions for a request still being written (the create form). */
export const useRecommendationsFor = (
  category: string | undefined,
  priority: string | undefined,
  enabled = true,
) =>
  useQuery({
    queryKey: ['recommendations', 'draft', category, priority] as const,
    queryFn: () =>
      api.get<Recommendations>(
        `/recommendations${toQueryString({ category, priority: priority ?? 'NORMAL' })}`,
      ),
    enabled: enabled && !!category,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

/** Team-wide numbers for the manager's analytics page. */
export const useAnalytics = (range: AnalyticsRange) =>
  useQuery({
    queryKey: ['analytics', range] as const,
    queryFn: () => api.get<Analytics>(`/analytics?range=${range}`),
    placeholderData: keepPreviousData,
  });

/** Someone's work history: your own, or anyone's for a manager. */
export const useInsights = (id: number) =>
  useQuery({
    queryKey: keys.insights(id),
    queryFn: () => api.get<Insights>(`/users/${id}/insights`),
  });

/** Active employees only, for assignee pickers (managers assign work, they don't take it). */
export const useAssignees = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    enabled,
    queryKey: [...keys.team, 'active'],
    queryFn: () => api.get<TeamMember[]>('/users?active=true'),
    select: (users) => users.filter((u) => u.role === 'EMPLOYEE'),
    staleTime: 60_000,
  });

// ---------- writes ----------

/** After any request write: refresh lists, counts, feeds and this request's timeline. */
function useRequestWrite<TInput>(
  fn: (input: TInput) => Promise<ServiceRequest>,
  { success }: { success?: string | ((r: ServiceRequest) => string) } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.setQueryData(keys.request(r.id), r);
      void qc.invalidateQueries({ queryKey: keys.requests });
      void qc.invalidateQueries({ queryKey: keys.feed });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      void qc.invalidateQueries({ queryKey: keys.team });
      void qc.invalidateQueries({ queryKey: ['recommendations'] });
      void qc.invalidateQueries({ queryKey: ['attention'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      if (success) toast.success(typeof success === 'function' ? success(r) : success);
    },
    onError: (err, _input) => {
      if (err instanceof ApiError && err.code === 'STALE_VERSION') {
        // Someone else changed it: show them the latest version.
        void qc.invalidateQueries({ queryKey: keys.requests });
      }
      if (!(err instanceof ApiError && err.status === 401)) toast.error(errorMessage(err));
    },
  });
}

export const useCreateRequest = () =>
  useRequestWrite((input: CreateRequestInput) => api.post<ServiceRequest>('/requests', input), {
    success: (r) => `${r.referenceNumber} created`,
  });

export const useUpdateRequest = (id: number) =>
  useRequestWrite(
    (input: UpdateRequestInput) => api.patch<ServiceRequest>(`/requests/${id}`, input),
    {
      success: 'Changes saved',
    },
  );

export const useChangeStatus = (id: number) =>
  useRequestWrite((input: StatusChangeInput) =>
    api.patch<ServiceRequest>(`/requests/${id}/status`, input),
  );

export const useAssign = (id: number) =>
  useRequestWrite((input: AssignmentInput) =>
    api.patch<ServiceRequest>(`/requests/${id}/assignment`, input),
  );

/**
 * The manager's review step for a new request: set priority and deadline (when they changed),
 * then assign. Each write carries the version the previous one returned.
 */
export const useTriage = (r: ServiceRequest) =>
  useRequestWrite(
    async ({
      priority,
      category,
      dueAt,
      assignedToId,
    }: {
      priority: ServiceRequest['priority'];
      category: ServiceRequest['category'];
      dueAt: string | null;
      assignedToId: number;
    }) => {
      let version = r.version;
      const changes = {
        ...(priority !== r.priority && { priority }),
        ...(category && category !== r.category && { category }),
        ...(dueAt !== r.dueAt && { dueAt }),
      };
      if (Object.keys(changes).length) {
        version = (await api.patch<ServiceRequest>(`/requests/${r.id}`, { ...changes, version }))
          .version;
      }
      return api.patch<ServiceRequest>(`/requests/${r.id}/assignment`, { assignedToId, version });
    },
    { success: (res) => `${res.referenceNumber} assigned to ${res.assignedTo?.name}` },
  );

export function useAddNote(requestId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.post<Note>(`/requests/${requestId}/notes`, { content }),
    onSuccess: (note) => {
      qc.setQueryData<Note[]>(keys.notes(requestId), (prev) => [...(prev ?? []), note]);
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<TeamMember>('/users', input),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: keys.team });
      toast.success(`${u.name} can now sign in`);
    },
  });
}

/** Issues a one-time password; the caller shows it to the manager exactly once. */
export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<PasswordReset>(`/users/${id}/reset-password`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.team }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Permanently closes a deactivated account. Their work keeps their name. */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: number; confirmName: string }) =>
      api.delete<void>(`/users/${id}`, { confirmName }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.team });
      void qc.invalidateQueries({ queryKey: keys.requests });
    },
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch<TeamMember>(`/users/${id}`, { isActive }),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: keys.team });
      void qc.invalidateQueries({ queryKey: keys.requests });
      void qc.invalidateQueries({ queryKey: keys.dashboard });
      toast.success(u.isActive ? `${u.name} reactivated` : `${u.name} deactivated`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
