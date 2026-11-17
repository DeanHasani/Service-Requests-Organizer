import { beforeEach, describe, expect, it } from 'vitest';
import { createRequest, resetDb, signIn, validRequest, type Client, type Users } from './helpers';
import { prisma } from '../src/db';

let users: Users;
let mia: Client;
let ann: Client;

beforeEach(async () => {
  users = await resetDb();
  mia = await signIn('mia@test.dev');
  ann = await signIn('ann@test.dev');
});

describe('request creation', () => {
  it('creates a request that starts OPEN with a reference and a CREATED activity', async () => {
    const res = await mia.post('/api/requests', validRequest());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      referenceNumber: 'SR-000001',
      status: 'OPEN',
      priority: 'HIGH',
      assignedTo: null,
      createdBy: { id: users.manager.id, name: 'Mia Manager' },
      resolvedAt: null,
      version: 0,
    });
    const activity = await mia.get(`/api/requests/${res.body.data.id}/activity`);
    expect(activity.body.data.map((a: { actionType: string }) => a.actionType)).toEqual([
      'CREATED',
    ]);
  });

  it('defaults priority to NORMAL', async () => {
    const { priority: _p, ...body } = validRequest();
    const res = await mia.post('/api/requests', body);
    expect(res.body.data.priority).toBe('NORMAL');
  });

  it('ignores a client-supplied status', async () => {
    const res = await mia.post('/api/requests', validRequest({ status: 'RESOLVED' }));
    expect(res.body.data.status).toBe('OPEN');
  });

  it('rejects missing required fields with per-field errors', async () => {
    const res = await mia.post('/api/requests', { clientRequestId: crypto.randomUUID() });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual(
      ['description', 'requesterContact', 'requesterName', 'source', 'title'].sort(),
    );
  });

  it('rejects whitespace-only fields', async () => {
    const res = await mia.post('/api/requests', validRequest({ title: '   ' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.title).toEqual(['Title is required']);
  });

  it('rejects an invalid priority', async () => {
    const res = await mia.post('/api/requests', validRequest({ priority: 'CRITICAL' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('priority');
  });

  it('rejects an invalid source', async () => {
    const res = await mia.post('/api/requests', validRequest({ source: 'FAX' }));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('source');
  });

  it('rejects a nonexistent assignee', async () => {
    const res = await mia.post('/api/requests', validRequest({ assignedToId: 9999 }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('rejects a deactivated assignee', async () => {
    const res = await mia.post('/api/requests', validRequest({ assignedToId: users.gone.id }));
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/deactivated/);
  });

  it('refuses to make a manager the assignee, on create and on reassignment', async () => {
    const res = await mia.post('/api/requests', validRequest({ assignedToId: users.manager.id }));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_ASSIGNEE',
      message: 'Managers assign requests but cannot be assigned them',
    });
    const r = await createRequest(mia);
    const assign = await mia.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: users.manager.id,
      version: 0,
    });
    expect(assign.status).toBe(422);
    expect((await mia.get(`/api/requests/${r.id}`)).body.data.assignedTo).toBeNull();
  });

  it('records the initial assignment', async () => {
    const res = await mia.post('/api/requests', validRequest({ assignedToId: users.ann.id }));
    expect(res.body.data.assignedTo).toEqual({ id: users.ann.id, name: 'Ann Employee' });
    const activity = await mia.get(`/api/requests/${res.body.data.id}/activity`);
    expect(activity.body.data[1]).toMatchObject({
      actionType: 'ASSIGNED',
      newValue: 'Ann Employee',
    });
  });

  it('sends employee requests to the manager: open, unassigned, normal, no deadline', async () => {
    const res = await ann.post('/api/requests', validRequest({ priority: undefined }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'OPEN',
      assignedTo: null,
      priority: 'NORMAL',
      dueAt: null,
      createdBy: { id: users.ann.id },
    });
    // Sending Normal explicitly is fine; it is the default anyway.
    expect((await ann.post('/api/requests', validRequest({ priority: 'NORMAL' }))).status).toBe(
      201,
    );
  });

  it('refuses priority, deadline or assignee from an employee', async () => {
    for (const extra of [
      { assignedToId: users.ann.id },
      { assignedToId: users.bob.id },
      { priority: 'URGENT' },
      { priority: undefined, dueAt: new Date(Date.now() + 86_400_000).toISOString() },
    ]) {
      const res = await ann.post('/api/requests', validRequest(extra));
      expect(res.status).toBe(403);
    }
    expect(await prisma.request.count()).toBe(0);
  });

  it('generates unique sequential references, even under concurrent creates', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => mia.post('/api/requests', validRequest())),
    );
    const refs = results.map((r) => r.body.data.referenceNumber).sort();
    expect(new Set(refs).size).toBe(8);
    expect(refs[0]).toBe('SR-000001');
    expect(refs[7]).toBe('SR-000008');
  });

  it('treats a repeated submission key as the same request', async () => {
    const body = validRequest();
    const first = await mia.post('/api/requests', body);
    const again = await mia.post('/api/requests', body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    const list = await mia.get('/api/requests');
    expect(list.body.data.total).toBe(1);
  });

  it('handles simultaneous duplicate submissions', async () => {
    const body = validRequest();
    const results = await Promise.all([
      mia.post('/api/requests', body),
      mia.post('/api/requests', body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect((await mia.get('/api/requests')).body.data.total).toBe(1);
  });
});

describe('request management', () => {
  it('retrieves a request by id', async () => {
    const created = await createRequest(mia, { assignedToId: users.ann.id });
    const res = await ann.get(`/api/requests/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Printer offline');
  });

  it('returns 404 for a missing request and 400 for an invalid id', async () => {
    expect((await mia.get('/api/requests/999')).status).toBe(404);
    expect((await mia.get('/api/requests/abc')).status).toBe(400);
    expect((await mia.get('/api/requests/-1')).status).toBe(400);
  });

  it('edits fields and logs one activity per changed field', async () => {
    const created = await createRequest(mia, { priority: 'LOW' });
    const res = await mia.patch(`/api/requests/${created.id}`, {
      title: 'Printer offline (finance)',
      priority: 'URGENT',
      description: 'The 2nd floor printer shows offline.', // unchanged, so no activity
      version: 0,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: 'Printer offline (finance)',
      priority: 'URGENT',
      version: 1,
    });
    const activity = (await mia.get(`/api/requests/${created.id}/activity`)).body.data;
    expect(activity.slice(1)).toEqual([
      expect.objectContaining({
        actionType: 'UPDATED',
        fieldName: 'title',
        oldValue: 'Printer offline',
      }),
      expect.objectContaining({
        actionType: 'PRIORITY_CHANGED',
        oldValue: 'Low',
        newValue: 'Urgent',
      }),
    ]);
  });

  it('rejects an edit with nothing to change', async () => {
    const created = await createRequest(mia);
    const res = await mia.patch(`/api/requests/${created.id}`, { version: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects a stale edit with 409 so concurrent changes are not overwritten', async () => {
    const created = await createRequest(mia);
    await mia.patch(`/api/requests/${created.id}`, { title: 'First edit', version: 0 });
    const res = await mia.patch(`/api/requests/${created.id}`, {
      title: 'Second edit',
      version: 0,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_VERSION');
    expect((await mia.get(`/api/requests/${created.id}`)).body.data.title).toBe('First edit');
  });

  it('returns 404 when editing a missing request', async () => {
    expect((await mia.patch('/api/requests/999', { title: 'New title', version: 0 })).status).toBe(
      404,
    );
  });
});

describe('search, filtering, sorting, pagination', () => {
  beforeEach(async () => {
    await createRequest(mia, {
      title: 'VPN drops',
      priority: 'URGENT',
      source: 'EMAIL',
      assignedToId: users.ann.id,
    });
    await createRequest(mia, { title: 'Printer jam', priority: 'LOW', source: 'PHONE' });
    await createRequest(mia, {
      title: 'New laptop',
      priority: 'HIGH',
      source: 'MESSAGE',
      requesterName: 'Zoe Printer',
    });
    await createRequest(mia, {
      title: 'Email quota',
      priority: 'NORMAL',
      source: 'EMAIL',
      assignedToId: users.bob.id,
    });
  });
  const titles = (res: { body: { data: { items: { title: string }[] } } }) =>
    res.body.data.items.map((r) => r.title);

  it('searches title and requester case-insensitively', async () => {
    // The shared fixture description mentions "printer", so search a word only in titles/requesters.
    expect(titles(await mia.get('/api/requests?q=ZOE')).sort()).toEqual(['New laptop']);
    expect(titles(await mia.get('/api/requests?q=jam')).sort()).toEqual(['Printer jam']);
  });

  it('searches the description too', async () => {
    expect((await mia.get('/api/requests?q=2nd%20FLOOR')).body.data.total).toBe(4);
  });

  it('searches by reference number', async () => {
    expect(titles(await mia.get('/api/requests?q=SR-000003'))).toEqual(['New laptop']);
  });

  it('filters by status, priority, source and assignee', async () => {
    expect(titles(await mia.get('/api/requests?priority=URGENT'))).toEqual(['VPN drops']);
    expect(titles(await mia.get('/api/requests?source=EMAIL&sort=title&order=asc'))).toEqual([
      'Email quota',
      'VPN drops',
    ]);
    expect(titles(await mia.get('/api/requests?assignee=none&sort=title&order=asc'))).toEqual([
      'New laptop',
      'Printer jam',
    ]);
    expect(titles(await ann.get('/api/requests?assignee=me'))).toEqual(['VPN drops']);
    expect(titles(await mia.get(`/api/requests?assignee=${users.bob.id}`))).toEqual([
      'Email quota',
    ]);
    expect((await mia.get('/api/requests?status=RESOLVED')).body.data.total).toBe(0);
  });

  it('sorts by priority by urgency, not alphabetically', async () => {
    expect(titles(await mia.get('/api/requests?sort=priority&order=desc'))).toEqual([
      'VPN drops',
      'New laptop',
      'Email quota',
      'Printer jam',
    ]);
  });

  it('sorts by creation date both ways', async () => {
    expect(titles(await mia.get('/api/requests?sort=createdAt&order=asc'))[0]).toBe('VPN drops');
    expect(titles(await mia.get('/api/requests?sort=createdAt&order=desc'))[0]).toBe('Email quota');
  });

  it('paginates with totals', async () => {
    const p1 = await mia.get('/api/requests?pageSize=3&page=1&sort=createdAt&order=asc');
    const p2 = await mia.get('/api/requests?pageSize=3&page=2&sort=createdAt&order=asc');
    expect(p1.body.data).toMatchObject({ total: 4, totalPages: 2, page: 1, pageSize: 3 });
    expect(p1.body.data.items).toHaveLength(3);
    expect(titles(p2)).toEqual(['Email quota']);
  });

  it('rejects invalid query parameters', async () => {
    expect((await mia.get('/api/requests?status=DONE')).status).toBe(400);
    expect((await mia.get('/api/requests?sort=password')).status).toBe(400);
    expect((await mia.get('/api/requests?pageSize=1000')).status).toBe(400);
  });
});

describe('assignment', () => {
  it('assigns, reassigns and unassigns with matching activity', async () => {
    const r = await createRequest(mia);
    const a = await mia.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: users.ann.id,
      version: 0,
    });
    expect(a.body.data.assignedTo.name).toBe('Ann Employee');
    const b = await mia.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: users.bob.id,
      version: 1,
    });
    expect(b.body.data.assignedTo.name).toBe('Bob Employee');
    const c = await mia.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: null,
      version: 2,
    });
    expect(c.body.data.assignedTo).toBeNull();

    const activity = (await mia.get(`/api/requests/${r.id}/activity`)).body.data;
    expect(
      activity
        .slice(1)
        .map((x: { actionType: string; oldValue: string | null; newValue: string | null }) => [
          x.actionType,
          x.oldValue,
          x.newValue,
        ]),
    ).toEqual([
      ['ASSIGNED', null, 'Ann Employee'],
      ['REASSIGNED', 'Ann Employee', 'Bob Employee'],
      ['UNASSIGNED', 'Bob Employee', null],
    ]);
  });

  it('refuses to assign a deactivated user', async () => {
    const r = await createRequest(mia);
    const res = await mia.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: users.gone.id,
      version: 0,
    });
    expect(res.status).toBe(422);
  });

  it('moves an in-progress request back to OPEN when unassigned', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    await ann.patch(`/api/requests/${r.id}/status`, { status: 'IN_PROGRESS', version: 0 });
    const res = await mia.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: null,
      version: 1,
    });
    expect(res.body.data.status).toBe('OPEN');
  });

  it('does not let employees claim work: the manager assigns it', async () => {
    const r = await createRequest(ann, { priority: undefined });
    const res = await ann.patch(`/api/requests/${r.id}/assignment`, {
      assignedToId: users.ann.id,
      version: 0,
    });
    expect(res.status).toBe(403);
    expect((await mia.get(`/api/requests/${r.id}`)).body.data.assignedTo).toBeNull();
  });
});

describe('field validation', () => {
  it.each([
    ['title', 'ab', 'Title needs at least 3 characters'],
    ['requesterName', 'A', 'Requester name needs at least 2 characters'],
    ['description', 'too short', 'Description needs at least 10 characters'],
    ['requesterContact', 'laura@', 'Enter a valid email address, like name@company.com'],
    ['requesterContact', '12345', 'A phone number has 6 to 15 digits'],
    ['requesterContact', '+383 44 abc', 'A phone number has 6 to 15 digits'],
    ['requesterContact', 'ext. 1', 'An extension is 2 to 6 digits'],
    ['requesterContact', 'Teams message', 'A phone number has 6 to 15 digits'],
  ])('rejects %s = %j', async (field, value, message) => {
    const res = await mia.post('/api/requests', validRequest({ [field]: value }));
    expect(res.status).toBe(400);
    expect(res.body.error.details[field]).toEqual([message]);
  });

  it.each(['laura@example.com', '+383 44 218 905', '044218905', 'ext. 214'])(
    'accepts the contact %j',
    async (requesterContact) => {
      expect((await mia.post('/api/requests', validRequest({ requesterContact }))).status).toBe(
        201,
      );
    },
  );

  it('applies the same rules when editing', async () => {
    const r = await createRequest(mia);
    const res = await mia.patch(`/api/requests/${r.id}`, {
      requesterContact: 'call me',
      version: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.requesterContact).toEqual(['A phone number has 6 to 15 digits']);
  });
});
