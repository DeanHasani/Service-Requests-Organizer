import { beforeEach, describe, expect, it } from 'vitest';
import { createRequest, resetDb, signIn, type Client, type Users } from './helpers';

let users: Users;
let mia: Client;
let ann: Client;

beforeEach(async () => {
  users = await resetDb();
  mia = await signIn('mia@test.dev');
  ann = await signIn('ann@test.dev');
});

const setStatus = (c: Client, id: number, status: string, version: number) =>
  c.patch(`/api/requests/${id}/status`, { status, version });

describe('status lifecycle', () => {
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
    const r = await createRequest(mia);
    const res = await setStatus(mia, r.id, 'RESOLVED', 0);
    expect(res.status).toBe(200);
    expect(res.body.data.resolvedBy.name).toBe('Mia Manager');
  });

  it('RESOLVED to OPEN clears resolution but keeps the history', async () => {
    const r = await createRequest(mia);
    await setStatus(mia, r.id, 'RESOLVED', 0);
    const reopened = await setStatus(mia, r.id, 'OPEN', 1);
    expect(reopened.body.data).toMatchObject({
      status: 'OPEN',
      resolvedBy: null,
      resolvedAt: null,
    });

    const activity = (await mia.get(`/api/requests/${r.id}/activity`)).body.data;
    expect(activity.map((a: { actionType: string }) => a.actionType)).toEqual([
      'CREATED',
      'RESOLVED',
      'REOPENED',
    ]);
    expect(activity[2].description).toContain('previously resolved by Mia Manager');
  });

  it('rejects IN_PROGRESS without an assignee', async () => {
    const r = await createRequest(mia);
    const res = await setStatus(mia, r.id, 'IN_PROGRESS', 0);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ASSIGNEE_REQUIRED');
    expect((await mia.get(`/api/requests/${r.id}`)).body.data.status).toBe('OPEN');
  });

  it.each([
    ['IN_PROGRESS', 'OPEN'],
    ['RESOLVED', 'IN_PROGRESS'],
    ['OPEN', 'OPEN'],
  ])('rejects %s to %s', async (from, to) => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    let version = 0;
    if (from !== 'OPEN') {
      await setStatus(mia, r.id, from, version++);
    }
    const res = await setStatus(mia, r.id, to, version);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects an unknown status value', async () => {
    const r = await createRequest(mia);
    expect((await setStatus(mia, r.id, 'DONE', 0)).status).toBe(400);
  });

  it('rejects a stale status change', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    await setStatus(mia, r.id, 'IN_PROGRESS', 0);
    const res = await setStatus(ann, r.id, 'RESOLVED', 0);
    expect(res.status).toBe(409);
  });

  it('blocks editing and reassigning a resolved request until reopened', async () => {
    const r = await createRequest(mia);
    await setStatus(mia, r.id, 'RESOLVED', 0);
    expect(
      (await mia.patch(`/api/requests/${r.id}`, { title: 'x', version: 1 })).body.error.code,
    ).toBe('REQUEST_RESOLVED');
    expect(
      (
        await mia.patch(`/api/requests/${r.id}/assignment`, {
          assignedToId: users.ann.id,
          version: 1,
        })
      ).status,
    ).toBe(422);
  });

  it('logs every status change with actor, old and new value', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    await setStatus(ann, r.id, 'IN_PROGRESS', 0);
    await setStatus(ann, r.id, 'RESOLVED', 1);
    const activity = (await mia.get(`/api/requests/${r.id}/activity`)).body.data;
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
    expect(global[0]).toMatchObject({ actionType: 'RESOLVED', request: { id: r.id } });
  });
});
