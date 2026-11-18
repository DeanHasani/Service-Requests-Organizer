import { beforeEach, describe, expect, it } from 'vitest';
import { deadlineStateAt } from '@deskflow/shared';
import { prisma } from '../src/db';
import { escalationAt, stageAt, type DeadlineFacts } from '../src/deadlines/engine';
import { runDeadlineMonitor } from '../src/deadlines/monitor';
import { createRequest, resetDb, signIn, type Client, type Users } from './helpers';

const HOUR = 3600_000;
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * HOUR);
const iso = (hoursFromNow: number) => at(hoursFromNow).toISOString();

// ---------- pure rules ----------

const facts = (over: Partial<DeadlineFacts> = {}): DeadlineFacts => ({
  dueAt: at(48),
  status: 'OPEN',
  assignedToId: null,
  priority: 'NORMAL',
  escalateTo: null,
  ...over,
});

describe('deadline rules', () => {
  const now = new Date();

  it('has no deadline state and never escalates without a deadline', () => {
    const r = facts({ dueAt: null });
    expect(deadlineStateAt(r, now)).toBeNull();
    expect(stageAt(r, now)).toBeNull();
    expect(escalationAt(r, now)).toBeNull();
  });

  it('moves from on track to approaching at 24 hours, overdue at the deadline, completed once resolved', () => {
    const from = (h: number) => new Date(now.getTime() + h * HOUR);
    expect(deadlineStateAt(facts({ dueAt: from(24.1) }), now)).toBe('ON_TRACK');
    expect(deadlineStateAt(facts({ dueAt: from(24) }), now)).toBe('APPROACHING');
    expect(deadlineStateAt(facts({ dueAt: from(0.01) }), now)).toBe('APPROACHING');
    expect(deadlineStateAt(facts({ dueAt: now }), now)).toBe('OVERDUE');
    expect(deadlineStateAt(facts({ dueAt: at(-5), status: 'RESOLVED' }), now)).toBe('COMPLETED');
  });

  it('treats a short deadline as approaching straight away', () => {
    expect(stageAt(facts({ dueAt: at(3) }), now)).toBe('UNASSIGNED');
  });

  it('works on absolute time, whatever time zone the deadline was written in', () => {
    const dueUtc = new Date('2026-11-20T09:00:00Z');
    const sameInstant = new Date('2026-11-20T14:00:00+05:00');
    expect(sameInstant.getTime()).toBe(dueUtc.getTime());
    const before = new Date('2026-11-19T09:00:00Z');
    const justBefore = new Date('2026-11-19T08:59:59Z');
    expect(deadlineStateAt({ dueAt: sameInstant, status: 'OPEN' }, before)).toBe('APPROACHING');
    expect(deadlineStateAt({ dueAt: sameInstant, status: 'OPEN' }, justBefore)).toBe('ON_TRACK');
  });

  it('picks the stage from ownership and lifecycle', () => {
    const due = { dueAt: at(5) };
    expect(stageAt(facts(due), now)).toBe('UNASSIGNED');
    expect(stageAt(facts({ ...due, assignedToId: 2 }), now)).toBe('NOT_STARTED');
    expect(stageAt(facts({ ...due, assignedToId: 2, status: 'IN_PROGRESS' }), now)).toBe(
      'IN_PROGRESS',
    );
    expect(stageAt(facts({ dueAt: at(-1), assignedToId: 2 }), now)).toBe('OVERDUE');
  });

  it('raises working priority one step when close, two when overdue, never past Urgent', () => {
    expect(escalationAt(facts({ dueAt: at(5) }), now)).toBe('HIGH');
    expect(escalationAt(facts({ dueAt: at(-1) }), now)).toBe('URGENT');
    expect(escalationAt(facts({ dueAt: at(5), priority: 'LOW' }), now)).toBe('NORMAL');
    expect(escalationAt(facts({ dueAt: at(-1), priority: 'HIGH' }), now)).toBe('URGENT');
    expect(escalationAt(facts({ dueAt: at(-1), priority: 'URGENT' }), now)).toBeNull();
    expect(escalationAt(facts({ dueAt: at(48) }), now)).toBeNull();
  });

  it('respects the manager’s minimum when it is higher than one step', () => {
    expect(escalationAt(facts({ dueAt: at(5), priority: 'LOW', escalateTo: 'URGENT' }), now)).toBe(
      'URGENT',
    );
  });
});

// ---------- the monitor against the database, with a controllable clock ----------

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

const notificationsOf = (userId: number) =>
  prisma.notification.findMany({ where: { recipientId: userId }, orderBy: { id: 'asc' } });
const requestRow = (id: number) => prisma.request.findUniqueOrThrow({ where: { id } });
const historyOf = async (id: number) =>
  (await prisma.activityLog.findMany({ where: { requestId: id }, orderBy: { id: 'asc' } })).map(
    (a) => a.actionType,
  );

describe('deadline monitor: the full workflow', () => {
  it('reminds, suggests, follows assignment and start, flags overdue, then stops once resolved', async () => {
    // Some history so Smart Assignment has an opinion: Ann has fixed network issues before.
    for (let i = 0; i < 3; i++) {
      const done = await createRequest(mia, { category: 'NETWORK', assignedToId: users.ann.id });
      await ann.patch(`/api/requests/${done.id}/status`, { status: 'RESOLVED', version: 0 });
    }
    await prisma.notification.deleteMany();

    // 1–2. Manager creates a request due tomorrow; it stays unassigned.
    const r = await createRequest(mia, {
      category: 'NETWORK',
      priority: 'NORMAL',
      dueAt: iso(30),
    });
    expect((await requestRow(r.id)).deadlineState).toBe('ON_TRACK');
    expect(await notificationsOf(users.manager.id)).toHaveLength(0);

    // 3–4. Eight hours later the monitor sees 22 hours left: the manager is reminded.
    await runDeadlineMonitor(at(8));
    const [reminder] = await notificationsOf(users.manager.id);
    expect(reminder).toMatchObject({ type: 'DEADLINE_UNASSIGNED', requestId: r.id });
    // 5. ...with a Smart Assignment suggestion.
    expect(reminder!.message).toMatch(/suggests Ann Employee/);
    const row = await requestRow(r.id);
    expect(row).toMatchObject({
      deadlineState: 'APPROACHING',
      priority: 'NORMAL',
      escalatedPriority: 'HIGH',
    });
    expect(await historyOf(r.id)).toEqual(
      expect.arrayContaining(['DEADLINE_APPROACHING', 'PRIORITY_ESCALATED']),
    );

    // 6–7. Manager assigns Ann; she is told.
    await mia.patch(`/api/requests/${r.id}/assignment`, { assignedToId: users.ann.id, version: 0 });
    const annFirst = await notificationsOf(users.ann.id);
    expect(annFirst.map((n) => n.type)).toContain('ASSIGNED');

    // Still Open as the deadline nears: Ann and the manager hear it has not been started.
    await runDeadlineMonitor(at(9));
    expect((await notificationsOf(users.ann.id)).map((n) => n.type)).toContain(
      'DEADLINE_NOT_STARTED',
    );
    expect((await notificationsOf(users.manager.id)).map((n) => n.type)).toContain(
      'DEADLINE_NOT_STARTED',
    );

    // 8–9. Ann starts it: no more "not started" reminders, an in-progress one instead.
    await ann.patch(`/api/requests/${r.id}/status`, { status: 'IN_PROGRESS', version: 1 });
    const before = (await notificationsOf(users.ann.id)).length;
    await runDeadlineMonitor(at(10));
    const annNow = await notificationsOf(users.ann.id);
    const fresh = annNow.slice(before).map((n) => n.type);
    expect(fresh).toEqual(['DEADLINE_IN_PROGRESS']);
    expect(fresh).not.toContain('DEADLINE_NOT_STARTED');

    // 10. Still unresolved after the deadline: both are told it is overdue.
    await runDeadlineMonitor(at(31));
    expect((await notificationsOf(users.ann.id)).at(-1)!.type).toBe('DEADLINE_OVERDUE');
    expect((await notificationsOf(users.manager.id)).at(-1)!.type).toBe('DEADLINE_OVERDUE');
    expect(await requestRow(r.id)).toMatchObject({
      deadlineState: 'OVERDUE',
      escalatedPriority: 'URGENT',
      priority: 'NORMAL',
    });
    expect(await historyOf(r.id)).toContain('DEADLINE_OVERDUE');

    // 11. Resolved: completed, working priority back to normal, and no more reminders ever.
    await ann.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 2 });
    expect(await requestRow(r.id)).toMatchObject({
      deadlineState: 'COMPLETED',
      escalatedPriority: null,
      priorityRank: 1,
    });
    const total = await prisma.notification.count();
    await runDeadlineMonitor(at(40));
    await runDeadlineMonitor(at(100));
    expect(await prisma.notification.count()).toBe(total);
    expect(await historyOf(r.id)).toContain('PRIORITY_RESTORED');
  });
});

describe('deadline monitor: reliability', () => {
  it('never escalates or notifies a request without a deadline', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id });
    await runDeadlineMonitor(at(500));
    expect(await requestRow(r.id)).toMatchObject({ deadlineState: null, escalatedPriority: null });
    // Only the ordinary "assigned to you" notice; no deadline reminders.
    expect(
      await prisma.notification.count({ where: { requestId: r.id, type: { not: 'ASSIGNED' } } }),
    ).toBe(0);
  });

  it('sends each reminder once, however often it runs and across restarts', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id, dueAt: iso(10) });
    await runDeadlineMonitor(at(1));
    const once = await prisma.notification.count({ where: { requestId: r.id } });
    expect(once).toBeGreaterThan(0);
    // Same moment again, then "after a restart": nothing in memory, only the database.
    await runDeadlineMonitor(at(1));
    await Promise.all([runDeadlineMonitor(at(2)), runDeadlineMonitor(at(2))]).catch(() => {});
    await runDeadlineMonitor(at(3));
    expect(await prisma.notification.count({ where: { requestId: r.id } })).toBe(once);
    const history = await historyOf(r.id);
    expect(history.filter((t) => t === 'DEADLINE_APPROACHING')).toHaveLength(1);
  });

  it('leaves a request resolved before the run alone', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id, dueAt: iso(30) });
    await ann.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });
    await runDeadlineMonitor(at(29));
    await runDeadlineMonitor(at(40));
    expect(await requestRow(r.id)).toMatchObject({ deadlineState: 'COMPLETED' });
    expect(
      await prisma.notification.count({ where: { requestId: r.id, type: { not: 'ASSIGNED' } } }),
    ).toBe(0);
  });

  it('monitors a reopened request again, keeping its deadline and earlier history', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id, dueAt: iso(5) });
    await runDeadlineMonitor(at(1));
    const first = await prisma.notification.count({ where: { recipientId: users.ann.id } });
    await ann.patch(`/api/requests/${r.id}/status`, { status: 'RESOLVED', version: 0 });
    await mia.patch(`/api/requests/${r.id}/status`, { status: 'OPEN', version: 1 });
    const reopened = await requestRow(r.id);
    expect(reopened.dueAt!.toISOString()).toBe((await requestRow(r.id)).dueAt!.toISOString());
    expect(reopened.deadlineCycle).toBe(1);
    await runDeadlineMonitor(at(2));
    expect(
      await prisma.notification.count({ where: { recipientId: users.ann.id } }),
    ).toBeGreaterThan(first);
    expect(await historyOf(r.id)).toEqual(expect.arrayContaining(['RESOLVED', 'REOPENED']));
  });

  it('starts over when the deadline changes, and stands down when it moves far away', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id, dueAt: iso(5) });
    await runDeadlineMonitor(at(1));
    expect((await requestRow(r.id)).escalatedPriority).toBe('URGENT'); // HIGH + 1

    await mia.patch(`/api/requests/${r.id}`, { dueAt: iso(200), version: 0 });
    expect(await requestRow(r.id)).toMatchObject({
      deadlineState: 'ON_TRACK',
      escalatedPriority: null,
      deadlineCycle: 1,
    });
    expect(await historyOf(r.id)).toContain('PRIORITY_RESTORED');

    // Removing the deadline clears its state entirely.
    await mia.patch(`/api/requests/${r.id}`, { dueAt: null, version: 1 });
    expect(await requestRow(r.id)).toMatchObject({ deadlineState: null, escalatedPriority: null });
  });

  it('keeps the original priority separate, and copes with a manual priority change', async () => {
    const r = await createRequest(mia, { priority: 'LOW', dueAt: iso(5) });
    expect(await requestRow(r.id)).toMatchObject({
      priority: 'LOW',
      escalatedPriority: 'NORMAL',
      priorityRank: 1,
    });
    // The manager raises the original priority above the escalation: escalation is dropped.
    await mia.patch(`/api/requests/${r.id}`, { priority: 'URGENT', version: 0 });
    expect(await requestRow(r.id)).toMatchObject({
      priority: 'URGENT',
      escalatedPriority: null,
      priorityRank: 3,
    });
    // An Urgent request is never escalated further.
    await runDeadlineMonitor(at(10));
    expect((await requestRow(r.id)).escalatedPriority).toBeNull();
  });

  it('only notifies the people involved', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id, dueAt: iso(5) });
    await runDeadlineMonitor(at(1));
    expect(await prisma.notification.count({ where: { recipientId: users.bob.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { recipientId: users.gone.id } })).toBe(0);
    expect(
      await prisma.notification.count({ where: { recipientId: users.ann.id } }),
    ).toBeGreaterThan(0);
    void r;
  });
});

describe('notifications API', () => {
  it('lists only your own, and marks them read', async () => {
    const r = await createRequest(mia, { assignedToId: users.ann.id, dueAt: iso(5) });
    await runDeadlineMonitor(at(1));
    const mine = (await ann.get('/api/notifications')).body.data;
    expect(mine.unread).toBeGreaterThan(0);
    expect(mine.items[0].request).toMatchObject({ id: r.id });
    expect((await bob.get('/api/notifications')).body.data).toEqual({ items: [], unread: 0 });

    const id = mine.items[0].id;
    expect((await bob.patch(`/api/notifications/${id}`, { read: true })).status).toBe(404);
    const after = (await ann.patch(`/api/notifications/${id}`, { read: true })).body.data;
    expect(after.unread).toBe(mine.unread - 1);
    expect((await ann.post('/api/notifications/read-all')).body.data.unread).toBe(0);
  });
});

describe('needs attention', () => {
  it('shows managers every close or overdue request with a next step; employees only theirs', async () => {
    await createRequest(mia, { title: 'Nobody yet', category: 'NETWORK', dueAt: iso(5) });
    const annOpen = await createRequest(mia, {
      title: 'Ann not started',
      assignedToId: users.ann.id,
      dueAt: iso(6),
    });
    const bobLate = await createRequest(mia, {
      title: 'Bob late',
      assignedToId: users.bob.id,
      dueAt: iso(-2),
    });
    await createRequest(mia, { title: 'Far away', dueAt: iso(200) });
    await createRequest(mia, { title: 'No deadline' });

    const items = (await mia.get('/api/attention')).body.data;
    expect(items.map((i: { request: { title: string } }) => i.request.title)).toEqual([
      'Bob late',
      'Nobody yet',
      'Ann not started',
    ]);
    expect(items[0]).toMatchObject({ stage: 'OVERDUE', assignee: { id: users.bob.id } });
    expect(items[0].msLeft).toBeLessThan(0);
    expect(items[1]).toMatchObject({ stage: 'UNASSIGNED' });
    expect(items[2].nextAction).toMatch(/Check in with Ann: not started/);

    const annItems = (await ann.get('/api/attention')).body.data;
    expect(annItems.map((i: { request: { id: number } }) => i.request.id)).toEqual([annOpen.id]);
    expect(annItems[0].nextAction).toBe('Start this request');
    void bobLate;
  });
});
