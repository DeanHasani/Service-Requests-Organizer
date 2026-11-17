import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { Page, ServiceRequest, User } from '@deskflow/shared';
import { AuthProvider } from '../lib/auth';
import { AppRoutes, makeQueryClient } from '../App';

type Reply = { status?: number; body?: unknown };
type Handler = (req: {
  url: URL;
  body: unknown;
  headers: Record<string, string>;
}) => Reply | Promise<Reply>;
export type Routes = Record<string, Handler | Reply>;

export const manager: User = {
  id: 1,
  name: 'Growin Manager',
  email: 'growin@deskflow.test',
  role: 'MANAGER',
  isActive: true,
  mustChangePassword: false,
  createdAt: '2026-11-01T09:00:00.000Z',
};
export const employee: User = {
  ...manager,
  id: 2,
  name: 'Dean Hasani',
  email: 'dean@deskflow.test',
  role: 'EMPLOYEE',
};

export const makeRequest = (over: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: 7,
  referenceNumber: 'SR-000007',
  title: 'Printer on 2nd floor offline',
  description: 'Finance cannot print invoices.',
  requesterName: 'Laura Bennett',
  requesterContact: 'laura@example.com',
  source: 'PHONE',
  priority: 'HIGH',
  status: 'OPEN',
  version: 3,
  assignedTo: { id: 2, name: 'Dean Hasani' },
  createdBy: { id: 1, name: 'Growin Manager' },
  resolvedBy: null,
  resolvedAt: null,
  dueAt: null,
  createdAt: '2026-11-15T09:00:00.000Z',
  updatedAt: '2026-11-15T10:00:00.000Z',
  ...over,
});

export const page = <T,>(items: T[], over: Partial<Page<T>> = {}): Page<T> => ({
  items,
  page: 1,
  pageSize: 15,
  total: items.length,
  totalPages: 1,
  ...over,
});

/**
 * Stubs fetch with a `"METHOD /path"` route table (query string ignored for matching).
 * Unmatched GETs return empty-but-valid data so unrelated widgets stay quiet.
 */
export function mockApi(routes: Routes) {
  const calls: { method: string; url: URL; body: unknown; headers: Record<string, string> }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ method, url, body, headers });
    const key = `${method} ${url.pathname.replace(/^\/api/, '')}`;
    const route = routes[key];
    const reply: Reply =
      typeof route === 'function' ? await route({ url, body, headers }) : (route ?? fallback(key));
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function fallback(key: string): Reply {
  if (key === 'GET /dashboard')
    return {
      body: {
        data: {
          total: 0,
          open: 0,
          inProgress: 0,
          resolved: 0,
          unassigned: 0,
          overdue: 0,
          scope: 'team',
          mine: { open: 0, inProgress: 0, resolved: 0 },
          byPriority: { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0 },
        },
      },
    };
  if (
    key === 'GET /users' ||
    key === 'GET /activity' ||
    key.endsWith('/notes') ||
    key.endsWith('/activity')
  )
    return { body: { data: [] } };
  return { status: 404, body: { error: { code: 'NOT_FOUND', message: `No mock for ${key}` } } };
}

export const signedInAs = (user: User): Routes => ({
  'GET /auth/me': { body: { data: { user, csrfToken: 'csrf-test' } } },
});

export function renderApp(path: string) {
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
