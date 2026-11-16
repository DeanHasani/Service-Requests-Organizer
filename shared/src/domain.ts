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

/** Add notes. Managers: any request. Employees: only requests assigned to them. */
export function canWorkOn(user: Actor, request: Owned): boolean {
  return user.role === 'MANAGER' || request.assignedToId === user.id;
}

/** Set an arbitrary assignee. Employees may only claim an unassigned request for themselves. */
export function canAssign(user: Actor, request: Owned, assigneeId: number | null): boolean {
  if (user.role === 'MANAGER') return true;
  return request.assignedToId === null && assigneeId === user.id;
}

/** What the request is (title, description, requester, source, priority) is the manager's to change. */
export function canEditDetails(user: Actor): boolean {
  return user.role === 'MANAGER';
}

/**
 * The assignee does the work: start, resolve, reopen. The manager tracks it and may only
 * send resolved work back (reopen).
 */
export function canChangeStatus(
  user: Actor,
  request: Owned & { status: Status },
  to: Status,
): boolean {
  if (user.role === 'MANAGER') return request.status === 'RESOLVED' && to === 'OPEN';
  return request.assignedToId === user.id;
}

// ---------- requester contact ----------

export const CONTACT_KINDS = ['phone', 'email', 'extension'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EXT_PREFIX = 'ext. ';

/** Contacts are stored as one string; its shape tells which kind it is. */
export function contactKind(value: string): ContactKind {
  if (value.includes('@')) return 'email';
  if (/^ext\.?\s*/i.test(value)) return 'extension';
  return 'phone';
}

/** The part a person types, without the stored prefix. */
export function contactInput(kind: ContactKind, value: string): string {
  return kind === 'extension' ? value.replace(/^ext\.?\s*/i, '') : value;
}

/** Builds the stored value from what was typed. */
export function formatContact(kind: ContactKind, typed: string): string {
  const v = typed.trim();
  if (!v) return '';
  return kind === 'extension' ? EXT_PREFIX + v : v;
}

/** Keeps only characters that can belong to this kind of contact. */
export function sanitizeContact(kind: ContactKind, typed: string): string {
  if (kind === 'phone') return typed.replace(/[^\d+ ]/g, '').replace(/(?!^)\+/g, '');
  if (kind === 'extension') return typed.replace(/\D/g, '').slice(0, 6);
  return typed.replace(/\s/g, '');
}

/** Null when valid, otherwise a message saying what is wrong. */
export function contactError(value: string): string | null {
  const kind = contactKind(value);
  if (kind === 'email') {
    return EMAIL_RE.test(value) ? null : 'Enter a valid email address, like name@company.com';
  }
  if (kind === 'extension') {
    return /^ext\. \d{2,6}$/.test(value) ? null : 'An extension is 2 to 6 digits';
  }
  const digits = value.replace(/\D/g, '').length;
  return /^\+?[\d ]+$/.test(value) && digits >= 6 && digits <= 15
    ? null
    : 'A phone number has 6 to 15 digits';
}
