import { beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
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

describe('internal notes', () => {
  it('creates a note with the signed-in user as author', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    const res = await ann.post(`/api/requests/${r.id}/notes`, {
      content: '  Called back, waiting on parts.  ',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      content: 'Called back, waiting on parts.',
      author: { id: users.ann.id, name: 'Ann Employee' },
    });
    const list = await bob.get(`/api/requests/${r.id}/notes`);
    expect(list.body.data).toHaveLength(1);
  });

  it('ignores a client-supplied author', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    const res = await ann.post(`/api/requests/${r.id}/notes`, {
      content: 'hi',
      authorId: users.manager.id,
    });
    expect(res.body.data.author.id).toBe(users.ann.id);
  });

  it('rejects an empty note', async () => {
    const r = await createRequest(mia);
    for (const content of ['', '   ', undefined]) {
      const res = await mia.post(`/api/requests/${r.id}/notes`, { content });
      expect(res.status).toBe(400);
    }
  });

  it('rejects a note on a nonexistent request', async () => {
    expect((await mia.post('/api/requests/999/notes', { content: 'hello' })).status).toBe(404);
    expect((await mia.get('/api/requests/999/notes')).status).toBe(404);
    expect((await mia.get('/api/requests/999/activity')).status).toBe(404);
  });

  it('only lets employees add notes to their own requests', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    expect((await bob.post(`/api/requests/${r.id}/notes`, { content: 'mine now' })).status).toBe(
      403,
    );
    expect(
      (await mia.post(`/api/requests/${r.id}/notes`, { content: 'manager note' })).status,
    ).toBe(201);
  });
});

describe('authorization', () => {
  it('blocks employees from manager-only user management', async () => {
    expect(
      (
        await ann.post('/api/users', {
          name: 'X',
          email: 'x@test.dev',
          password: 'password1',
          role: 'MANAGER',
        })
      ).status,
    ).toBe(403);
    expect((await ann.patch(`/api/users/${users.bob.id}`, { isActive: false })).status).toBe(403);
  });

  it('blocks employees from assigning requests to anyone else', async () => {
    const r = await createRequest(mia);
    const res = await ann.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: users.bob.id,
      version: 0,
    });
    expect(res.status).toBe(403);
  });

  it("blocks employees from taking or changing a colleague's request", async () => {
    const r = await createRequest(mia, { assignedToId: users.bob.id });
    const attempts = [
      ann.patch(`/api/requests/${r.id}`, { title: 'hijack', version: 0 }),
      ann.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 }),
      ann.patch(`/api/requests/${r.id}/assignment`, { assignedToId: users.ann.id, version: 0 }),
      ann.patch(`/api/requests/${r.id}/assignment`, { assignedToId: null, version: 0 }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(403);
    const after = (await mia.get(`/api/requests/${r.id}`)).body.data;
    expect(after).toMatchObject({
      title: 'Printer offline',
      status: 'OPEN',
      version: 0,
      assignedTo: { id: users.bob.id },
    });
  });

  it('blocks employees from editing unassigned requests', async () => {
    const r = await createRequest(mia);
    expect((await ann.patch(`/api/requests/${r.id}`, { title: 'x', version: 0 })).status).toBe(403);
  });

  it('lets employees fully work their own requests', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    expect(
      (await ann.patch(`/api/requests/${r.id}`, { priority: 'URGENT', version: 0 })).status,
    ).toBe(200);
    expect(
      (await ann.patch(`/api/requests/${r.id}/status`, { status: 'IN_PROGRESS', version: 1 }))
        .status,
    ).toBe(200);
  });

  it('ignores a role sent by the client', async () => {
    const res = await ann.post('/api/users', {
      name: 'X',
      email: 'x@test.dev',
      password: 'password1',
      role: 'MANAGER',
      asRole: 'MANAGER',
    });
    expect(res.status).toBe(403);
  });
});

describe('team and accounts', () => {
  it('lists the team with workload counts and no password hashes', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    await createRequest(mia, { assignedToId: users.ann.id });
    await mia.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });
    const res = await ann.get('/api/users');
    const annRow = res.body.data.find((u: { id: number }) => u.id === users.ann.id);
    expect(annRow).toMatchObject({ activeCount: 1, resolvedCount: 0 });
    const miaRow = res.body.data.find((u: { id: number }) => u.id === users.manager.id);
    expect(miaRow.resolvedCount).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('returns 404 for an unknown user', async () => {
    expect((await mia.get('/api/users/999')).status).toBe(404);
  });

  it('lets a manager create a user who can then sign in', async () => {
    const res = await mia.post('/api/users', {
      name: 'New Person',
      email: 'New@Test.dev',
      password: 'correct-horse-9',
      role: 'EMPLOYEE',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('new@test.dev');
    await expect(signIn('new@test.dev')).resolves.toBeDefined();
    const dup = await mia.post('/api/users', {
      name: 'Again',
      email: 'new@test.dev',
      password: 'correct-horse-9',
      role: 'EMPLOYEE',
    });
    expect(dup.status).toBe(409);
  });

  it('deactivation signs the user out and releases their unresolved work', async () => {
    const open = await createRequest(mia, { assignedToId: users.ann.id });
    const busy = await createRequest(mia, { assignedToId: users.ann.id });
    const done = await createRequest(mia, { assignedToId: users.ann.id });
    await ann.patch(`/api/requests/${busy.id}/status`, { status: 'IN_PROGRESS', version: 0 });
    await ann.patch(`/api/requests/${done.id}/status`, { status: 'RESOLVED', version: 0 });

    const res = await mia.patch(`/api/users/${users.ann.id}`, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isActive: false, activeCount: 0 });
    expect((await ann.get('/api/auth/me')).status).toBe(401);

    const [o, b, d] = await Promise.all(
      [open, busy, done].map((r) => mia.get(`/api/requests/${r.id}`)),
    );
    expect(o!.body.data.assignedTo).toBeNull();
    expect(b!.body.data).toMatchObject({ assignedTo: null, status: 'OPEN' });
    expect(d!.body.data.assignedTo.id).toBe(users.ann.id); // history of finished work is kept
  });

  it('prevents a manager from deactivating themselves', async () => {
    const res = await mia.patch(`/api/users/${users.manager.id}`, { isActive: false });
    expect(res.status).toBe(422);
  });

  it('dashboard counts come from the database', async () => {
    await createRequest(mia, { assignedToId: users.ann.id });
    const r = await createRequest(mia);
    await mia.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });
    const res = await ann.get('/api/dashboard');
    expect(res.body.data).toMatchObject({
      total: 2,
      open: 1,
      inProgress: 0,
      resolved: 1,
      unassigned: 0,
      mine: { open: 1, inProgress: 0, resolved: 0 },
    });
  });
});

describe('persistence', () => {
  it('data written through the API survives a fresh database connection', async () => {
    const res = await mia.post('/api/requests', validRequest({ title: 'Survives restart' }));
    await prisma.$disconnect();
    const fresh = new PrismaClient();
    const row = await fresh.request.findUnique({ where: { id: res.body.data.id } });
    await fresh.$disconnect();
    expect(row?.title).toBe('Survives restart');
  });
});
