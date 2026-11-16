import { Prisma, type ActionType, type Priority } from '@prisma/client';
import {
  canAssign,
  canTransition,
  canWorkOn,
  formatReference,
  PRIORITY_LABEL,
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

async function load(id: number, tx: Tx | typeof prisma = prisma) {
  const row = await tx.request.findUnique({ where: { id }, include: requestInclude });
  if (!row) throw notFound('Request');
  return row;
}

async function activeAssignee(tx: Tx, id: number) {
  const user = await tx.user.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
  if (!user) throw rule('INVALID_ASSIGNEE', 'The selected assignee does not exist');
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
  const { q, status, priority, source, assignee, sort, order, page, pageSize } = query;
  const where: Prisma.RequestWhereInput = {
    ...(status && { status }),
    ...(priority && { priority }),
    ...(source && { source }),
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
  const sortKey = sort === 'priority' ? 'priorityRank' : sort === 'referenceNumber' ? 'id' : sort;
  const [total, rows] = await prisma.$transaction([
    prisma.request.count({ where }),
    prisma.request.findMany({
      where,
      include: requestInclude,
      orderBy: [{ [sortKey]: order }, { id: order }],
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

export async function getRequest(id: number) {
  return toRequest(await load(id));
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

  const assigneeId = input.assignedToId ?? null;
  if (assigneeId !== null && !canAssign(user, { assignedToId: null }, assigneeId)) {
    throw forbidden('Employees can only assign new requests to themselves');
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      const assignee = assigneeId === null ? null : await activeAssignee(tx, assigneeId);
      const counter = await tx.counter.upsert({
        where: { name: 'request' },
        create: { name: 'request', value: 1 },
        update: { value: { increment: 1 } },
      });
      const { assignedToId: _a, ...fields } = input;
      const created = await tx.request.create({
        data: {
          ...fields,
          referenceNumber: formatReference(counter.value),
          priorityRank: PRIORITY_RANK[input.priority],
          assignedToId: assignee?.id ?? null,
          createdById: user.id,
        },
      });
      const entries: LogEntry[] = [
        { actionType: 'CREATED', description: `created ${created.referenceNumber}` },
      ];
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
    return { request: await getRequest(id), created: true };
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
  'priority',
] as const;
const FIELD_LABEL: Record<(typeof EDITABLE)[number], string> = {
  title: 'title',
  description: 'description',
  requesterName: 'requester name',
  requesterContact: 'requester contact',
  source: 'source',
  priority: 'priority',
};
const display = (field: (typeof EDITABLE)[number], value: string) =>
  field === 'priority'
    ? PRIORITY_LABEL[value as Priority]
    : field === 'source'
      ? SOURCE_LABEL[value as keyof typeof SOURCE_LABEL]
      : value;

export async function updateRequest(id: number, input: UpdateRequestInput, user: AuthUser) {
  await prisma.$transaction(async (tx) => {
    const current = await load(id, tx);
    if (!canWorkOn(user, current)) throw forbidden('You can only edit requests assigned to you');
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
          field === 'priority'
            ? `changed priority from ${display(field, current[field])} to ${display(field, next)}`
            : `updated the ${FIELD_LABEL[field]}`,
      });
    }
    if (!entries.length) {
      if (current.version !== input.version) throw staleVersion();
      return;
    }
    if (input.priority) data.priorityRank = PRIORITY_RANK[input.priority];
    await writeIfCurrent(tx, id, input.version, data);
    await log(tx, id, user.id, entries);
  });
  return getRequest(id);
}

export async function changeStatus(
  id: number,
  { status, version }: StatusChangeInput,
  user: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    const current = await load(id, tx);
    if (!canWorkOn(user, current))
      throw forbidden('You can only change the status of requests assigned to you');
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
      ...(reopening && { resolvedById: null, resolvedAt: null }),
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
  return getRequest(id);
}

export async function assignRequest(
  id: number,
  { assignedToId, version }: AssignmentInput,
  user: AuthUser,
) {
  await prisma.$transaction(async (tx) => {
    const current = await load(id, tx);
    if (!canAssign(user, current, assignedToId)) {
      throw forbidden(
        user.role === 'MANAGER'
          ? undefined
          : 'Employees can only claim unassigned requests for themselves',
      );
    }
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
            description:
              next.id === user.id && !prevName
                ? 'claimed the request'
                : prevName
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
  });
  return getRequest(id);
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
