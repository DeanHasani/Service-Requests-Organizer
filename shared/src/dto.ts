import type { ActionType, Priority, Role, Source, Status } from './domain';

/** Dates travel as ISO strings. */
type ISODate = string;

export type UserRef = { id: number; name: string };

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: ISODate;
};

export type TeamMember = User & { activeCount: number; resolvedCount: number };

export type SessionInfo = { user: User; csrfToken: string };

export type ServiceRequest = {
  id: number;
  referenceNumber: string;
  title: string;
  description: string;
  requesterName: string;
  requesterContact: string;
  source: Source;
  priority: Priority;
  status: Status;
  version: number;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  resolvedBy: UserRef | null;
  resolvedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type Note = {
  id: number;
  requestId: number;
  author: UserRef;
  content: string;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type Activity = {
  id: number;
  request: { id: number; referenceNumber: string; title: string };
  actor: UserRef;
  actionType: ActionType;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  description: string;
  createdAt: ISODate;
};

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DashboardSummary = {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  unassigned: number;
  mine: { open: number; inProgress: number; resolved: number };
  byPriority: Record<Priority, number>;
};

export type ApiError = {
  error: { code: string; message: string; details?: Record<string, string[]> };
};
