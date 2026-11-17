import { CATEGORIES, type Analytics, type AnalyticsRange, type Category } from '@deskflow/shared';
import { prisma } from '../db';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** "All time" trends stop at half a year so the chart stays readable. */
const MAX_WEEKS = 26;

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) =>
  xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round1(s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2);
};

/** Monday 00:00 (server local time) of the week `d` falls in. */
function weekStart(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/**
 * Team-wide numbers for managers. Everything is computed from the requests and their history,
 * so "resolved" counts each time someone resolved a request (deduplicated per request in the
 * window), and reopened work is still credited to whoever resolved it first.
 */
export async function getAnalytics(range: AnalyticsRange, now = new Date()): Promise<Analytics> {
  const since = range === 'all' ? null : new Date(now.getTime() - Number(range) * DAY);
  const inWindow = (d: Date) => !since || d >= since;

  const [requests, events, employees] = await Promise.all([
    prisma.request.findMany({
      select: {
        id: true,
        referenceNumber: true,
        title: true,
        status: true,
        category: true,
        createdAt: true,
        resolvedAt: true,
        dueAt: true,
        assignedToId: true,
        resolvedById: true,
      },
    }),
    prisma.activityLog.findMany({
      where: { actionType: { in: ['RESOLVED', 'REOPENED'] } },
      select: { requestId: true, actorId: true, actionType: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { role: 'EMPLOYEE', isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const byId = new Map(requests.map((r) => [r.id, r]));
  const open = (r: (typeof requests)[number]) => r.status !== 'RESOLVED';
  const late = (r: (typeof requests)[number]) => open(r) && !!r.dueAt && r.dueAt < now;
  // Hours from logged to resolved, for work resolved in the window and still resolved.
  const hours = (r: (typeof requests)[number]) =>
    (r.resolvedAt!.getTime() - r.createdAt.getTime()) / HOUR;
  const resolvedInWindow = requests.filter(
    (r) => r.status === 'RESOLVED' && r.resolvedAt && inWindow(r.resolvedAt),
  );

  const resolutions = events.filter((e) => e.actionType === 'RESOLVED' && inWindow(e.createdAt));
  const reopens = events.filter((e) => e.actionType === 'REOPENED' && inWindow(e.createdAt));
  const resolvedIds = new Set(resolutions.map((e) => e.requestId));
  const reopenCount = new Map<number, number>();
  for (const e of reopens) reopenCount.set(e.requestId, (reopenCount.get(e.requestId) ?? 0) + 1);

  // ---------- by category ----------
  const keys: (Category | null)[] = [...CATEGORIES, null];
  const byCategory = keys
    .map((category) => {
      const mine = requests.filter((r) => r.category === category);
      const durations = resolvedInWindow.filter((r) => r.category === category).map(hours);
      return {
        category,
        created: mine.filter((r) => inWindow(r.createdAt)).length,
        unresolved: mine.filter(open).length,
        resolved: [...resolvedIds].filter((id) => byId.get(id)?.category === category).length,
        avgResolveHours: avg(durations),
        medianResolveHours: median(durations),
      };
    })
    // Every named category always shows; "Uncategorised" only when it has something.
    .filter((c) => c.category !== null || c.created + c.unresolved + c.resolved > 0)
    .sort((a, b) => b.created - a.created || b.unresolved - a.unresolved);

  // ---------- most reopened ----------
  const mostReopened = [...reopenCount.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, 8)
    .flatMap(([id, n]) => {
      const r = byId.get(id);
      return r
        ? [
            {
              request: {
                id: r.id,
                referenceNumber: r.referenceNumber,
                title: r.title,
                status: r.status,
              },
              category: r.category,
              reopens: n,
            },
          ]
        : [];
    });

  // ---------- workload ----------
  const workload = employees
    .map((u) => {
      const theirs = requests.filter((r) => r.assignedToId === u.id && open(r));
      const resolvedBy = new Set(
        resolutions.filter((e) => e.actorId === u.id).map((e) => e.requestId),
      );
      return {
        user: u,
        active: theirs.length,
        overdue: theirs.filter(late).length,
        resolved: resolvedBy.size,
        avgResolveHours: avg(resolvedInWindow.filter((r) => r.resolvedById === u.id).map(hours)),
      };
    })
    .sort((a, b) => b.active - a.active || b.overdue - a.overdue || b.resolved - a.resolved);

  // ---------- weekly trend ----------
  const earliest = requests.reduce<Date | null>(
    (min, r) => (!min || r.createdAt < min ? r.createdAt : min),
    null,
  );
  let first = weekStart(since ?? earliest ?? now);
  const capped = new Date(weekStart(now).getTime() - (MAX_WEEKS - 1) * WEEK);
  if (first < capped) first = capped;
  const trend: Analytics['trend'] = [];
  for (let w = first; w <= now; w = new Date(w.getTime() + WEEK)) {
    const end = new Date(w.getTime() + WEEK);
    const within = (d: Date) => d >= w && d < end;
    trend.push({
      weekStart: w.toISOString(),
      created: requests.filter((r) => within(r.createdAt)).length,
      resolved: events.filter((e) => e.actionType === 'RESOLVED' && within(e.createdAt)).length,
      avgResolveHours: avg(
        requests
          .filter((r) => r.status === 'RESOLVED' && r.resolvedAt && within(r.resolvedAt))
          .map(hours),
      ),
    });
  }

  const reopenedResolved = [...reopenCount.keys()].length;
  return {
    range: { from: since?.toISOString() ?? null, to: now.toISOString() },
    summary: {
      created: requests.filter((r) => inWindow(r.createdAt)).length,
      resolved: resolvedIds.size,
      avgResolveHours: avg(resolvedInWindow.map(hours)),
      reopenRate: resolvedIds.size
        ? Math.min(1, Math.round((reopenedResolved / resolvedIds.size) * 1000) / 1000)
        : null,
      openNow: requests.filter(open).length,
      overdueNow: requests.filter(late).length,
    },
    byCategory,
    mostReopened,
    workload,
    trend,
  };
}
