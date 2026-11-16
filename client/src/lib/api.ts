import type { ApiError as ApiErrorBody } from '@deskflow/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};

type UnauthorizedHandler = (code: string) => void;
let onUnauthorized: UnauthorizedHandler = () => {};
/** Registered by the auth provider so any 401 anywhere sends the user back to sign-in. */
export const setUnauthorizedHandler = (fn: UnauthorizedHandler) => {
  onUnauthorized = fn;
};

type Method = 'GET' | 'POST' | 'PATCH';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'Cannot reach the server. Check your connection and try again.',
    );
  }

  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as ({ data: T } & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const err = json?.error ?? {
      code: 'HTTP_' + res.status,
      message: 'Something went wrong. Please try again.',
    };
    if (res.status === 401 && path !== '/auth/login') onUnauthorized(err.code);
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return (json as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
};

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong. Please try again.';

export function toQueryString(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
