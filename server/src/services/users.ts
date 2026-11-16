import bcrypt from 'bcryptjs';
import type { CreateUserInput, TeamMember } from '@deskflow/shared';
import type { AuthUser } from '../auth';
import { prisma } from '../db';
import { conflict, notFound, rule } from '../lib/errors';
import { toUser, userSelect } from '../lib/serialize';
import { releaseAssignments } from './requests';

export const BCRYPT_ROUNDS = 12;

export async function listTeam(onlyActive = false): Promise<TeamMember[]> {
  const [users, active, resolved] = await Promise.all([
    prisma.user.findMany({
      where: onlyActive ? { isActive: true } : undefined,
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
  return users.map((u) => ({
    ...toUser(u),
    activeCount: activeBy.get(u.id) ?? 0,
    resolvedCount: resolvedBy.get(u.id) ?? 0,
  }));
}

export async function getTeamMember(id: number): Promise<TeamMember> {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) throw notFound('User');
  const [activeCount, resolvedCount] = await Promise.all([
    prisma.request.count({ where: { assignedToId: id, status: { not: 'RESOLVED' } } }),
    prisma.request.count({ where: { resolvedById: id, status: 'RESOLVED' } }),
  ]);
  return { ...toUser(user), activeCount, resolvedCount };
}

export async function createUser(input: CreateUserInput) {
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
    },
    select: { id: true },
  });
  return getTeamMember(user.id);
}

export async function setActive(id: number, isActive: boolean, actor: AuthUser) {
  if (id === actor.id) throw rule('SELF_DEACTIVATION', 'You cannot deactivate your own account');
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });
    if (!user) throw notFound('User');
    if (user.isActive === isActive) return;
    await tx.user.update({ where: { id }, data: { isActive } });
    if (!isActive) {
      await tx.session.deleteMany({ where: { userId: id } });
      await releaseAssignments(tx, id, actor.id, user.name);
    }
  });
  return getTeamMember(id);
}
