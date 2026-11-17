import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { ChangePasswordInput, LoginInput, SessionInfo, User } from '@deskflow/shared';
import { api, ApiError, setCsrfToken, setUnauthorizedHandler } from './api';

type AuthValue = {
  user: User | null;
  isLoading: boolean;
  /** Set when the session check itself failed (server unreachable or erroring). */
  bootError: unknown;
  retryBoot: () => void;
  login: (input: LoginInput) => Promise<User>;
  logout: () => Promise<void>;
  /** Signs this account out on every device, this one included. */
  logoutEverywhere: () => Promise<void>;
  /** Replaces the password; other devices are signed out, this session stays. */
  changePassword: (input: ChangePasswordInput) => Promise<User>;
};

const AuthContext = createContext<AuthValue | null>(null);
const ME = ['auth', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const me = useQuery({
    queryKey: ME,
    queryFn: async () => {
      try {
        const s = await api.get<SessionInfo>('/auth/me');
        setCsrfToken(s.csrfToken);
        return s.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // Any 401 (expired or revoked session) drops cached data and returns to sign-in with a return path.
  useEffect(() => {
    setUnauthorizedHandler((code) => {
      if (!qc.getQueryData(ME)) return;
      setCsrfToken(null);
      qc.clear();
      qc.setQueryData(ME, null);
      if (code === 'SESSION_EXPIRED')
        toast.info('Your session expired. Sign in again to continue.');
      const next = location.pathname + location.search;
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    });
  }, [qc, navigate, location.pathname, location.search]);

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.post<SessionInfo>('/auth/login', input),
    onSuccess: (s) => {
      setCsrfToken(s.csrfToken);
      qc.setQueryData(ME, s.user);
    },
  });

  const signOutLocally = () => {
    setCsrfToken(null);
    qc.clear();
    qc.setQueryData(ME, null);
    navigate('/login', { replace: true });
  };

  const value = useMemo<AuthValue>(
    () => ({
      user: me.data ?? null,
      isLoading: me.isPending,
      bootError: me.isError ? me.error : null,
      retryBoot: () => void me.refetch(),
      login: async (input) => (await loginMutation.mutateAsync(input)).user,
      logout: async () => {
        try {
          await api.post('/auth/logout');
        } finally {
          signOutLocally();
        }
      },
      logoutEverywhere: async () => {
        await api.post('/auth/logout-all');
        signOutLocally();
        toast.success('Signed out on every device');
      },
      changePassword: async (input) => {
        const s = await api.post<SessionInfo>('/auth/password', input);
        setCsrfToken(s.csrfToken);
        qc.setQueryData(ME, s.user);
        return s.user;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signOutLocally only uses qc and navigate
    [me, loginMutation, qc, navigate],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For screens behind the auth guard, where a user is guaranteed. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside an authenticated route');
  return user;
}
