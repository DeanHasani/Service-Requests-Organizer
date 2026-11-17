import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import {
  activityQuerySchema,
  analyticsQuerySchema,
  assignmentSchema,
  canWorkOn,
  changePasswordSchema,
  createRequestSchema,
  createUserSchema,
  deleteUserSchema,
  idParamSchema,
  listRequestsQuerySchema,
  loginSchema,
  noteSchema,
  statusChangeSchema,
  updateRequestSchema,
  updateUserSchema,
  type DashboardSummary,
  type Priority,
} from '@deskflow/shared';
import {
  authOf,
  endAllSessions,
  endSession,
  requireAuth,
  requireCsrf,
  requirePasswordChosen,
  requireRole,
  startSession,
} from './auth';
import { prisma } from './db';
import { AppError, forbidden, parse } from './lib/errors';
import {
  activityInclude,
  noteInclude,
  toActivity,
  toNote,
  toUser,
  userSelect,
} from './lib/serialize';
import * as requests from './services/requests';
import * as users from './services/users';
import { getAnalytics } from './services/analytics';

// Compared against when the email is unknown, so response time does not reveal which emails exist.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', users.BCRYPT_ROUNDS);

export function apiRouter({ loginLimit }: { loginLimit: number }) {
  const api = Router();
  const idOf = (params: unknown) => parse(idParamSchema, params).id;

  // ---------- auth ----------
  // Failed attempts only. Also guards "current password" checks against guessing.
  const failureLimiter = (message: string) =>
    rateLimit({
      windowMs: 15 * 60_000,
      limit: loginLimit,
      skipSuccessfulRequests: true,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message } }),
    });
  const loginLimiter = failureLimiter('Too many sign-in attempts. Try again in 15 minutes.');
  const passwordLimiter = failureLimiter(
    'Too many incorrect password attempts. Try again in 15 minutes.',
  );

  api.post('/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid)
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
    if (!user.isActive)
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated');
    const csrfToken = await startSession(res, user.id);
    const safe = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: userSelect,
    });
    res.json({ data: { user: toUser(safe), csrfToken } });
  });

  api.use(requireAuth, requireCsrf, requirePasswordChosen);

  api.post('/auth/logout', async (req, res) => {
    await endSession(res, authOf(req).sessionId);
    res.status(204).end();
  });

  /** Ends every session of the caller, on every device, including this one. */
  api.post('/auth/logout-all', async (req, res) => {
    const { user } = authOf(req);
    await endAllSessions(user.id);
    await endSession(res);
    res.status(204).end();
  });

  /** Change your own password. Other sessions are signed out; this one stays. */
  api.post('/auth/password', passwordLimiter, async (req, res) => {
    const { user, sessionId, csrfToken } = authOf(req);
    const input = parse(changePasswordSchema, req.body);
    res.json({ data: { user: await users.changePassword(user, sessionId, input), csrfToken } });
  });

  api.get('/auth/me', async (req, res) => {
    const { user, csrfToken } = authOf(req);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect });
    res.json({ data: { user: toUser(row), csrfToken } });
  });

  // ---------- users ----------
  api.get('/users', async (req, res) => {
    res.json({ data: await users.listTeam(authOf(req).user, req.query.active === 'true') });
  });
  api.get('/users/:id', async (req, res) => {
    res.json({ data: await users.getTeamMember(idOf(req.params), authOf(req).user) });
  });
  /** A person's work history: their own, or anyone's for a manager. */
  api.get('/users/:id/insights', async (req, res) => {
    res.json({ data: await users.getInsights(idOf(req.params), authOf(req).user) });
  });
  api.post('/users', requireRole('MANAGER'), async (req, res) => {
    const input = parse(createUserSchema, req.body);
    res.status(201).json({ data: await users.createUser(input, authOf(req).user) });
  });
  /** Permanently closes a deactivated account; its work history keeps the person's name. */
  api.delete('/users/:id', requireRole('MANAGER'), async (req, res) => {
    const { confirmName } = parse(deleteUserSchema, req.body);
    await users.deleteUser(idOf(req.params), confirmName, authOf(req).user);
    res.status(204).end();
  });
  /** Issues a one-time temporary password; the response is the only place it ever appears. */
  api.post('/users/:id/reset-password', requireRole('MANAGER'), async (req, res) => {
    res.json({ data: await users.resetPassword(idOf(req.params), authOf(req).user) });
  });
  api.patch('/users/:id', requireRole('MANAGER'), async (req, res) => {
    const { isActive } = parse(updateUserSchema, req.body);
    res.json({ data: await users.setActive(idOf(req.params), isActive, authOf(req).user) });
  });

  // ---------- requests ----------
  api.get('/requests', async (req, res) => {
    res.json({
      data: await requests.listRequests(
        parse(listRequestsQuerySchema, req.query),
        authOf(req).user,
      ),
    });
  });
  api.post('/requests', async (req, res) => {
    const { request, created } = await requests.createRequest(
      parse(createRequestSchema, req.body),
      authOf(req).user,
    );
    res.status(created ? 201 : 200).json({ data: request });
  });
  api.get('/requests/:id', async (req, res) => {
    res.json({ data: await requests.getRequest(idOf(req.params), authOf(req).user) });
  });
  api.patch('/requests/:id', async (req, res) => {
    const input = parse(updateRequestSchema, req.body);
    res.json({ data: await requests.updateRequest(idOf(req.params), input, authOf(req).user) });
  });
  api.patch('/requests/:id/status', async (req, res) => {
    const input = parse(statusChangeSchema, req.body);
    res.json({ data: await requests.changeStatus(idOf(req.params), input, authOf(req).user) });
  });
  api.patch('/requests/:id/assignment', async (req, res) => {
    const input = parse(assignmentSchema, req.body);
    res.json({ data: await requests.assignRequest(idOf(req.params), input, authOf(req).user) });
  });

  // ---------- notes ----------
  api.get('/requests/:id/notes', async (req, res) => {
    const { id } = await requests.requireVisible(idOf(req.params), authOf(req).user);
    const rows = await prisma.requestNote.findMany({
      where: { requestId: id },
      include: noteInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    res.json({ data: rows.map(toNote) });
  });
  api.post('/requests/:id/notes', async (req, res) => {
    const { user } = authOf(req);
    const request = await requests.requireVisible(idOf(req.params), user);
    if (!canWorkOn(user, request))
      throw forbidden('You can only add notes to requests assigned to you');
    const { content } = parse(noteSchema, req.body);
    const note = await prisma.requestNote.create({
      data: { requestId: request.id, authorId: user.id, content },
      include: noteInclude,
    });
    res.status(201).json({ data: toNote(note) });
  });

  // ---------- activity ----------
  api.get('/requests/:id/activity', async (req, res) => {
    const { id } = await requests.requireVisible(idOf(req.params), authOf(req).user);
    const rows = await prisma.activityLog.findMany({
      where: { requestId: id },
      include: activityInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    res.json({ data: rows.map(toActivity) });
  });
  api.get('/activity', async (req, res) => {
    const { limit } = parse(activityQuerySchema, req.query);
    const rows = await prisma.activityLog.findMany({
      where: { request: requests.visibleWhere(authOf(req).user) },
      include: activityInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    res.json({ data: rows.map(toActivity) });
  });

  // ---------- analytics (managers) ----------
  api.get('/analytics', requireRole('MANAGER'), async (req, res) => {
    const { range } = parse(analyticsQuerySchema, req.query);
    res.json({ data: await getAnalytics(range) });
  });

  // ---------- dashboard ----------
  // Every number is counted over what the caller can see, so each card matches the list it opens.
  api.get('/dashboard', async (req, res) => {
    const { user } = authOf(req);
    const me = user.id;
    const visible = requests.visibleWhere(user);
    const within = (where: Prisma.RequestWhereInput) => ({ AND: [visible, where] });
    const [byStatus, mine, unassigned, byPriority, overdue] = await Promise.all([
      prisma.request.groupBy({ by: ['status'], where: visible, _count: { _all: true } }),
      prisma.request.groupBy({
        by: ['status'],
        where: { assignedToId: me },
        _count: { _all: true },
      }),
      prisma.request.count({
        where: within({ assignedToId: null, status: { not: 'RESOLVED' } }),
      }),
      prisma.request.groupBy({
        by: ['priority'],
        where: within({ status: { not: 'RESOLVED' } }),
        _count: { _all: true },
      }),
      prisma.request.count({
        where: within({ status: { not: 'RESOLVED' }, dueAt: { lt: new Date() } }),
      }),
    ]);
    const count = (groups: { status: string; _count: { _all: number } }[], s: string) =>
      groups.find((g) => g.status === s)?._count._all ?? 0;
    const summary: DashboardSummary = {
      total: byStatus.reduce((n, g) => n + g._count._all, 0),
      open: count(byStatus, 'OPEN'),
      inProgress: count(byStatus, 'IN_PROGRESS'),
      resolved: count(byStatus, 'RESOLVED'),
      unassigned,
      overdue,
      scope: user.role === 'MANAGER' ? 'team' : 'visible',
      mine: {
        open: count(mine, 'OPEN'),
        inProgress: count(mine, 'IN_PROGRESS'),
        resolved: count(mine, 'RESOLVED'),
      },
      byPriority: { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0 },
    };
    for (const g of byPriority) summary.byPriority[g.priority as Priority] = g._count._all;
    res.json({ data: summary });
  });

  return api;
}
