import type { Prisma } from '@prisma/client';
import type { Activity, Note, ServiceRequest, TeamMember, User } from '@deskflow/shared';
import type { AuthUser } from '../auth';

const ref = { select: { id: true, name: true } } as const;

export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const requestInclude = {
  assignedTo: ref,
  createdBy: ref,
  resolvedBy: ref,
} satisfies Prisma.RequestInclude;

export const noteInclude = { author: ref } satisfies Prisma.RequestNoteInclude;

export const activityInclude = {
  actor: ref,
  request: { select: { id: true, referenceNumber: true, title: true } },
} satisfies Prisma.ActivityLogInclude;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type RequestRow = Prisma.RequestGetPayload<{ include: typeof requestInclude }>;
type NoteRow = Prisma.RequestNoteGetPayload<{ include: typeof noteInclude }>;
type ActivityRow = Prisma.ActivityLogGetPayload<{ include: typeof activityInclude }>;

export const toUser = (u: UserRow): User => ({ ...u, createdAt: u.createdAt.toISOString() });

/** Managers see everything about a person; employees only see a colleague's name and workload. */
export const toTeamMember = (
  u: UserRow,
  counts: { activeCount: number; resolvedCount: number },
  viewer: AuthUser,
): TeamMember => {
  const full = viewer.role === 'MANAGER' || viewer.id === u.id;
  return {
    ...toUser(u),
    email: full ? u.email : null,
    mustChangePassword: full ? u.mustChangePassword : null,
    ...counts,
  };
};

export const toRequest = (r: RequestRow): ServiceRequest => ({
  id: r.id,
  referenceNumber: r.referenceNumber,
  title: r.title,
  description: r.description,
  requesterName: r.requesterName,
  requesterContact: r.requesterContact,
  source: r.source,
  category: r.category,
  priority: r.priority,
  status: r.status,
  version: r.version,
  assignedTo: r.assignedTo,
  createdBy: r.createdBy,
  resolvedBy: r.resolvedBy,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  dueAt: r.dueAt?.toISOString() ?? null,
  escalateTo: r.escalateTo,
  escalatedAt: r.escalatedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const toNote = (n: NoteRow): Note => ({
  id: n.id,
  requestId: n.requestId,
  author: n.author,
  content: n.content,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
});

export const toActivity = (a: ActivityRow): Activity => ({
  id: a.id,
  request: a.request,
  actor: a.actor,
  actionType: a.actionType,
  fieldName: a.fieldName,
  oldValue: a.oldValue,
  newValue: a.newValue,
  description: a.description,
  createdAt: a.createdAt.toISOString(),
});
