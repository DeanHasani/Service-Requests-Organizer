import { DEADLINE_WARNING_HOURS } from '@deskflow/shared';

/** Every tunable number of the deadline monitor, in one place. See docs/deadlines.md. */
export const DEADLINE_CONFIG = {
  /** A request is "approaching" within this many hours of its deadline. */
  warningHours: DEADLINE_WARNING_HOURS,
  /** How often the background monitor runs. It also runs once at startup. */
  intervalMs: 60_000,
  /** Operational priority steps added while approaching, and once overdue (capped at Urgent). */
  approachingSteps: 1,
  overdueSteps: 2,
} as const;
