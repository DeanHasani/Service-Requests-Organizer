import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createRequest, resetDb, signIn, validRequest, type Client, type Users } from './helpers';

let users: Users;
let mia: Client;
let ann: Client;
let bob: Client;

beforeEach(async () => {
  users = await resetDb();
  [mia, ann, bob] = (await Promise.all(
    ['mia@test.dev', 'ann@test.dev', 'bob@test.dev'].map(signIn),
  )) as [Client, Client, Client];
});

describe('categories', () => {
  it('requires a category when reporting, from employees too', async () => {
    const missing = await ann.post('/api/requests', validRequest({ category: undefined }));
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.category).toEqual(['Choose a category']);
    const ok = await ann.post(
      '/api/requests',
      validRequest({ category: 'ACCESS', priority: undefined }),
    );
    expect(ok.status).toBe(201);
    expect(ok.body.data.category).toBe('ACCESS');
  });

  it('lets a manager correct it, logged, and filters by it', async () => {
    const r = await createRequest(ann, { category: 'OTHER', priority: undefined });
    await createRequest(mia, { category: 'NETWORK' });
    const fix = await mia.patch(`/api/requests/${r.id}`, { category: 'SOFTWARE', version: 0 });
    expect(fix.body.data.category).toBe('SOFTWARE');
    const log = (await mia.get(`/api/requests/${r.id}/activity`)).body.data;
    expect(log.at(-1).description).toBe('changed category from General support to Software');
    expect(
      (await ann.patch(`/api/requests/${r.id}`, { category: 'NETWORK', version: 1 })).status,
    ).toBe(403);
    const list = (await mia.get('/api/requests?category=NETWORK')).body.data.items;
    expect(list.map((x: { category: string }) => x.category)).toEqual(['NETWORK']);
  });

  it('shows old requests without one as uncategorised in history', async () => {
    const r = await createRequest(mia);
    await prisma.request.update({ where: { id: r.id }, data: { category: null } });
    await mia.patch(`/api/requests/${r.id}`, { category: 'HARDWARE', version: 0 });
    const log = (await mia.get(`/api/requests/${r.id}/activity`)).body.data;
    expect(log.at(-1).description).toBe('changed category from Uncategorised to Hardware');
  });
});

describe('analytics', () => {
  it('is for managers only and validates the range', async () => {
    expect((await ann.get('/api/analytics')).status).toBe(403);
    expect((await mia.get('/api/analytics?range=14')).status).toBe(400);
    expect((await mia.get('/api/analytics?range=all')).status).toBe(200);
  });

  it('counts by category, reopens, workload and the weekly trend', async () => {
    const hw = await createRequest(mia, { category: 'HARDWARE', assignedToId: users.ann.id });
    const net = await createRequest(mia, { category: 'NETWORK', assignedToId: users.bob.id });
    await createRequest(mia, { category: 'NETWORK' });
    // Ann resolves the hardware request; the manager reopens it; Ann resolves it again.
    await ann.patch(`/api/requests/${hw.id}/status`, { status: 'RESOLVED', version: 0 });
    await mia.patch(`/api/requests/${hw.id}/status`, { status: 'OPEN', version: 1 });
    await ann.patch(`/api/requests/${hw.id}/status`, { status: 'RESOLVED', version: 2 });
    await prisma.request.update({
      where: { id: net.id },
      data: { dueAt: new Date(Date.now() - 3600_000) },
    });

    const a = (await mia.get('/api/analytics?range=30')).body.data;
    expect(a.summary).toMatchObject({
      created: 3,
      resolved: 1,
      reopenRate: 1,
      openNow: 2,
      overdueNow: 1,
    });
    const row = (c: string) => a.byCategory.find((x: { category: string }) => x.category === c);
    expect(row('NETWORK')).toMatchObject({ created: 2, unresolved: 2, resolved: 0 });
    expect(row('HARDWARE')).toMatchObject({ created: 1, unresolved: 0, resolved: 1 });
    expect(a.byCategory).toHaveLength(6); // every named category, no Uncategorised row
    expect(a.mostReopened).toEqual([
      expect.objectContaining({ reopens: 1, request: expect.objectContaining({ id: hw.id }) }),
    ]);
    const ann_ = a.workload.find((w: { user: { id: number } }) => w.user.id === users.ann.id);
    const bob_ = a.workload.find((w: { user: { id: number } }) => w.user.id === users.bob.id);
    // Two resolutions (one was reopened), so one held.
    expect(ann_).toMatchObject({ active: 0, resolved: 2, held: 1 });
    expect(bob_).toMatchObject({ active: 1, overdue: 1 });
    expect(a.workload.some((w: { user: { id: number } }) => w.user.id === users.gone.id)).toBe(
      false,
    );
    const thisWeek = a.trend.at(-1);
    expect(thisWeek).toMatchObject({ created: 3, resolved: 2 });
    expect(a.trend.length).toBeGreaterThanOrEqual(5);
    void bob;
  });
});

describe('manager insights', () => {
  it('reports the key numbers, status and priority mix for the chosen period', async () => {
    const a = await createRequest(mia, { priority: 'URGENT', assignedToId: users.ann.id });
    await createRequest(mia, { priority: 'LOW' });
    const old = await createRequest(mia, { priority: 'HIGH' });
    // One request from long ago: only "all time" should count it.
    await prisma.request.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    await ann.patch(`/api/requests/${a.id}/status`, { status: 'IN_PROGRESS', version: 0 });

    const week = (await mia.get('/api/analytics?range=7')).body.data;
    expect(week.summary).toMatchObject({
      created: 2,
      openNow: 2,
      inProgressNow: 1,
      unassignedNow: 2,
    });
    const count = (
      rows: { status?: string; priority?: string; count?: number; created?: number }[],
      k: string,
    ) => rows.find((x) => x.status === k || x.priority === k);
    expect(count(week.byStatus, 'IN_PROGRESS')).toMatchObject({ count: 1 });
    expect(count(week.byPriority, 'HIGH')).toMatchObject({ created: 0, openNow: 1 });
    expect(week.trendBucket).toBe('day');
    expect(week.trend).toHaveLength(8);

    const all = (await mia.get('/api/analytics?range=all')).body.data;
    expect(all.summary.created).toBe(3);
    expect(count(all.byPriority, 'HIGH')).toMatchObject({ created: 1 });
    expect(all.trendBucket).toBe('week');
  });

  it('lists unresolved requests with no recent activity', async () => {
    const quiet = await createRequest(mia, { title: 'Gone quiet' });
    await createRequest(mia, { title: 'Fresh' });
    const longAgo = new Date(Date.now() - 9 * 86_400_000);
    await prisma.request.update({ where: { id: quiet.id }, data: { updatedAt: longAgo } });
    await prisma.activityLog.updateMany({
      where: { requestId: quiet.id },
      data: { createdAt: longAgo },
    });

    const { stale } = (await mia.get('/api/analytics?range=30')).body.data;
    expect(stale).toMatchObject({ thresholdDays: 5, count: 1 });
    expect(stale.items[0]).toMatchObject({ request: { title: 'Gone quiet' }, daysIdle: 9 });

    // A note counts as activity.
    await mia.post(`/api/requests/${quiet.id}/notes`, { content: 'Chased the supplier' });
    expect((await mia.get('/api/analytics?range=30')).body.data.stale.count).toBe(0);
  });

  it('shows success rates only with enough resolutions, in name order, with no deactivated people', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await createRequest(mia, { category: 'NETWORK', assignedToId: users.ann.id });
      await ann.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });
    }
    const r = await createRequest(mia, { assignedToId: users.bob.id });
    await bob.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });

    const a = (await mia.get('/api/analytics?range=30')).body.data;
    expect(a.minSample).toBe(3);
    expect(a.workload.map((w: { user: { name: string } }) => w.user.name)).toEqual([
      'Ann Employee',
      'Bob Employee',
    ]);
    const [annRow, bobRow] = a.workload;
    expect(annRow).toMatchObject({ resolved: 3, held: 3, successRate: 1 });
    expect(annRow.topCategories[0]).toEqual({ category: 'NETWORK', resolved: 3 });
    expect(bobRow).toMatchObject({ resolved: 1, successRate: null });
  });

  it('handles an empty database without errors or made-up numbers', async () => {
    const a = (await mia.get('/api/analytics?range=7')).body.data;
    expect(a.summary).toMatchObject({
      created: 0,
      resolved: 0,
      avgResolveHours: null,
      reopenRate: null,
    });
    expect(a.stale.count).toBe(0);
    expect(a.workload.every((w: { successRate: null }) => w.successRate === null)).toBe(true);
  });
});
