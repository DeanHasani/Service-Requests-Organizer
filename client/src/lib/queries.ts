import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  Activity,
  AssignmentInput,
  CreateRequestInput,
  CreateUserInput,
  DashboardSummary,
  ListRequestsQuery,
  Note,
  Page,
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

/** Active users only, for assignee pickers. */
export const useAssignees = () =>
  useQuery({
    queryKey: [...keys.team, 'active'],
    queryFn: () => api.get<TeamMember[]>('/users?active=true'),
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
