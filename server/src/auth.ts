import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import type { Role } from '@deskflow/shared';
import { prisma } from './db';
import { env, isProd } from './env';
import { AppError, forbidden } from './lib/errors';

export const COOKIE = 'deskflow_sid';
const ttlMs = () => env.SESSION_TTL_HOURS * 3600_000;

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: isProd,
  path: '/',
  maxAge: ttlMs(),
});

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export type AuthUser = { id: number; name: string; email: string; role: Role };
export type AuthContext = {
  user: AuthUser;
  sessionId: string;
  csrfToken: string;
  /** A manager reset the password; everything but choosing a new one is blocked. */
  mustChangePassword: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function startSession(res: Response, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  await prisma.session.create({
    data: { id: hash(token), userId, csrfToken, expiresAt: new Date(Date.now() + ttlMs()) },
  });
  res.cookie(COOKIE, token, cookieOptions());
  return csrfToken;
}

export async function endSession(res: Response, sessionId?: string) {
  if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/** Signs a user out everywhere, optionally keeping one session (the one making the call). */
export async function endAllSessions(userId: number, keepSessionId?: string) {
  await prisma.session.deleteMany({
    where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) },
  });
}

const unauthenticated = (code = 'UNAUTHENTICATED', message = 'Please sign in to continue') =>
  new AppError(401, code, message);

/** Loads the session from the cookie. Rejects missing, expired and deactivated sessions. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[COOKIE];
  if (typeof token !== 'string' || !token) throw unauthenticated();

  const id = hash(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
        },
      },
    },
  });
  if (!session) {
    res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
    throw unauthenticated();
  }
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || !session.user.isActive) {
    await endSession(res, id);
    throw unauthenticated('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  // Sliding expiry: refresh once less than half the lifetime is left.
  if (session.expiresAt.getTime() - now < ttlMs() / 2) {
    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(now + ttlMs()) } });
    res.cookie(COOKIE, token, cookieOptions());
  }
  const { isActive: _ignored, mustChangePassword, ...user } = session.user;
  req.auth = { user, sessionId: id, csrfToken: session.csrfToken, mustChangePassword };
  next();
};

/** Synchronizer-token CSRF check for every state-changing call made with a session. */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token') ?? '';
  const expected = req.auth?.csrfToken ?? '';
  const ok =
    Buffer.byteLength(sent) === Buffer.byteLength(expected) &&
    expected.length > 0 &&
    timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok)
    throw new AppError(
      403,
      'CSRF_INVALID',
      'Your session token is missing or out of date. Reload the page.',
    );
  next();
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    if (req.auth?.user.role !== role)
      throw forbidden(`Only ${role === 'MANAGER' ? 'managers' : 'employees'} can do that`);
    next();
  };

/** Calls still allowed while the user has to replace a temporary password. */
const ALLOWED_BEFORE_PASSWORD_CHANGE = ['/auth/me', '/auth/password', '/auth/logout'];

/** Blocks everything else until a user with a temporary password has chosen their own. */
export const requirePasswordChosen: RequestHandler = (req, _res, next) => {
  if (req.auth?.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.includes(req.path)) {
    throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Choose a new password before continuing');
  }
  next();
};

/** Narrowing helper for handlers mounted behind requireAuth. */
export function authOf(req: Request): AuthContext {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

export async function purgeExpiredSessions() {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
