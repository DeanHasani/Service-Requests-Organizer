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
    expect(log.at(-1).description).toBe('changed category from Other to Software');
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
    expect((await mia.get('/api/analytics?range=7')).status).toBe(400);
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
    expect(ann_).toMatchObject({ active: 0, resolved: 1 });
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
