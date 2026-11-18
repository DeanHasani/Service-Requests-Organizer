import type { ActionType, Category, DeadlineState, Priority, Role, Source, Status } from './domain';

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
  /** Null for requests logged before categories existed ("Uncategorised"). */
  category: Category | null;
  priority: Priority;
  status: Status;
  version: number;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  resolvedBy: UserRef | null;
  resolvedAt: ISODate | null;
  /** Deadline set by a manager. */
  dueAt: ISODate | null;
  /** Optional minimum the operational priority rises to when the deadline is close. */
  escalateTo: Priority | null;
  /**
   * Operational priority raised by the deadline monitor, or null. `priority` is always the
   * priority people chose; work by `escalatedPriority ?? priority`.
   */
  escalatedPriority: Priority | null;
  escalatedAt: ISODate | null;
  /** Where the request stands against its deadline; null without a deadline. */
  deadlineState: DeadlineState | null;
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
  /** The person who did it, or null for an automatic event (the deadline monitor). */
  actor: UserRef | null;
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

/** The manager's analytics page. Counts are for the chosen window unless noted. */
export type Analytics = {
  range: { from: ISODate | null; to: ISODate };
  summary: {
    created: number;
    resolved: number;
    avgResolveHours: number | null;
    /** Share of requests resolved in the window that were reopened at least once in it. */
    reopenRate: number | null;
    /** Right now, regardless of window. */
    openNow: number;
    inProgressNow: number;
    unassignedNow: number;
    overdueNow: number;
  };
  /** Requests logged in the window, by their status now. */
  byStatus: { status: Status; count: number }[];
  /** Requests logged in the window by priority, and how many of each priority are open now. */
  byPriority: { priority: Priority; created: number; openNow: number }[];
  /** Unresolved requests with no activity (changes or notes) for `thresholdDays` or more. */
  stale: {
    thresholdDays: number;
    count: number;
    items: {
      request: { id: number; referenceNumber: string; title: string; status: Status };
      assignee: UserRef | null;
      daysIdle: number;
    }[];
  };
  /** One row per category, `null` = Uncategorised, sorted by `created` then `unresolved`. */
  byCategory: {
    category: Category | null;
    created: number;
    /** Right now, regardless of window. */
    unresolved: number;
    resolved: number;
    avgResolveHours: number | null;
    medianResolveHours: number | null;
  }[];
  mostReopened: {
    request: { id: number; referenceNumber: string; title: string; status: Status };
    category: Category | null;
    reopens: number;
  }[];
  /**
   * Per employee, in name order (context, not a ranking). Resolutions and outcomes are in the
   * window; active, overdue and share are right now.
   */
  workload: {
    user: UserRef;
    active: number;
    overdue: number;
    /** Share of the team's active requests they carry (0–1). */
    share: number;
    resolved: number;
    /** Of their resolutions in the window, how many held (were not reopened). */
    held: number;
    /** held / resolved when there are enough resolutions to mean something, else null. */
    successRate: number | null;
    avgResolveHours: number | null;
    /** Categories they resolved most in the window, with counts. */
    topCategories: { category: Category | null; resolved: number }[];
  }[];
  /** Below this many resolutions, rates are not shown as facts. */
  minSample: number;
  /** Daily buckets for 7 days, weekly otherwise; oldest first. */
  trendBucket: 'day' | 'week';
  trend: { start: ISODate; created: number; resolved: number; avgResolveHours: number | null }[];
};

/**
 * Smart assignment: who is a good fit for a request, and why. Suggestions only; a manager always
 * confirms the assignment.
 */
export type Recommendations = {
  category: Category;
  priority: Priority;
  /**
   * What the top suggestion mostly rests on: `experience` (enough history in this category),
   * `limited` (a little), or `workload` (no relevant history; workload and general experience).
   */
  basis: 'experience' | 'limited' | 'workload';
  candidates: Candidate[];
  /** How many past resolutions in this category the whole team has, for context. */
  teamSample: number;
};

export type Candidate = {
  user: UserRef;
  /** 0–100 match score from the documented weights; only meaningful relative to the others. */
  score: number;
  /** How much the score can be trusted for this person in this category. */
  confidence: 'solid' | 'limited' | 'none';
  category: {
    /** Times they resolved a request in this category. */
    resolved: number;
    /** Of those, how many stayed resolved (were not reopened afterwards). */
    held: number;
    /** held / resolved, only when the sample is big enough to mean something. */
    successRate: number | null;
    /** Their median hours to resolve in this category, when the sample is big enough. */
    medianHours: number | null;
    /** Their time relative to the team on the same category and priority (1 = typical). */
    speedRatio: number | null;
  };
  /** Resolutions across all categories. */
  generalResolved: number;
  workload: { active: number; overdue: number };
  /** Short, plain-language reasons, most important first. */
  reasons: string[];
  /** Things to weigh against the suggestion (busy, little history, recent reopens). */
  cautions: string[];
};

export type NotificationType =
  | 'ASSIGNED'
  | 'DEADLINE_UNASSIGNED'
  | 'DEADLINE_NOT_STARTED'
  | 'DEADLINE_IN_PROGRESS'
  | 'DEADLINE_OVERDUE';

/** One in-app notification for the signed-in person. */
export type AppNotification = {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  request: { id: number; referenceNumber: string; title: string } | null;
  read: boolean;
  createdAt: ISODate;
};

export type NotificationList = { items: AppNotification[]; unread: number };

/** Where a request is in its deadline escalation, for the Needs attention lists. */
export type AttentionStage = 'UNASSIGNED' | 'NOT_STARTED' | 'IN_PROGRESS' | 'OVERDUE';

export type AttentionItem = {
  request: {
    id: number;
    referenceNumber: string;
    title: string;
    status: Status;
    priority: Priority;
    escalatedPriority: Priority | null;
    dueAt: ISODate;
  };
  assignee: UserRef | null;
  stage: AttentionStage;
  /** Milliseconds to the deadline; negative once overdue. */
  msLeft: number;
  /** What to do next, in plain words. */
  nextAction: string;
  /** For unassigned requests: who Smart Assignment would suggest. */
  suggested: UserRef | null;
};

export type ApiError = {
  error: { code: string; message: string; details?: Record<string, string[]> };
};
