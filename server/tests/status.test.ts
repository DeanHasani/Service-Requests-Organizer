import { beforeEach, describe, expect, it } from 'vitest';
import { createRequest, resetDb, signIn, type Client, type Users } from './helpers';

let users: Users;
let mia: Client;
let ann: Client;
let bob: Client;

beforeEach(async () => {
  users = await resetDb();
  mia = await signIn('mia@test.dev');
  ann = await signIn('ann@test.dev');
  bob = await signIn('bob@test.dev');
});

const setStatus = (c: Client, id: number, status: string, version: number) =>
  c.patch(`/api/requests/${id}/status`, { status, version });

/** A request assigned to Ann, already moved to `status` by Ann. Returns id and current version. */
async function assignedToAnn(status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' = 'OPEN') {
  const r = await createRequest(mia, { assignedToId: users.ann.id });
  let version = 0;
  if (status === 'IN_PROGRESS' || status === 'RESOLVED') {
    if (status === 'IN_PROGRESS') await setStatus(ann, r.id, 'IN_PROGRESS', version++);
    else await setStatus(ann, r.id, 'RESOLVED', version++);
  }
  return { id: r.id, version };
}

describe('status lifecycle (the assignee does the work)', () => {
  it('OPEN to IN_PROGRESS to RESOLVED, recording who resolved it and when', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    const started = await setStatus(ann, r.id, 'IN_PROGRESS', 0);
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('IN_PROGRESS');

    const before = Date.now();
    const resolved = await setStatus(ann, r.id, 'RESOLVED', 1);
    expect(resolved.body.data).toMatchObject({
      status: 'RESOLVED',
      resolvedBy: { id: users.ann.id, name: 'Ann Employee' },
    });
    expect(new Date(resolved.body.data.resolvedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('OPEN to RESOLVED directly', async () => {
    const { id } = await assignedToAnn();
    const res = await setStatus(ann, id, 'RESOLVED', 0);
    expect(res.status).toBe(200);
    expect(res.body.data.resolvedBy.name).toBe('Ann Employee');
  });

  it('RESOLVED to OPEN by the manager clears resolution but keeps the history', async () => {
    const { id, version } = await assignedToAnn('RESOLVED');
    const reopened = await setStatus(mia, id, 'OPEN', version);
    expect(reopened.status).toBe(200);
    expect(reopened.body.data).toMatchObject({
      status: 'OPEN',
      resolvedBy: null,
      resolvedAt: null,
    });

    const activity = (await mia.get(`/api/requests/${id}/activity`)).body.data;
    expect(activity.map((a: { actionType: string }) => a.actionType)).toEqual([
      'CREATED',
      'ASSIGNED',
      'RESOLVED',
      'REOPENED',
    ]);
    expect(activity[3]).toMatchObject({ actor: { name: 'Mia Manager' } });
    expect(activity[3].description).toContain('previously resolved by Ann Employee');
  });

  it('lets the assignee reopen their own resolved request', async () => {
    const { id, version } = await assignedToAnn('RESOLVED');
    expect((await setStatus(ann, id, 'OPEN', version)).status).toBe(200);
  });

  it.each([
    ['start work', 'OPEN', 'IN_PROGRESS'],
    ['resolve an open request', 'OPEN', 'RESOLVED'],
    ['resolve work in progress', 'IN_PROGRESS', 'RESOLVED'],
  ] as const)('does not let the manager %s', async (_label, from, to) => {
    const { id, version } = await assignedToAnn(from);
    const res = await setStatus(mia, id, to, version);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Managers can only reopen/);
    expect((await mia.get(`/api/requests/${id}`)).body.data.status).toBe(from);
  });

  it('rejects starting work on a request nobody owns', async () => {
    const r = await createRequest(ann, { priority: undefined });
    expect((await setStatus(ann, r.id, 'IN_PROGRESS', 0)).status).toBe(403);
    expect((await setStatus(mia, r.id, 'IN_PROGRESS', 0)).status).toBe(403);
    expect((await mia.get(`/api/requests/${r.id}`)).body.data.status).toBe('OPEN');
  });

  it("does not let an employee change a colleague's request", async () => {
    const { id } = await assignedToAnn();
    // Bob cannot even see it.
    expect((await setStatus(bob, id, 'IN_PROGRESS', 0)).status).toBe(404);
  });

  it.each([
    ['IN_PROGRESS', 'OPEN'],
    ['RESOLVED', 'IN_PROGRESS'],
    ['OPEN', 'OPEN'],
  ] as const)('rejects %s to %s', async (from, to) => {
    const { id, version } = await assignedToAnn(from);
    const res = await setStatus(ann, id, to, version);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects an unknown status value', async () => {
    const { id } = await assignedToAnn();
    expect((await setStatus(ann, id, 'DONE', 0)).status).toBe(400);
  });

  it('rejects a stale status change', async () => {
    const { id } = await assignedToAnn('IN_PROGRESS');
    const res = await setStatus(ann, id, 'RESOLVED', 0);
    expect(res.status).toBe(409);
  });

  it('blocks editing and reassigning a resolved request until reopened', async () => {
    const { id, version } = await assignedToAnn('RESOLVED');
    const edit = await mia.patch(`/api/requests/${id}`, { title: 'New title', version });
    expect(edit.body.error.code).toBe('REQUEST_RESOLVED');
    const reassign = await mia.patch(`/api/requests/${id}/assignment`, {
      assignedToId: users.bob.id,
      version,
    });
    expect(reassign.status).toBe(422);
  });

  it('logs every status change with actor, old and new value', async () => {
    const { id } = await assignedToAnn();
    await setStatus(ann, id, 'IN_PROGRESS', 0);
    await setStatus(ann, id, 'RESOLVED', 1);
    const activity = (await mia.get(`/api/requests/${id}/activity`)).body.data;
    expect(activity.slice(2)).toEqual([
      expect.objectContaining({
        actionType: 'STATUS_CHANGED',
        actor: { id: users.ann.id, name: 'Ann Employee' },
        oldValue: 'Open',
        newValue: 'In progress',
      }),
      expect.objectContaining({
        actionType: 'RESOLVED',
        oldValue: 'In progress',
        newValue: 'Resolved',
      }),
    ]);
    const global = (await mia.get('/api/activity?limit=1')).body.data;
    expect(global[0]).toMatchObject({ actionType: 'RESOLVED', request: { id } });
  });
});
