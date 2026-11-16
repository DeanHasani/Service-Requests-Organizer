export const ROLES = ['MANAGER', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SOURCES = ['PHONE', 'EMAIL', 'MESSAGE', 'OTHER'] as const;
export type Source = (typeof SOURCES)[number];

export const ACTION_TYPES = [
  'CREATED',
  'UPDATED',
  'PRIORITY_CHANGED',
  'ASSIGNED',
  'REASSIGNED',
  'UNASSIGNED',
  'STATUS_CHANGED',
  'RESOLVED',
  'REOPENED',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};
export const SOURCE_LABEL: Record<Source, string> = {
  PHONE: 'Phone',
  EMAIL: 'Email',
  MESSAGE: 'Message',
  OTHER: 'Other',
};
export const ROLE_LABEL: Record<Role, string> = { MANAGER: 'Manager', EMPLOYEE: 'Employee' };

/** Allowed lifecycle moves. Anything not listed is rejected by the server. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['OPEN'],
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function formatReference(n: number): string {
  return `SR-${String(n).padStart(6, '0')}`;
}

type Actor = { id: number; role: Role };
type Owned = { assignedToId: number | null };

/** Edit details, change status, add notes. Managers: any request. Employees: only their own. */
export function canWorkOn(user: Actor, request: Owned): boolean {
  return user.role === 'MANAGER' || request.assignedToId === user.id;
}

/** Set an arbitrary assignee. Employees may only claim an unassigned request for themselves. */
export function canAssign(user: Actor, request: Owned, assigneeId: number | null): boolean {
  if (user.role === 'MANAGER') return true;
  return request.assignedToId === null && assigneeId === user.id;
}
