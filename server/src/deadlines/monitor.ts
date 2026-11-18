/**
 * The deadline monitor. It runs on the server every minute (and at startup), independent of any
 * browser, and is also run for a single request right after it is created, edited, assigned,
 * started, resolved or reopened, so its state is never stale.
 *
 * Everything it knows is stored in the database (deadline state, escalated priority, deadline
 * cycle, notification keys), never in memory, so a restart simply picks up where it left off and
 * running it twice changes nothing the second time.
 */
import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  type AttentionItem,
  type Priority,
} from '@deskflow/shared';
import type { AuthUser } from '../auth';
import { prisma } from '../db';
import { recommend } from '../recommendations/recommend';
import { notifyOnce, type NewNotification } from '../services/notifications';
import { escalationAt, humanDuration, stageAt, stateAt } from './engine';

const select = {
  id: true,
  referenceNumber: true,
  title: true,
  status: true,
  priority: true,
  priorityRank: true,
  escalateTo: true,
  escalatedPriority: true,
  deadlineState: true,
  deadlineCycle: true,
  dueAt: true,
  category: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true, isActive: true } },
} as const;

type Row = Awaited<ReturnType<typeof loadRow>>;
const loadRow = (id: number) => prisma.request.findUnique({ where: { id }, select });

async function activeManagerIds() {
  const managers = await prisma.user.findMany({
    where: { role: 'MANAGER', isActive: true, deletedAt: null },
    select: { id: true },
  });
  return managers.map((m) => m.id);
}

/** Top Smart Assignment suggestion for an unassigned request, if it has a category. */
async function suggestionFor(r: NonNullable<Row>) {
  if (!r.category) return null;
  const recs = await recommend(r.category, r.priority);
  return recs.candidates[0]?.user ?? null;
}

/** The reminders for a stage: who gets what. Keys make each one unique per deadline cycle. */
async function remindersFor(
  r: NonNullable<Row>,
  stage: NonNullable<ReturnType<typeof stageAt>>,
  now: Date,
): Promise<NewNotification[]> {
  const left = r.dueAt!.getTime() - now.getTime();
  const when = left > 0 ? `in ${humanDuration(left)}` : `${humanDuration(left)} ago`;
  const ref = `${r.referenceNumber} "${r.title}"`;
  const owner = r.assignedTo?.isActive ? r.assignedTo : null;
  const key = (who: number) => `deadline:${r.id}:${who}:${stage}:${r.deadlineCycle}`;
  const managers = await activeManagerIds();
  const toManagers = (title: string, message: string, type: NewNotification['type']) =>
    managers.map((id) => ({
      recipientId: id,
      requestId: r.id,
      type,
      stage,
      title,
      message,
      dedupeKey: key(id),
    }));
  const toOwner = (title: string, message: string, type: NewNotification['type']) =>
    owner
      ? [
          {
            recipientId: owner.id,
            requestId: r.id,
            type,
            stage,
            title,
            message,
            dedupeKey: key(owner.id),
          },
        ]
      : [];

  switch (stage) {
    case 'UNASSIGNED': {
      const suggested = await suggestionFor(r);
      const tip = suggested
        ? ` Smart Assignment suggests ${suggested.name}.`
        : r.category
          ? ''
          : ' Set a category to get a suggestion.';
      return toManagers(
        'Due soon and unassigned',
        `${ref} is due ${when} and nobody owns it.${tip}`,
        'DEADLINE_UNASSIGNED',
      );
    }
    case 'NOT_STARTED':
      return [
        ...toOwner(
          'Due soon, not started',
          `${ref} is due ${when}. Start it when you can.`,
          'DEADLINE_NOT_STARTED',
        ),
        ...toManagers(
          'Not started yet',
          `${ref} is assigned to ${owner?.name ?? 'someone'}, due ${when}, and has not been started.`,
          'DEADLINE_NOT_STARTED',
        ),
      ];
    case 'IN_PROGRESS':
      return [
        ...toOwner('Due soon', `${ref} is due ${when}.`, 'DEADLINE_IN_PROGRESS'),
        ...toManagers(
          'Still in progress',
          `${ref} (${owner?.name ?? 'unassigned'}) is due ${when} and is not resolved yet.`,
          'DEADLINE_IN_PROGRESS',
        ),
      ];
    case 'OVERDUE':
      return [
        ...toOwner('Overdue', `${ref} was due ${when}.`, 'DEADLINE_OVERDUE'),
        ...toManagers(
          'Overdue',
          `${ref} (${owner?.name ?? 'unassigned'}) was due ${when} and is not resolved.`,
          'DEADLINE_OVERDUE',
        ),
      ];
  }
}

/**
 * Brings one request up to date at `now`: deadline state, operational priority, history entries
 * and reminders. Safe to run any number of times.
 */
export async function evaluateRequest(id: number, now = new Date()) {
  const r = await loadRow(id);
  if (!r) return { notified: 0 };
  const facts = { ...r, dueAt: r.dueAt };
  const state = stateAt(facts, now);
  const escalated = escalationAt(facts, now);
  const stage = stageAt(facts, now);
  const reminders = stage ? await remindersFor(r, stage, now) : [];

  let notified = 0;
  await prisma.$transaction(async (tx) => {
    const logs: {
      actionType: string;
      description: string;
      fieldName?: string;
      oldValue?: string | null;
      newValue?: string | null;
    }[] = [];
    const data: Record<string, unknown> = {};

    if (state !== r.deadlineState) {
      data.deadlineState = state;
      if (state === 'APPROACHING') {
        logs.push({
          actionType: 'DEADLINE_APPROACHING',
          description: `deadline approaching: due in ${humanDuration(r.dueAt!.getTime() - now.getTime())}`,
        });
      } else if (state === 'OVERDUE') {
        logs.push({
          actionType: 'DEADLINE_OVERDUE',
          description: 'deadline passed without the request being resolved',
        });
      }
    }

    const current: Priority | null = r.escalatedPriority;
    if (escalated !== current) {
      const effective = escalated ?? r.priority;
      data.escalatedPriority = escalated;
      data.escalatedAt = escalated ? now : null;
      data.priorityRank = PRIORITY_ORDER[effective];
      const from = PRIORITY_LABEL[current ?? r.priority];
      const to = PRIORITY_LABEL[effective];
      if (escalated && (!current || PRIORITY_ORDER[escalated] > PRIORITY_ORDER[current])) {
        logs.push({
          actionType: 'PRIORITY_ESCALATED',
          fieldName: 'priority',
          oldValue: from,
          newValue: to,
          description: `raised the working priority from ${from} to ${to} because the deadline is ${state === 'OVERDUE' ? 'past' : 'close'} (original priority ${PRIORITY_LABEL[r.priority]} kept)`,
        });
      } else {
        logs.push({
          actionType: 'PRIORITY_RESTORED',
          fieldName: 'priority',
          oldValue: from,
          newValue: to,
          description: `working priority back to ${to}`,
        });
      }
    }

    // Sorting uses the working priority; keep its rank in step even when only the original
    // priority was edited.
    const rank = PRIORITY_ORDER[escalated ?? r.priority];
    if (rank !== r.priorityRank) data.priorityRank = rank;

    if (Object.keys(data).length) {
      // System bookkeeping: does not bump `version`, so nobody's open edit is invalidated.
      await tx.request.update({ where: { id: r.id }, data });
    }
    if (logs.length) {
      await tx.activityLog.createMany({
        data: logs.map((l) => ({ ...l, requestId: r.id, actorId: null, createdAt: now })) as never,
      });
    }
    for (const n of reminders) if (await notifyOnce(tx, n)) notified++;
  });
  return { notified };
}

/**
 * The scheduled pass: every request that has a deadline and is not settled. Resolved requests
 * are only visited until they are marked COMPLETED with no escalation left.
 */
export async function runDeadlineMonitor(now = new Date()) {
  const due = await prisma.request.findMany({
    where: {
      dueAt: { not: null },
      OR: [
        { status: { not: 'RESOLVED' } },
        { deadlineState: { not: 'COMPLETED' } },
        { deadlineState: null },
        { escalatedPriority: { not: null } },
      ],
    },
    select: { id: true },
  });
  let notified = 0;
  for (const { id } of due) notified += (await evaluateRequest(id, now)).notified;
  // Requests whose deadline was removed but still carry deadline state or an escalation.
  const cleared = await prisma.request.findMany({
    where: {
      dueAt: null,
      OR: [{ deadlineState: { not: null } }, { escalatedPriority: { not: null } }],
    },
    select: { id: true },
  });
  for (const { id } of cleared) await evaluateRequest(id, now);
  return { checked: due.length + cleared.length, notified };
}

/**
 * Needs attention: unresolved requests whose deadline is close or past, worst first. Managers see
 * all of them; employees only their own.
 */
export async function attentionFor(user: AuthUser, now = new Date()): Promise<AttentionItem[]> {
  const rows = await prisma.request.findMany({
    where: {
      dueAt: { not: null },
      status: { not: 'RESOLVED' },
      ...(user.role === 'MANAGER' ? {} : { assignedToId: user.id }),
    },
    select,
  });
  const items: AttentionItem[] = [];
  for (const r of rows) {
    const stage = stageAt(r, now);
    if (!stage) continue;
    const first = r.assignedTo?.name.split(' ')[0];
    const suggested =
      stage === 'UNASSIGNED' && user.role === 'MANAGER' ? await suggestionFor(r) : null;
    const nextAction =
      user.role === 'MANAGER'
        ? {
            UNASSIGNED: suggested
              ? `Assign someone: ${suggested.name} is suggested`
              : r.category
                ? 'Assign someone'
                : `Set a category and assign someone`,
            NOT_STARTED: `Check in with ${first}: not started yet`,
            IN_PROGRESS: `Follow up with ${first} before the deadline`,
            OVERDUE: r.assignedTo
              ? `Talk to ${first}: reassign or move the deadline`
              : 'Assign someone or move the deadline',
          }[stage]
        : {
            UNASSIGNED: '',
            NOT_STARTED: 'Start this request',
            IN_PROGRESS: 'Finish it before the deadline',
            OVERDUE: 'Overdue: finish it or tell your manager',
          }[stage];
    items.push({
      request: {
        id: r.id,
        referenceNumber: r.referenceNumber,
        title: r.title,
        status: r.status,
        priority: r.priority,
        escalatedPriority: escalationAt(r, now),
        dueAt: r.dueAt!.toISOString(),
      },
      assignee: r.assignedTo ? { id: r.assignedTo.id, name: r.assignedTo.name } : null,
      stage,
      msLeft: r.dueAt!.getTime() - now.getTime(),
      nextAction,
      suggested,
    });
  }
  return items.sort((a, b) => a.msLeft - b.msLeft);
}
