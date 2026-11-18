import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { setActive } from '../src/services/users';
import { app, createRequest, PASSWORD, resetDb, signIn, type Client, type Users } from './helpers';

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

const DAY = 86_400_000;
const login = (email: string, password: string) =>
  request(app).post('/api/auth/login').send({ email, password });

describe('changing your own password', () => {
  it('changes it, keeps this session and signs out every other one', async () => {
    const otherDevice = await signIn('ann@test.dev');
    const res = await ann.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-pass',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: users.ann.id, mustChangePassword: false });
    expect(res.body.data.user.passwordHash).toBeUndefined();

    expect((await ann.get('/api/auth/me')).status).toBe(200);
    expect((await otherDevice.get('/api/auth/me')).status).toBe(401);
    expect((await login('ann@test.dev', PASSWORD)).status).toBe(401);
    expect((await login('ann@test.dev', 'a-brand-new-pass')).status).toBe(200);
  });

  it('rejects a wrong current password with a field error', async () => {
    const res = await ann.post('/api/auth/password', {
      currentPassword: 'not-it',
      newPassword: 'a-brand-new-pass',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.currentPassword).toBeDefined();
    expect((await login('ann@test.dev', PASSWORD)).status).toBe(200);
  });

  it('rejects a short or unchanged new password', async () => {
    for (const newPassword of ['short', PASSWORD]) {
      const res = await ann.post('/api/auth/password', { currentPassword: PASSWORD, newPassword });
      expect(res.status).toBe(400);
      expect(res.body.error.details.newPassword).toBeDefined();
    }
  });
});

describe('signing out everywhere', () => {
  it('ends every session of the caller and nobody else’s', async () => {
    const otherDevice = await signIn('ann@test.dev');
    expect((await ann.post('/api/auth/logout-all')).status).toBe(204);
    expect((await ann.get('/api/auth/me')).status).toBe(401);
    expect((await otherDevice.get('/api/auth/me')).status).toBe(401);
    expect((await bob.get('/api/auth/me')).status).toBe(200);
  });
});

describe('manager password reset', () => {
  it('issues a temporary password that must be replaced before anything else', async () => {
    const res = await mia.post(`/api/users/${users.ann.id}/reset-password`);
    expect(res.status).toBe(200);
    const temp: string = res.body.data.temporaryPassword;
    expect(temp).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(res.body.data.user).toMatchObject({ id: users.ann.id, mustChangePassword: true });

    // Her existing session is gone and the old password no longer works.
    expect((await ann.get('/api/auth/me')).status).toBe(401);
    expect((await login('ann@test.dev', PASSWORD)).status).toBe(401);

    const signedIn = await login('ann@test.dev', temp);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data.user.mustChangePassword).toBe(true);

    const agent = request.agent(app);
    const first = await agent
      .post('/api/auth/login')
      .send({ email: 'ann@test.dev', password: temp });
    const csrf: string = first.body.data.csrfToken;
    expect((await agent.get('/api/requests')).status).toBe(403);
    expect((await agent.get('/api/requests')).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const changed = await agent
      .post('/api/auth/password')
      .set('x-csrf-token', csrf)
      .send({ currentPassword: temp, newPassword: 'ann-picked-this' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.mustChangePassword).toBe(false);
    expect((await agent.get('/api/requests')).status).toBe(200);
  });

  it('is manager-only, not for yourself, and not for deactivated accounts', async () => {
    expect((await ann.post(`/api/users/${users.bob.id}/reset-password`)).status).toBe(403);
    const self = await mia.post(`/api/users/${users.manager.id}/reset-password`);
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe('SELF_RESET');
    const gone = await mia.post(`/api/users/${users.gone.id}/reset-password`);
    expect(gone.status).toBe(422);
    expect((await mia.post('/api/users/999/reset-password')).status).toBe(404);
  });

  it('never deactivates the last active manager', async () => {
    // Only reachable if the acting manager is not the one left; call the service directly.
    const actor = {
      id: users.ann.id,
      name: 'Ann',
      email: 'ann@test.dev',
      role: 'MANAGER' as const,
    };
    await expect(setActive(users.manager.id, false, actor)).rejects.toMatchObject({
      code: 'LAST_MANAGER',
    });
  });
});

describe('what employees can see', () => {
  async function scenario() {
    const annOpen = await createRequest(mia, { title: 'Ann open', assignedToId: users.ann.id });
    const bobOpen = await createRequest(mia, { title: 'Bob open', assignedToId: users.bob.id });
    const queue = await createRequest(mia, { title: 'In the queue' });
    const reported = await createRequest(ann, { title: 'Ann reported', priority: undefined });
    const bobDone = await createRequest(mia, { title: 'Bob done', assignedToId: users.bob.id });
    await bob.patch(`/api/requests/${bobDone.id}/status`, { status: 'RESOLVED', version: 0 });
    await bob.post(`/api/requests/${bobOpen.id}/notes`, { content: 'private progress' });
    return { annOpen, bobOpen, queue, reported, bobDone };
  }

  it('lists their own, what they reported, and everything resolved; managers see all', async () => {
    await scenario();
    const titles = async (c: Client) =>
      ((await c.get('/api/requests?pageSize=100')).body.data.items as { title: string }[])
        .map((r) => r.title)
        .sort();
    expect(await titles(ann)).toEqual(['Ann open', 'Ann reported', 'Bob done']);
    expect(await titles(mia)).toHaveLength(5);
  });

  it('reports hidden requests, their notes and activity as not found', async () => {
    const { bobOpen, queue, bobDone } = await scenario();
    for (const id of [bobOpen.id, queue.id]) {
      expect((await ann.get(`/api/requests/${id}`)).status).toBe(404);
      expect((await ann.get(`/api/requests/${id}/notes`)).status).toBe(404);
      expect((await ann.get(`/api/requests/${id}/activity`)).status).toBe(404);
    }
    expect((await ann.get(`/api/requests/${bobDone.id}`)).status).toBe(200);
  });

  it('keeps search and filters inside what they can see', async () => {
    await scenario();
    const res = await ann.get('/api/requests?q=open&pageSize=100');
    expect(res.body.data.items.map((r: { title: string }) => r.title)).toEqual(['Ann open']);
    const none = await ann.get('/api/requests?assignee=none');
    expect(none.body.data.items.map((r: { title: string }) => r.title)).toEqual(['Ann reported']);
  });

  it('only shows activity on visible requests in the feed and counts only visible work', async () => {
    await scenario();
    const feed = (await ann.get('/api/activity?limit=100')).body.data as {
      request: { title: string };
    }[];
    expect(new Set(feed.map((a) => a.request.title))).toEqual(
      new Set(['Ann open', 'Ann reported', 'Bob done']),
    );
    const dash = (await ann.get('/api/dashboard')).body.data;
    expect(dash).toMatchObject({ total: 3, resolved: 1, scope: 'visible' });
    expect((await mia.get('/api/dashboard')).body.data).toMatchObject({ total: 5, scope: 'team' });
  });
});

describe('team view by role', () => {
  it('gives employees active colleagues without emails, and managers everything', async () => {
    const forAnn = (await ann.get('/api/users')).body.data as {
      id: number;
      email: string | null;
    }[];
    expect(forAnn.map((u) => u.id).sort()).toEqual(
      [users.manager.id, users.ann.id, users.bob.id].sort(),
    );
    for (const u of forAnn) {
      expect(u.email).toBe(u.id === users.ann.id ? 'ann@test.dev' : null);
    }
    const forMia = (await mia.get('/api/users')).body.data as { email: string }[];
    expect(forMia).toHaveLength(4);
    expect(forMia.every((u) => u.email)).toBe(true);
  });

  it('lets employees look up only themselves', async () => {
    expect((await ann.get(`/api/users/${users.ann.id}`)).status).toBe(200);
    expect((await ann.get(`/api/users/${users.bob.id}`)).status).toBe(404);
    expect((await ann.get(`/api/users/${users.bob.id}/insights`)).status).toBe(404);
    expect((await mia.get(`/api/users/${users.bob.id}/insights`)).status).toBe(200);
  });
});

describe('deadlines', () => {
  it('lets managers set, move and clear a deadline, each logged', async () => {
    const due = new Date(Date.now() + 3 * DAY).toISOString();
    const r = await createRequest(mia, { dueAt: due });
    expect((await mia.get(`/api/requests/${r.id}`)).body.data.dueAt).toBe(due);

    const later = new Date(Date.now() + 10 * DAY).toISOString();
    expect((await mia.patch(`/api/requests/${r.id}`, { dueAt: later, version: 0 })).status).toBe(
      200,
    );
    expect((await mia.patch(`/api/requests/${r.id}`, { dueAt: null, version: 1 })).status).toBe(
      200,
    );
    const log = (await mia.get(`/api/requests/${r.id}/activity`)).body.data as {
      actionType: string;
      description: string;
    }[];
    const deadline = log.filter((a) => a.actionType === 'DEADLINE_CHANGED');
    expect(deadline).toHaveLength(3);
    expect(deadline[1]!.description).toMatch(/^moved the deadline from /);
    expect(deadline[2]!.description).toBe('removed the deadline');
  });

  it('does not let employees set deadlines on their own work', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    const res = await ann.patch(`/api/requests/${r.id}`, {
      dueAt: new Date(Date.now() + DAY).toISOString(),
      version: 1,
    });
    expect(res.status).toBe(403);
  });

  it('filters overdue work and sorts by deadline with undated requests last', async () => {
    const past = await createRequest(mia, {
      title: 'Late',
      dueAt: new Date(Date.now() - DAY).toISOString(),
    });
    await createRequest(mia, { title: 'Soon', dueAt: new Date(Date.now() + DAY).toISOString() });
    await createRequest(mia, { title: 'Whenever' });
    const overdue = (await mia.get('/api/requests?due=overdue')).body.data.items;
    expect(overdue.map((r: { id: number }) => r.id)).toEqual([past.id]);
    expect((await mia.get('/api/dashboard')).body.data.overdue).toBe(1);

    for (const order of ['asc', 'desc']) {
      const items = (await mia.get(`/api/requests?sort=dueAt&order=${order}`)).body.data.items;
      expect(items.at(-1).title).toBe('Whenever');
    }
  });
});

describe('insights', () => {
  it('summarises what someone is working on and has resolved', async () => {
    const a = await createRequest(mia, { assignedToId: users.ann.id, priority: 'URGENT' });
    const b = await createRequest(mia, {
      assignedToId: users.ann.id,
      dueAt: new Date(Date.now() - DAY).toISOString(),
    });
    await ann.patch(`/api/requests/${a.id}/status`, { status: 'RESOLVED', version: 0 });
    await ann.patch(`/api/requests/${b.id}/status`, { status: 'IN_PROGRESS', version: 0 });

    const mine = (await ann.get(`/api/users/${users.ann.id}/insights`)).body.data;
    expect(mine.active).toEqual({ open: 0, inProgress: 1, overdue: 1 });
    expect(mine.resolved).toEqual({ total: 1, last7Days: 1, last30Days: 1 });
    expect(mine.avgResolveHours).not.toBeNull();
    expect(mine.activeRequests.map((r: { id: number }) => r.id)).toEqual([b.id]);
    expect(mine.recentlyResolved.map((r: { id: number }) => r.id)).toEqual([a.id]);
    expect(mine.recentActivity.length).toBeGreaterThan(0);

    const asManager = (await mia.get(`/api/users/${users.ann.id}/insights`)).body.data;
    expect(asManager.resolved.total).toBe(1);
    const miaOwn = (await mia.get(`/api/users/${users.manager.id}/insights`)).body.data;
    expect(miaOwn.created).toBe(2);
    expect(miaOwn.assignmentsLast30Days).toBe(2);
  });

  it('keeps counting work they resolved even after it was reopened', async () => {
    const a = await createRequest(mia, { assignedToId: users.ann.id });
    await ann.patch(`/api/requests/${a.id}/status`, { status: 'RESOLVED', version: 0 });
    await mia.patch(`/api/requests/${a.id}/status`, { status: 'OPEN', version: 1 });
    const data = (await ann.get(`/api/users/${users.ann.id}/insights`)).body.data;
    expect(data.resolved.total).toBe(1);
    expect(await prisma.request.count({ where: { resolvedById: users.ann.id } })).toBe(0);
  });
});

describe('deleting an account', () => {
  const del = (c: Client, id: number, confirmName: string) =>
    c.agent.delete(`/api/users/${id}`).set('x-csrf-token', c.csrf).send({ confirmName });

  it('only works on a deactivated account, confirmed by name', async () => {
    const active = await del(mia, users.bob.id, 'Bob Employee');
    expect(active.status).toBe(422);
    expect(active.body.error.code).toBe('ACCOUNT_ACTIVE');

    await mia.patch(`/api/users/${users.bob.id}`, { isActive: false });
    const wrong = await del(mia, users.bob.id, 'Bob');
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('CONFIRM_MISMATCH');
    expect((await del(mia, users.bob.id, '  bob employee ')).status).toBe(204);
  });

  it('is manager-only and never for yourself', async () => {
    expect((await del(ann, users.gone.id, 'Gus Gone')).status).toBe(403);
    const self = await del(mia, users.manager.id, 'Mia Manager');
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe('SELF_DELETION');
  });

  it('removes them from the team and sign-in but keeps their name on their work', async () => {
    const r = await createRequest(mia, { assignedToId: users.bob.id });
    await bob.post(`/api/requests/${r.id}/notes`, { content: 'Replaced the cable' });
    await bob.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });

    await mia.patch(`/api/users/${users.bob.id}`, { isActive: false });
    expect((await del(mia, users.bob.id, 'Bob Employee')).status).toBe(204);

    const team = (await mia.get('/api/users')).body.data as { id: number }[];
    expect(team.some((u) => u.id === users.bob.id)).toBe(false);
    expect((await mia.get(`/api/users/${users.bob.id}`)).status).toBe(404);
    expect((await login('bob@test.dev', PASSWORD)).status).toBe(401);
    expect((await del(mia, users.bob.id, 'Bob Employee')).status).toBe(404);

    // History still says who did the work.
    const after = (await mia.get(`/api/requests/${r.id}`)).body.data;
    expect(after.resolvedBy).toEqual({ id: users.bob.id, name: 'Bob Employee' });
    const notes = (await mia.get(`/api/requests/${r.id}/notes`)).body.data;
    expect(notes[0].author.name).toBe('Bob Employee');
    const log = (await mia.get(`/api/requests/${r.id}/activity`)).body.data;
    expect(log.some((a: { actor: { name: string } }) => a.actor.name === 'Bob Employee')).toBe(
      true,
    );

    // The email is free for a new account, and the deletion records who did it.
    const again = await mia.post('/api/users', {
      name: 'Bob Again',
      email: 'bob@test.dev',
      password: 'a-new-password',
      role: 'EMPLOYEE',
    });
    expect(again.status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: users.bob.id } });
    expect(row.deletedById).toBe(users.manager.id);
    expect(row.deletedAt).not.toBeNull();
  });
});
