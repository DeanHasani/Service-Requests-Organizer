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
  /** Signed in with a temporary password a manager set; must choose a new one first. */
  mustChangePassword: boolean;
  createdAt: ISODate;
};

/**
 * A person on the Team page. Employees get a trimmed view of colleagues: `email` and
 * `mustChangePassword` are null for anyone but themselves.
 */
export type TeamMember = Omit<User, 'email' | 'mustChangePassword'> & {
  email: string | null;
  mustChangePassword: boolean | null;
  activeCount: number;
  resolvedCount: number;
};

/** Shown once to the manager who reset the password; never stored in plain text. */
export type PasswordReset = { user: TeamMember; temporaryPassword: string };

/** Work history of one person, for their profile and for their manager. */
export type Insights = {
  member: TeamMember;
  /** Requests assigned to them right now, by status, and how many are past their deadline. */
  active: { open: number; inProgress: number; overdue: number };
  activeByPriority: Record<Priority, number>;
  /** Distinct requests they resolved: ever, and in the last 7 and 30 days. */
  resolved: { total: number; last7Days: number; last30Days: number };
  /** Average hours from creation to resolution, over requests they currently hold as resolved. */
  avgResolveHours: number | null;
  /** For managers: requests they logged and assignments they made in the last 30 days. */
  created: number;
  assignmentsLast30Days: number;
  activeRequests: ServiceRequest[];
  recentlyResolved: ServiceRequest[];
  recentActivity: Activity[];
};

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
  /** Deadline set by a manager. */
  dueAt: ISODate | null;
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
  /** Not resolved and past the deadline. */
  overdue: number;
  /** `team` for managers; `visible` for employees (their own requests plus everything resolved). */
  scope: 'team' | 'visible';
  mine: { open: number; inProgress: number; resolved: number };
  byPriority: Record<Priority, number>;
};

export type ApiError = {
  error: { code: string; message: string; details?: Record<string, string[]> };
};
