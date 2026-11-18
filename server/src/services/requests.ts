import { Prisma, type ActionType, type Priority } from '@prisma/client';
import {
  canAssign,
  canTransition,
  canChangeStatus,
  canEditDetails,
  formatReference,
  CATEGORY_LABEL,
  ESCALATION_HOURS,
  PRIORITY_LABEL,
  UNCATEGORISED,
  SOURCE_LABEL,
  STATUS_LABEL,
  type AssignmentInput,
  type Page,
  type ServiceRequest,
  type StatusChangeInput,
  type UpdateRequestInput,
  type createRequestSchema,
  type listRequestsQuerySchema,
} from '@deskflow/shared';
import type { z } from 'zod';
import type { AuthUser } from '../auth';
import { prisma, type Tx } from '../db';
import { conflict, forbidden, notFound, rule, staleVersion } from '../lib/errors';
import { requestInclude, toRequest } from '../lib/serialize';
import { evaluateRequest } from '../deadlines/monitor';
import { notifyAssigned } from './notifications';

export const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };

type LogEntry = {
  actionType: ActionType;
  description: string;
  fieldName?: string;
  oldValue?: string | null;
  newValue?: string | null;
};

const log = (tx: Tx, requestId: number, actorId: number, entries: LogEntry[]) =>
  entries.length
    ? tx.activityLog.createMany({ data: entries.map((e) => ({ ...e, requestId, actorId })) })
    : null;

/**
 * What a user may read. Managers: everything. Employees: requests assigned to them or reported
 * by them, plus every resolved request. Mirrors `canSeeRequest` in shared/domain.
 */
export function visibleWhere(user: AuthUser): Prisma.RequestWhereInput {
  if (user.role === 'MANAGER') return {};
  return {
    OR: [{ assignedToId: user.id }, { createdById: user.id }, { status: 'RESOLVED' }],
  };
}

/**
 * Loads a request the user is allowed to see. Anything else is reported as not found, so
 * request ids cannot be used to discover what exists.
 */
async function load(id: number, user: AuthUser, tx: Tx | typeof prisma = prisma) {
  const row = await tx.request.findFirst({
    where: { AND: [{ id }, visibleWhere(user)] },
    include: requestInclude,
  });
  if (!row) throw notFound('Request');
  return row;
}

/** For routes that only need to know the request exists and is visible (notes, activity). */
export async function requireVisible(id: number, user: AuthUser) {
  const row = await prisma.request.findFirst({
    where: { AND: [{ id }, visibleWhere(user)] },
    select: { id: true, assignedToId: true },
  });
  if (!row) throw notFound('Request');
  return row;
}

/**
 * "Nov 20, 2026", plus the time when one was picked ("Nov 20, 2026, 2:00 PM"). A deadline with no
 * time is stored as the last millisecond of the day and shown as the date alone.
 */
const formatDue = (d: Date | null) => {
  if (!d) return null;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const endOfDay = d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59;
  return endOfDay
    ? date
    : `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

/** Only active employees can own requests; managers triage and assign, they don't take work. */
async function activeAssignee(tx: Tx, id: number) {
  const user = await tx.user.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true, role: true },
  });
  if (!user) throw rule('INVALID_ASSIGNEE', 'The selected assignee does not exist');
  if (user.role !== 'EMPLOYEE')
    throw rule('INVALID_ASSIGNEE', 'Managers assign requests but cannot be assigned them');
  if (!user.isActive)
    throw rule('INVALID_ASSIGNEE', `${user.name} is deactivated and cannot be assigned`);
  return user;
}

/** Bumps the version only if nobody else wrote since `version` was read. */
async function writeIfCurrent(
  tx: Tx,
  id: number,
  version: number,
  data: Prisma.RequestUncheckedUpdateManyInput,
) {
  const { count } = await tx.request.updateMany({
    where: { id, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 0) throw staleVersion();
}

// ---------- queries ----------

export async function listRequests(
  query: z.output<typeof listRequestsQuerySchema>,
  user: AuthUser,
): Promise<Page<ServiceRequest>> {
  const { q, status, priority, source, category, assignee, due, sort, order, page, pageSize } =
    query;
  const filters: Prisma.RequestWhereInput = {
    ...(status && { status }),
    ...(due === 'overdue' && {
      dueAt: { lt: new Date() },
      ...(status ? {} : { status: { not: 'RESOLVED' as const } }),
    }),
    ...(priority && { priority }),
    ...(source && { source }),
    ...(category && { category }),
    ...(assignee !== undefined && {
      assignedToId: assignee === 'me' ? user.id : assignee === 'none' ? null : assignee,
    }),
    ...(q && {
      // SQLite LIKE: case-insensitive for ASCII.
      OR: [
        { referenceNumber: { contains: q } },
        { title: { contains: q } },
        { requesterName: { contains: q } },
        { requesterContact: { contains: q } },
        { description: { contains: q } },
      ],
    }),
  };
  const where: Prisma.RequestWhereInput = { AND: [filters, visibleWhere(user)] };
  const sortKey = sort === 'priority' ? 'priorityRank' : sort === 'referenceNumber' ? 'id' : sort;
  // Requests without a deadline go last whichever way deadlines are sorted.
  const primary: Prisma.RequestOrderByWithRelationInput =
    sortKey === 'dueAt' ? { dueAt: { sort: order, nulls: 'last' } } : { [sortKey]: order };
  const [total, rows] = await prisma.$transaction([
    prisma.request.count({ where }),
    prisma.request.findMany({
      where,
      include: requestInclude,
      orderBy: [primary, { id: order }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    items: rows.map(toRequest),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getRequest(id: number, user: AuthUser) {
  return toRequest(await load(id, user));
}

// ---------- commands ----------

export async function createRequest(
  input: z.output<typeof createRequestSchema>,
  user: AuthUser,
): Promise<{ request: ServiceRequest; created: boolean }> {
  const replay = async () => {
    const existing = await prisma.request.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: requestInclude,
    });
    if (!existing) return null;
    if (existing.createdById !== user.id)
      throw conflict('This submission key was already used', 'DUPLICATE');
    return { request: toRequest(existing), created: false };
  };

  const prior = await replay();
  if (prior) return prior;

  // Employees report requests; the manager reviews them and sets priority, deadline and owner.
  const assigneeId = input.assignedToId ?? null;
  const priority = input.priority ?? 'NORMAL';
  if (
    !canAssign(user) &&
    (assigneeId !== null ||
      priority !== 'NORMAL' ||
      (input.dueAt ?? null) !== null ||
      (input.escalateTo ?? null) !== null)
  ) {
    throw forbidden(
      'New requests from employees go to the manager, who sets the priority, deadline and assignee',
    );
  }
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const escalateTo = input.escalateTo ?? null;

  try {
    const id = await prisma.$transaction(async (tx) => {
      const assignee = assigneeId === null ? null : await activeAssignee(tx, assigneeId);
      const counter = await tx.counter.upsert({
        where: { name: 'request' },
        create: { name: 'request', value: 1 },
        update: { value: { increment: 1 } },
      });
      const { assignedToId: _a, dueAt: _d, escalateTo: _e, ...fields } = input;
      const created = await tx.request.create({
        data: {
          ...fields,
          priority,
          dueAt,
          escalateTo,
          referenceNumber: formatReference(counter.value),
          priorityRank: PRIORITY_RANK[priority],
          assignedToId: assignee?.id ?? null,
          createdById: user.id,
        },
      });
      const entries: LogEntry[] = [
        { actionType: 'CREATED', description: `created ${created.referenceNumber}` },
      ];
      if (dueAt) {
        entries.push({
          actionType: 'DEADLINE_CHANGED',
          fieldName: 'dueAt',
          oldValue: null,
          newValue: formatDue(dueAt),
          description: `set the deadline to ${formatDue(dueAt)}`,
        });
      }
      if (escalateTo) {
        entries.push(escalationEntry(null, escalateTo));
      }
      if (assignee) {
        entries.push({
          actionType: 'ASSIGNED',
          fieldName: 'assignedTo',
          oldValue: null,
          newValue: assignee.name,
          description: `assigned the request to ${assignee.name}`,
        });
      }
      await log(tx, created.id, user.id, entries);
      return created.id;
    });
    await evaluateRequest(id);
    const created = await getRequest(id, user);
    if (created.assignedTo) await notifyAssigned(await dueOf(id), created.assignedTo.id, user.name);
    return { request: created, created: true };
  } catch (err) {
    // Two identical submissions raced past the first check; return the winner.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await replay();
      if (raced) return raced;
    }
    throw err;
  }
}

const EDITABLE = [
  'title',
  'description',
  'requesterName',
  'requesterContact',
  'source',
  'category',
  'priority',
] as const;
const FIELD_LABEL: Record<(typeof EDITABLE)[number], string> = {
  title: 'title',
  description: 'description',
  requesterName: 'requester name',
  requesterContact: 'requester contact',
  source: 'source',
  category: 'category',
  priority: 'priority',
};
const display = (field: (typeof EDITABLE)[number], value: string | null) =>
  value === null
    ? UNCATEGORISED
    : field === 'priority'
      ? PRIORITY_LABEL[value as Priority]
      : field === 'source'
        ? SOURCE_LABEL[value as keyof typeof SOURCE_LABEL]
        : field === 'category'
          ? CATEGORY_LABEL[value as keyof typeof CATEGORY_LABEL]
          : value;

export async function updateRequest(id: number, input: UpdateRequestInput, user: AuthUser) {
  await prisma.$transaction(async (tx) => {
    const current = await load(id, user, tx);
    if (!canEditDetails(user)) throw forbidden('Only managers can edit request details');
    if (current.status === 'RESOLVED')
      throw rule('REQUEST_RESOLVED', 'Reopen the request before editing it');

    const data: Prisma.RequestUncheckedUpdateManyInput = {};
    const entries: LogEntry[] = [];
    for (const field of EDITABLE) {
      const next = input[field];
      if (next === undefined || next === current[field]) continue;
      (data as Record<string, unknown>)[field] = next;
      entries.push({
        actionType: field === 'priority' ? 'PRIORITY_CHANGED' : 'UPDATED',
        fieldName: field,
        oldValue: display(field, current[field]),
        newValue: display(field, next),
        description:
          field === 'priority' || field === 'category'
            ? `changed ${field} from ${display(field, current[field])} to ${display(field, next)}`
            : `updated the ${FIELD_LABEL[field]}`,
      });
    }
    if (input.dueAt !== undefined) {
      const next = input.dueAt === null ? null : new Date(input.dueAt);
      if ((next?.getTime() ?? null) !== (current.dueAt?.getTime() ?? null)) {
        data.dueAt = next;
        // A new deadline is a new situation: reminders may be sent again for it.
        data.deadlineCycle = { increment: 1 };
        const before = formatDue(current.dueAt);
        const after = formatDue(next);
        entries.push({
          actionType: 'DEADLINE_CHANGED',
          fieldName: 'dueAt',
          oldValue: before,
          newValue: after,
          description: !after
            ? 'removed the deadline'
            : before && before !== after
              ? `moved the deadline from ${before} to ${after}`
              : `set the deadline to ${after}`,
        });
      }
    }
    if (input.escalateTo !== undefined && input.escalateTo !== current.escalateTo) {
      data.escalateTo = input.escalateTo;
      entries.push(escalationEntry(current.escalateTo, input.escalateTo));
    }
    if (!entries.length) {
      if (current.version !== input.version) throw staleVersion();
      return;
    }
    if (input.priority) data.priorityRank = PRIORITY_RANK[input.priority];
    await writeIfCurrent(tx, id, input.version, data);
    await log(tx, id, user.id, entries);
  });
  await evaluateRequest(id);
  return getRequest(id, user);
}

export async function changeStatus(
  id: number,
  { status, version }: StatusChangeInput,
  user: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    const current = await load(id, user, tx);
    if (!canChangeStatus(user, current, status)) {
      throw forbidden(
        user.role === 'MANAGER'
          ? 'The assigned employee starts and resolves work. Managers can only reopen resolved requests.'
          : 'You can only change the status of requests assigned to you',
      );
    }
    if (!canTransition(current.status, status)) {
      throw rule(
        'INVALID_TRANSITION',
        `A request cannot move from ${STATUS_LABEL[current.status]} to ${STATUS_LABEL[status]}`,
      );
    }
    if (status === 'IN_PROGRESS') {
      if (current.assignedToId === null) {
        throw rule('ASSIGNEE_REQUIRED', 'Assign the request to someone before starting work on it');
      }
      await activeAssignee(tx, current.assignedToId);
    }

    const resolving = status === 'RESOLVED';
    const reopening = current.status === 'RESOLVED' && status === 'OPEN';
    await writeIfCurrent(tx, id, version, {
      status,
      ...(resolving && { resolvedById: user.id, resolvedAt: new Date() }),
      // Reopened work is monitored again, with fresh reminders; the deadline itself is kept.
      ...(reopening && { resolvedById: null, resolvedAt: null, deadlineCycle: { increment: 1 } }),
    });
    const base = {
      fieldName: 'status',
      oldValue: STATUS_LABEL[current.status],
      newValue: STATUS_LABEL[status],
    };
    await log(tx, id, user.id, [
      resolving
        ? { ...base, actionType: 'RESOLVED', description: 'resolved the request' }
        : reopening
          ? {
              ...base,
              actionType: 'REOPENED',
              description: `reopened the request (previously resolved by ${current.resolvedBy?.name ?? 'unknown'})`,
            }
          : {
              ...base,
              actionType: 'STATUS_CHANGED',
              description: `changed status to ${STATUS_LABEL[status]}`,
            },
    ]);
  });
  await evaluateRequest(id);
  return getRequest(id, user);
}

export async function assignRequest(
  id: number,
  { assignedToId, version }: AssignmentInput,
  user: AuthUser,
) {
  let newOwner: number | null = null;
  await prisma.$transaction(async (tx) => {
    const current = await load(id, user, tx);
    if (!canAssign(user)) throw forbidden('Only managers assign requests');
    if (current.status === 'RESOLVED')
      throw rule('REQUEST_RESOLVED', 'Reopen the request before reassigning it');
    if (current.assignedToId === assignedToId) {
      if (current.version !== version) throw staleVersion();
      return;
    }
    const next = assignedToId === null ? null : await activeAssignee(tx, assignedToId);
    // In progress without an owner is not a valid state, so unassigning drops it back to Open.
    const reopen = next === null && current.status === 'IN_PROGRESS';
    await writeIfCurrent(tx, id, version, { assignedToId, ...(reopen && { status: 'OPEN' }) });

    const prevName = current.assignedTo?.name ?? null;
    const entries: LogEntry[] = [
      next === null
        ? {
            actionType: 'UNASSIGNED',
            fieldName: 'assignedTo',
            oldValue: prevName,
            newValue: null,
            description: `unassigned ${prevName}`,
          }
        : {
            actionType: prevName ? 'REASSIGNED' : 'ASSIGNED',
            fieldName: 'assignedTo',
            oldValue: prevName,
            newValue: next.name,
            description: prevName
              ? `reassigned the request from ${prevName} to ${next.name}`
              : `assigned the request to ${next.name}`,
          },
    ];
    if (reopen) {
      entries.push({
        actionType: 'STATUS_CHANGED',
        fieldName: 'status',
        oldValue: STATUS_LABEL.IN_PROGRESS,
        newValue: STATUS_LABEL.OPEN,
        description: 'moved the request back to Open because it no longer has an assignee',
      });
    }
    await log(tx, id, user.id, entries);
    newOwner = next?.id ?? null;
  });
  await evaluateRequest(id);
  if (newOwner) await notifyAssigned(await dueOf(id), newOwner, user.name);
  return getRequest(id, user);
}

/** What an assignment notification needs about the request. */
const dueOf = (id: number) =>
  prisma.request.findUniqueOrThrow({
    where: { id },
    select: { id: true, referenceNumber: true, title: true, dueAt: true },
  });

function escalationEntry(before: Priority | null, after: Priority | null): LogEntry {
  return {
    actionType: 'UPDATED',
    fieldName: 'escalateTo',
    oldValue: before && PRIORITY_LABEL[before],
    newValue: after && PRIORITY_LABEL[after],
    description: after
      ? `set the working priority to rise to at least ${PRIORITY_LABEL[after]} in the last ${ESCALATION_HOURS} hours`
      : 'turned off the automatic priority change',
  };
}

/** Used when a user is deactivated: release their unresolved work so nothing is stranded. */
export async function releaseAssignments(
  tx: Tx,
  userId: number,
  actorId: number,
  userName: string,
) {
  const owned = await tx.request.findMany({
    where: { assignedToId: userId, status: { not: 'RESOLVED' } },
    select: { id: true, status: true, version: true },
  });
  for (const r of owned) {
    const reopen = r.status === 'IN_PROGRESS';
    await writeIfCurrent(tx, r.id, r.version, {
      assignedToId: null,
      ...(reopen && { status: 'OPEN' }),
    });
    await log(tx, r.id, actorId, [
      {
        actionType: 'UNASSIGNED',
        fieldName: 'assignedTo',
        oldValue: userName,
        newValue: null,
        description: `unassigned ${userName} (account deactivated)`,
      },
      ...(reopen
        ? [
            {
              actionType: 'STATUS_CHANGED' as const,
              fieldName: 'status',
              oldValue: STATUS_LABEL.IN_PROGRESS,
              newValue: STATUS_LABEL.OPEN,
              description: 'moved the request back to Open because it no longer has an assignee',
            },
          ]
        : []),
    ]);
  }
  return owned.length;
}
