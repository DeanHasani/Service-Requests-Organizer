import { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { ErrorPage, errorKind } from './components/errors';
import { AppSkeleton } from './components/skeletons';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { RequestsPage } from './pages/RequestsPage';
import { NewRequestPage } from './pages/NewRequestPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { UnassignedPage } from './pages/UnassignedPage';
import { TeamPage } from './pages/TeamPage';
import { ProfilePage } from './pages/ProfilePage';
import { MemberPage } from './pages/MemberPage';
import { ChooseNewPasswordPage } from './pages/ChooseNewPasswordPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        // Retry network blips, never auth/validation/not-found errors.
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

function RequireAuth() {
  const { user, isLoading, bootError, retryBoot } = useAuth();
  const location = useLocation();
  if (isLoading) return <AppSkeleton />;
  if (bootError) {
    const offline = errorKind(bootError) === 'offline';
    return (
      <ErrorPage
        kind={errorKind(bootError)}
        fullScreen
        title={offline ? 'Can’t reach DESKFLOW' : 'DESKFLOW couldn’t start'}
        body={
          offline
            ? 'The server is not answering. Make sure it is running, then try again.'
            : 'The server returned an error while checking your session. Try again in a moment.'
        }
        onRetry={retryBoot}
      />
    );
  }
  if (!user)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (user.mustChangePassword) return <ChooseNewPasswordPage />;
  return <AppShell />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="requests" element={<RequestsPage scope="all" />} />
        <Route path="requests/new" element={<NewRequestPage />} />
        <Route path="requests/:id" element={<RequestDetailPage />} />
        <Route path="my" element={<RequestsPage scope="mine" />} />
        <Route path="unassigned" element={<UnassignedPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="team/:id" element={<MemberPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: 'font-sans',
            style: {
              borderRadius: 10,
              borderColor: 'var(--color-line)',
              color: 'var(--color-ink)',
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
