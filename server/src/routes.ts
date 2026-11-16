import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import {
  activityQuerySchema,
  assignmentSchema,
  canWorkOn,
  createRequestSchema,
  createUserSchema,
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
import { authOf, endSession, requireAuth, requireCsrf, requireRole, startSession } from './auth';
import { prisma } from './db';
import { AppError, forbidden, notFound, parse } from './lib/errors';
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

// Compared against when the email is unknown, so response time does not reveal which emails exist.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', users.BCRYPT_ROUNDS);

export function apiRouter({ loginLimit }: { loginLimit: number }) {
  const api = Router();
  const idOf = (params: unknown) => parse(idParamSchema, params).id;

  // ---------- auth ----------
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: loginLimit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many sign-in attempts. Try again in 15 minutes.',
        },
      }),
  });

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

  api.use(requireAuth, requireCsrf);

  api.post('/auth/logout', async (req, res) => {
    await endSession(res, authOf(req).sessionId);
    res.status(204).end();
  });

  api.get('/auth/me', async (req, res) => {
    const { user, csrfToken } = authOf(req);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: userSelect });
    res.json({ data: { user: toUser(row), csrfToken } });
  });

  // ---------- users ----------
  api.get('/users', async (req, res) => {
    res.json({ data: await users.listTeam(req.query.active === 'true') });
  });
  api.get('/users/:id', async (req, res) => {
    res.json({ data: await users.getTeamMember(idOf(req.params)) });
  });
  api.post('/users', requireRole('MANAGER'), async (req, res) => {
    res.status(201).json({ data: await users.createUser(parse(createUserSchema, req.body)) });
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
    res.json({ data: await requests.getRequest(idOf(req.params)) });
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
  const requireRequest = async (id: number) => {
    const row = await prisma.request.findUnique({
      where: { id },
      select: { id: true, assignedToId: true },
    });
    if (!row) throw notFound('Request');
    return row;
  };
  api.get('/requests/:id/notes', async (req, res) => {
    const { id } = await requireRequest(idOf(req.params));
    const rows = await prisma.requestNote.findMany({
      where: { requestId: id },
      include: noteInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    res.json({ data: rows.map(toNote) });
  });
  api.post('/requests/:id/notes', async (req, res) => {
    const request = await requireRequest(idOf(req.params));
    const { user } = authOf(req);
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
    const { id } = await requireRequest(idOf(req.params));
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
      include: activityInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    res.json({ data: rows.map(toActivity) });
  });

  // ---------- dashboard ----------
  api.get('/dashboard', async (req, res) => {
    const me = authOf(req).user.id;
    const [byStatus, mine, unassigned, byPriority] = await Promise.all([
      prisma.request.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.request.groupBy({
        by: ['status'],
        where: { assignedToId: me },
        _count: { _all: true },
      }),
      prisma.request.count({ where: { assignedToId: null, status: { not: 'RESOLVED' } } }),
      prisma.request.groupBy({
        by: ['priority'],
        where: { status: { not: 'RESOLVED' } },
        _count: { _all: true },
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
