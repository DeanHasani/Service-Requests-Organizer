import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import {
  PRIORITIES,
  type ChangePasswordInput,
  type CreateUserInput,
  type Insights,
  type PasswordReset,
  type Priority,
  type TeamMember,
} from '@deskflow/shared';
import type { AuthUser } from '../auth';
import { endAllSessions } from '../auth';
import { prisma } from '../db';
import { AppError, conflict, notFound, rule } from '../lib/errors';
import {
  activityInclude,
  requestInclude,
  toActivity,
  toRequest,
  toTeamMember,
  toUser,
  userSelect,
} from '../lib/serialize';
import { releaseAssignments, visibleWhere } from './requests';

export const BCRYPT_ROUNDS = 12;

const DAY = 24 * 3600_000;

/**
 * Managers get everyone. Employees get active colleagues only, trimmed to name, role and
 * workload (see `toTeamMember`), so the Team page can show their manager and coworkers.
 */
export async function listTeam(viewer: AuthUser, onlyActive = false): Promise<TeamMember[]> {
  const activeOnly = onlyActive || viewer.role !== 'MANAGER';
  const [users, active, resolved] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, ...(activeOnly && { isActive: true }) },
      select: userSelect,
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    }),
    prisma.request.groupBy({
      by: ['assignedToId'],
      where: { assignedToId: { not: null }, status: { not: 'RESOLVED' } },
      _count: { _all: true },
    }),
    prisma.request.groupBy({
      by: ['resolvedById'],
      where: { resolvedById: { not: null }, status: 'RESOLVED' },
      _count: { _all: true },
    }),
  ]);
  const activeBy = new Map(active.map((g) => [g.assignedToId, g._count._all]));
  const resolvedBy = new Map(resolved.map((g) => [g.resolvedById, g._count._all]));
  return users.map((u) =>
    toTeamMember(
      u,
      { activeCount: activeBy.get(u.id) ?? 0, resolvedCount: resolvedBy.get(u.id) ?? 0 },
      viewer,
    ),
  );
}

/** Managers may look anyone up; employees only themselves (others are reported as not found). */
function assertCanView(id: number, viewer: AuthUser) {
  if (viewer.role !== 'MANAGER' && viewer.id !== id) throw notFound('User');
}

export async function getTeamMember(id: number, viewer: AuthUser): Promise<TeamMember> {
  assertCanView(id, viewer);
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
  if (!user) throw notFound('User');
  const [activeCount, resolvedCount] = await Promise.all([
    prisma.request.count({ where: { assignedToId: id, status: { not: 'RESOLVED' } } }),
    prisma.request.count({ where: { resolvedById: id, status: 'RESOLVED' } }),
  ]);
  return toTeamMember(user, { activeCount, resolvedCount }, viewer);
}

export async function createUser(input: CreateUserInput, actor: AuthUser) {
  const exists = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (exists) throw conflict('An account with that email already exists', 'EMAIL_TAKEN');
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      // The manager chose it, so the new member replaces it at first sign-in.
      mustChangePassword: true,
    },
    select: { id: true },
  });
  return getTeamMember(user.id, actor);
}

export async function setActive(id: number, isActive: boolean, actor: AuthUser) {
  if (id === actor.id) throw rule('SELF_DEACTIVATION', 'You cannot deactivate your own account');
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, isActive: true, role: true },
    });
    if (!user) throw notFound('User');
    if (user.isActive === isActive) return;
    // Someone must always be able to manage accounts.
    if (!isActive && user.role === 'MANAGER') {
      const others = await tx.user.count({
        where: { role: 'MANAGER', isActive: true, id: { not: id } },
      });
      if (others === 0)
        throw rule('LAST_MANAGER', 'The last active manager account cannot be deactivated');
    }
    await tx.user.update({ where: { id }, data: { isActive } });
    if (!isActive) {
      await tx.session.deleteMany({ where: { userId: id } });
      await releaseAssignments(tx, id, actor.id, user.name);
    }
  });
  return getTeamMember(id, actor);
}

/**
 * Closes a deactivated account for good, for someone who has left. They can never sign in again,
 * they leave every team list and their email is freed for a new account. Their name stays on
 * everything they did, so the history still shows who worked on what.
 */
export async function deleteUser(id: number, confirmName: string, actor: AuthUser) {
  if (id === actor.id) throw rule('SELF_DELETION', 'You cannot delete your own account');
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, isActive: true, role: true },
    });
    if (!user) throw notFound('User');
    if (user.isActive) throw rule('ACCOUNT_ACTIVE', 'Deactivate the account before deleting it');
    if (confirmName.trim().toLowerCase() !== user.name.trim().toLowerCase())
      throw rule('CONFIRM_MISMATCH', `Type ${user.name} exactly to confirm`);
    if (user.role === 'MANAGER') {
      const others = await tx.user.count({
        where: { role: 'MANAGER', isActive: true, deletedAt: null, id: { not: id } },
      });
      if (others === 0) throw rule('LAST_MANAGER', 'The last manager account cannot be deleted');
    }
    // Nothing should still be assigned (deactivation released it), but never strand work.
    await releaseAssignments(tx, id, actor.id, user.name);
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.user.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deletedById: actor.id,
        email: `deleted-${id}-${Date.now()}@deleted.invalid`,
        // An unguessable hash that no password matches.
        passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 4),
        mustChangePassword: false,
      },
    });
  });
}

// ---------- passwords ----------

// No 0/O, 1/l/I: easy to read out loud or type from a note.
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A one-time password like `k7Qm-x3Rt-Pw9d`: 12 random characters, about 69 bits. */
export function generateTemporaryPassword() {
  const group = () =>
    Array.from({ length: 4 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

/**
 * Gives the user a temporary password and signs them out everywhere. They must choose their own
 * password before they can do anything else. Shared by the API and the recovery script.
 */
export async function setTemporaryPassword(userId: number) {
  const temporaryPassword = generateTemporaryPassword();
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS),
      mustChangePassword: true,
    },
  });
  await endAllSessions(userId);
  return temporaryPassword;
}

export async function resetPassword(id: number, actor: AuthUser): Promise<PasswordReset> {
  if (id === actor.id)
    throw rule('SELF_RESET', 'Use “Change password” on your profile to change your own password');
  const user = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
  if (!user) throw notFound('User');
  if (!user.isActive)
    throw rule('ACCOUNT_DISABLED', 'Reactivate this account before resetting its password');
  const temporaryPassword = await setTemporaryPassword(id);
  return { user: await getTeamMember(id, actor), temporaryPassword };
}

/** Changes the caller's own password and signs out every other session they have. */
export async function changePassword(
  user: AuthUser,
  sessionId: string,
  { currentPassword, newPassword }: ChangePasswordInput,
) {
  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!(await bcrypt.compare(currentPassword, row.passwordHash))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Your current password is incorrect', {
      currentPassword: ['Your current password is incorrect'],
    });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      mustChangePassword: false,
    },
    select: userSelect,
  });
  await endAllSessions(user.id, sessionId);
  return toUser(updated);
}

// ---------- insights ----------

export async function getInsights(id: number, viewer: AuthUser): Promise<Insights> {
  const member = await getTeamMember(id, viewer);
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const assigned: Prisma.RequestWhereInput = { assignedToId: id, status: { not: 'RESOLVED' } };

  const [
    byStatus,
    byPriority,
    overdue,
    resolutions,
    resolvedRows,
    created,
    assignmentsLast30Days,
    activeRequests,
    recentlyResolved,
    recentActivity,
  ] = await Promise.all([
    prisma.request.groupBy({ by: ['status'], where: assigned, _count: { _all: true } }),
    prisma.request.groupBy({ by: ['priority'], where: assigned, _count: { _all: true } }),
    prisma.request.count({ where: { ...assigned, dueAt: { lt: new Date(now) } } }),
    // Every time they resolved something, including work later reopened.
    prisma.activityLog.findMany({
      where: { actorId: id, actionType: 'RESOLVED' },
      select: { requestId: true, createdAt: true },
    }),
    prisma.request.findMany({
      where: { resolvedById: id, status: 'RESOLVED' },
      select: { createdAt: true, resolvedAt: true },
    }),
    prisma.request.count({ where: { createdById: id } }),
    prisma.activityLog.count({
      where: {
        actorId: id,
        actionType: { in: ['ASSIGNED', 'REASSIGNED'] },
        createdAt: { gte: since30 },
      },
    }),
    prisma.request.findMany({
      where: assigned,
      include: requestInclude,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { priorityRank: 'desc' }, { id: 'asc' }],
      take: 20,
    }),
    prisma.request.findMany({
      where: { resolvedById: id, status: 'RESOLVED' },
      include: requestInclude,
      orderBy: [{ resolvedAt: 'desc' }, { id: 'desc' }],
      take: 8,
    }),
    prisma.activityLog.findMany({
      where: { actorId: id, request: visibleWhere(viewer) },
      include: activityInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 12,
    }),
  ]);

  // Count each request once, dated by the latest time they resolved it.
  const latest = new Map<number, number>();
  for (const r of resolutions) {
    latest.set(r.requestId, Math.max(latest.get(r.requestId) ?? 0, r.createdAt.getTime()));
  }
  const within = (days: number) => [...latest.values()].filter((t) => t >= now - days * DAY).length;

  const durations = resolvedRows
    .filter((r) => r.resolvedAt)
    .map((r) => r.resolvedAt!.getTime() - r.createdAt.getTime());
  const avgResolveHours = durations.length
    ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length / 3600_000) * 10) / 10
    : null;

  const status = (s: string) => byStatus.find((g) => g.status === s)?._count._all ?? 0;
  const activeByPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<
    Priority,
    number
  >;
  for (const g of byPriority) activeByPriority[g.priority as Priority] = g._count._all;

  return {
    member,
    active: { open: status('OPEN'), inProgress: status('IN_PROGRESS'), overdue },
    activeByPriority,
    resolved: { total: latest.size, last7Days: within(7), last30Days: within(30) },
    avgResolveHours,
    created,
    assignmentsLast30Days,
    activeRequests: activeRequests.map(toRequest),
    recentlyResolved: recentlyResolved.map(toRequest),
    recentActivity: recentActivity.map(toActivity),
  };
}
