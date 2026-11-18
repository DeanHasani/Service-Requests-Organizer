/**
 * Gathers the real history smart assignment needs (who resolved what, how long it took, whether
 * it held) and hands it to the pure scoring in `score.ts`. Nothing here is estimated or invented:
 * every number comes from the request and activity tables.
 */
import type { Category, Priority, Recommendations } from '@deskflow/shared';
import { prisma } from '../db';
import { notFound, rule } from '../lib/errors';
import { RECOMMENDATION_CONFIG } from './config';
import { basisOf, scoreCandidates, type CandidateStats } from './score';

const HOUR = 3600_000;

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type Resolution = {
  actorId: number;
  category: Category | null;
  priority: Priority;
  hours: number;
  held: boolean;
};

/**
 * Every resolution ever made, with how long it took and whether it held. A resolution "held" if
 * the request was not reopened afterwards. Time is measured from when the request was logged, or
 * from the reopen that started this round of work.
 */
async function loadResolutions(): Promise<Resolution[]> {
  const events = await prisma.activityLog.findMany({
    where: { actionType: { in: ['RESOLVED', 'REOPENED'] } },
    select: {
      requestId: true,
      actorId: true,
      actionType: true,
      createdAt: true,
      request: { select: { category: true, priority: true, createdAt: true } },
    },
    orderBy: [{ requestId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const out: Resolution[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    // Resolutions are always done by a person; automatic events have no actor.
    if (e.actionType !== 'RESOLVED' || e.actorId === null) continue;
    const prev = events[i - 1];
    const next = events[i + 1];
    const sameRequest = (x: typeof e | undefined) => x && x.requestId === e.requestId;
    const startedAt =
      sameRequest(prev) && prev!.actionType === 'REOPENED' ? prev!.createdAt : e.request.createdAt;
    out.push({
      actorId: e.actorId,
      category: e.request.category,
      priority: e.request.priority,
      hours: Math.max(0, (e.createdAt.getTime() - startedAt.getTime()) / HOUR),
      held: !(sameRequest(next) && next!.actionType === 'REOPENED'),
    });
  }
  return out;
}

/** Suggestions for a request with this category and priority. */
export async function recommend(
  category: Category,
  priority: Priority,
  now = new Date(),
): Promise<Recommendations> {
  const [resolutions, employees, open] = await Promise.all([
    loadResolutions(),
    prisma.user.findMany({
      where: { role: 'EMPLOYEE', isActive: true, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.request.findMany({
      where: { status: { not: 'RESOLVED' }, assignedToId: { not: null } },
      select: { assignedToId: true, dueAt: true },
    }),
  ]);

  // Team baselines: typical time per category + priority (falling back to the category), and
  // the share of fixes that hold across the whole team.
  const inCategory = resolutions.filter((r) => r.category === category);
  const typical = (p: Priority) =>
    median(inCategory.filter((r) => r.priority === p).map((r) => r.hours)) ??
    median(inCategory.map((r) => r.hours));
  const typicalByPriority = new Map<Priority, number | null>();
  for (const r of inCategory)
    if (!typicalByPriority.has(r.priority)) typicalByPriority.set(r.priority, typical(r.priority));
  const teamSuccess = resolutions.length
    ? resolutions.filter((r) => r.held).length / resolutions.length
    : RECOMMENDATION_CONFIG.defaultTeamSuccess;

  const stats: CandidateStats[] = employees.map((u) => {
    const mine = open.filter((r) => r.assignedToId === u.id);
    return {
      user: u,
      categoryResolutions: inCategory
        .filter((r) => r.actorId === u.id)
        .map((r) => ({
          held: r.held,
          hours: r.hours,
          teamMedianHours: typicalByPriority.get(r.priority) ?? null,
        })),
      generalResolved: resolutions.filter((r) => r.actorId === u.id).length,
      active: mine.length,
      overdue: mine.filter((r) => r.dueAt && r.dueAt < now).length,
    };
  });

  const candidates = scoreCandidates(stats, category, teamSuccess);
  return {
    category,
    priority,
    basis: basisOf(candidates[0]),
    candidates,
    teamSample: inCategory.length,
  };
}

/** Suggestions for an existing request; only open, unresolved ones need an owner. */
export async function recommendForRequest(id: number) {
  const request = await prisma.request.findUnique({
    where: { id },
    select: { category: true, priority: true, status: true },
  });
  if (!request) throw notFound('Request');
  if (request.status === 'RESOLVED')
    throw rule('REQUEST_RESOLVED', 'Resolved requests do not need an assignee');
  if (!request.category)
    throw rule('CATEGORY_REQUIRED', 'Set a category on this request to get suggestions');
  return recommend(request.category, request.priority);
}
