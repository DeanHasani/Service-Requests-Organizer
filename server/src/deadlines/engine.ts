/**
 * Deadline & escalation rules as pure functions: no database and no clock of their own, so every
 * rule can be tested with any `now`. `monitor.ts` applies them to stored requests.
 */
import {
  deadlineStateAt,
  PRIORITIES,
  PRIORITY_ORDER,
  type AttentionStage,
  type DeadlineState,
  type Priority,
  type Status,
} from '@deskflow/shared';
import { DEADLINE_CONFIG } from './config';

export type DeadlineFacts = {
  dueAt: Date | null;
  status: Status;
  assignedToId: number | null;
  priority: Priority;
  escalateTo: Priority | null;
};

export const stateAt = (r: DeadlineFacts, now: Date): DeadlineState | null =>
  deadlineStateAt(r, now, DEADLINE_CONFIG.warningHours);

/**
 * Which escalation scenario applies, if any: OVERDUE once the deadline has passed; while
 * approaching, UNASSIGNED (nobody owns it), NOT_STARTED (assigned, still Open) or IN_PROGRESS.
 */
export function stageAt(r: DeadlineFacts, now: Date): AttentionStage | null {
  const state = stateAt(r, now);
  if (state === 'OVERDUE') return 'OVERDUE';
  if (state !== 'APPROACHING') return null;
  if (r.assignedToId === null) return 'UNASSIGNED';
  return r.status === 'OPEN' ? 'NOT_STARTED' : 'IN_PROGRESS';
}

/**
 * The operational priority the deadline calls for, or null when the original priority stands.
 * Approaching raises it by `approachingSteps`, overdue by `overdueSteps`, never past Urgent, and
 * never below the manager's optional minimum (`escalateTo`). The original priority is not touched;
 * if it is already Urgent nothing changes.
 */
export function escalationAt(r: DeadlineFacts, now: Date): Priority | null {
  const state = stateAt(r, now);
  const steps =
    state === 'APPROACHING'
      ? DEADLINE_CONFIG.approachingSteps
      : state === 'OVERDUE'
        ? DEADLINE_CONFIG.overdueSteps
        : 0;
  if (!steps) return null;
  const base = PRIORITY_ORDER[r.priority];
  const floor = r.escalateTo ? PRIORITY_ORDER[r.escalateTo] : 0;
  const rank = Math.min(PRIORITIES.length - 1, Math.max(base + steps, floor));
  return rank > base ? PRIORITIES[rank]! : null;
}

/** "about 20 hours", "about 3 days", "about 40 minutes": for messages and history. */
export function humanDuration(ms: number) {
  const m = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  if (m < 90) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}
