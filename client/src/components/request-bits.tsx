import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUp,
  CalendarClock,
  Check,
  Flag,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Phone,
} from 'lucide-react';
import {
  DEADLINE_WARNING_HOURS,
  PRIORITY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUSES,
  type Priority,
  type Source,
  type Status,
} from '@deskflow/shared';
import {
  cx,
  daysUntil,
  deadlineTime,
  formatCountdown,
  formatDeadline,
  formatShortDate,
} from '../lib/format';

/** Dot colours for each status. */
const statusDot: Record<Status, string> = {
  OPEN: 'bg-open',
  IN_PROGRESS: 'bg-progress-dot',
  RESOLVED: 'bg-resolved-dot',
};

/** A thin border in the status colour, softened so it frames the pill without shouting. */
const statusBorder: Record<Status, string> = {
  OPEN: 'border-open/45',
  IN_PROGRESS: 'border-progress-dot/60',
  RESOLVED: 'border-resolved-dot/55',
};

/** A light slate tint with dark text; the dot and border carry the status colour. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border bg-navy-4/12 px-2 py-px text-xs font-medium whitespace-nowrap text-ink',
        statusBorder[status],
      )}
    >
      <span aria-hidden className={cx('size-1.5 rounded-full', statusDot[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Priority as a filled flag in its colour, next to the label in the same colour. */
const priorityTone: Record<Priority, string> = {
  LOW: 'text-open',
  NORMAL: 'text-ink-2',
  HIGH: 'text-high',
  URGENT: 'text-urgent',
};

export function PriorityBadge({
  priority,
  raisedFrom,
}: {
  priority: Priority;
  /** When the deadline monitor raised the working priority: the original priority. */
  raisedFrom?: Priority | null;
}) {
  return (
    <span
      title={
        raisedFrom
          ? `Raised from ${PRIORITY_LABEL[raisedFrom]} because the deadline is close or past`
          : undefined
      }
      className={cx(
        'inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap',
        priorityTone[priority],
        priority === 'URGENT' && 'font-semibold',
      )}
    >
      <Flag className="size-3.5 shrink-0" fill="currentColor" strokeWidth={1.75} aria-hidden />
      {PRIORITY_LABEL[priority]}
      {raisedFrom && (
        <ArrowUp
          className="size-3 shrink-0"
          strokeWidth={2.5}
          aria-label="raised for the deadline"
        />
      )}
    </span>
  );
}

/** A request's working priority: the escalated one when the deadline raised it, else its own. */
export function RequestPriority({
  request: r,
}: {
  request: { priority: Priority; escalatedPriority: Priority | null };
}) {
  return (
    <PriorityBadge
      priority={r.escalatedPriority ?? r.priority}
      raisedFrom={r.escalatedPriority ? r.priority : null}
    />
  );
}

const sourceIcon: Record<Source, typeof Phone> = {
  PHONE: Phone,
  EMAIL: Mail,
  MESSAGE: MessageSquare,
  OTHER: MoreHorizontal,
};

export function SourceLabel({ source, iconOnly = false }: { source: Source; iconOnly?: boolean }) {
  const Icon = sourceIcon[source];
  if (iconOnly) {
    return (
      <span
        title={SOURCE_LABEL[source]}
        className="inline-grid size-6 place-items-center rounded-md text-ink-2"
      >
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{SOURCE_LABEL[source]}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-2">
      <Icon className="size-3.5 text-ink-3" aria-hidden />
      {SOURCE_LABEL[source]}
    </span>
  );
}

// Literal hex (mirrors the theme tokens) so Motion can interpolate between stops.
const stopTone: Record<Status, string> = {
  OPEN: '#3d5fc0',
  IN_PROGRESS: '#e09a36',
  RESOLVED: '#3fa56f',
};
const LINE_STRONG = '#d6d1c9';

/**
 * The lifecycle rail: three stops (Open, In progress, Resolved) filled up to the current one.
 * Small in table rows; large on the request page, where the fill animates on every transition.
 */
export function LifecycleRail({
  status,
  size = 'sm',
  onDark = false,
}: {
  status: Status;
  /** `xs` is the compact rail used in dense lists. */
  size?: 'xs' | 'sm' | 'lg';
  onDark?: boolean;
}) {
  const at = STATUSES.indexOf(status);

  if (size === 'sm' || size === 'xs') {
    const xs = size === 'xs';
    return (
      <span aria-hidden className="inline-flex items-center">
        {STATUSES.map((s, i) => (
          <span key={s} className="inline-flex items-center">
            {i > 0 && (
              <span
                className={xs ? 'h-[1.5px] w-1.5' : 'h-[2px] w-2.5'}
                style={{ background: i <= at ? stopTone[status] : 'var(--color-line-strong)' }}
              />
            )}
            <span
              className={cx('rounded-full', xs ? 'size-[5px]' : 'size-[7px]')}
              style={{
                background: i <= at ? stopTone[status] : 'transparent',
                boxShadow: i <= at ? 'none' : 'inset 0 0 0 1.5px var(--color-line-strong)',
              }}
            />
          </span>
        ))}
      </span>
    );
  }

  return (
    <ol className="relative grid grid-cols-3" aria-label={`Status: ${STATUS_LABEL[status]}`}>
      {/* track + animated fill, running between the first and last stop centres */}
      <span
        aria-hidden
        className={cx(
          'absolute top-[11px] right-[16.66%] left-[16.66%] h-[3px] rounded-full',
          onDark ? 'bg-navy-3' : 'bg-line',
        )}
      />
      <motion.span
        aria-hidden
        className="absolute top-[11px] left-[16.66%] h-[3px] w-[66.68%] origin-left rounded-full"
        initial={false}
        animate={{ transform: `scaleX(${at / 2})`, backgroundColor: stopTone[status] }}
        transition={{ duration: 0.55, ease: [0.77, 0, 0.175, 1] }}
      />
      {STATUSES.map((s, i) => {
        const done = i < at || status === 'RESOLVED';
        const current = i === at;
        return (
          <li
            key={s}
            className="relative flex flex-col items-center gap-2"
            aria-current={current ? 'step' : undefined}
          >
            <motion.span
              initial={false}
              animate={{
                backgroundColor: i <= at ? stopTone[status] : onDark ? '#18263c' : '#ffffff',
                borderColor: i <= at ? stopTone[status] : onDark ? '#3a4b66' : LINE_STRONG,
                transform: current ? 'scale(1)' : 'scale(0.82)',
              }}
              transition={{
                duration: 0.35,
                ease: [0.23, 1, 0.32, 1],
                delay: i <= at ? 0.12 * i : 0,
              }}
              className="relative z-10 grid size-[25px] place-items-center rounded-full border-2 text-white"
            >
              {done && i !== at ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
              {current && status !== 'RESOLVED' && (
                <span className="size-2 rounded-full bg-white" />
              )}
              {current && status === 'RESOLVED' && (
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              )}
            </motion.span>
            <span
              className={cx(
                'text-xs transition-colors duration-300',
                current ? 'font-semibold' : '',
                onDark
                  ? current
                    ? 'text-white'
                    : 'text-navy-ink-dim'
                  : current
                    ? 'text-ink'
                    : 'text-ink-3',
              )}
            >
              {STATUS_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function RequestRef({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cx('tabular text-xs font-medium tracking-[0.01em] text-ink-3', className)}>
      {value}
    </span>
  );
}

/**
 * Deadline at a glance. Quiet when there is time left; amber within two days; red once overdue.
 * Resolved work shows nothing: the deadline no longer matters.
 */
export function DueBadge({
  dueAt,
  status,
  className,
}: {
  dueAt: string | null;
  status: Status;
  className?: string;
}) {
  if (!dueAt || status === 'RESOLVED') return null;
  const days = daysUntil(dueAt);
  const overdue = new Date(dueAt).getTime() < Date.now();
  // Amber in the same window the deadline monitor calls "approaching".
  const soon = new Date(dueAt).getTime() - Date.now() <= DEADLINE_WARNING_HOURS * 3600_000;
  const time = deadlineTime(dueAt);
  const at = time ? `, ${time}` : '';
  const label = overdue
    ? days === 0
      ? time
        ? `Overdue since ${time}`
        : 'Overdue today'
      : `Overdue ${formatShortDate(dueAt)}`
    : days === 0
      ? `Due today${at}`
      : days === 1
        ? `Due tomorrow${at}`
        : `Due ${formatShortDate(dueAt)}${at}`;
  return (
    <span
      title={`Deadline: ${formatDeadline(dueAt)}`}
      className={cx(
        'inline-flex min-w-0 items-center gap-1 text-xs font-medium whitespace-nowrap',
        overdue ? 'text-urgent' : soon ? 'text-high' : 'text-ink-2',
        className,
      )}
    >
      <CalendarClock className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Re-renders every `ms` so time-based text stays current. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Live time left until the deadline ("2d 5h left"), amber in the last 24 hours and red once
 * overdue. Nothing for resolved work or when there is no deadline.
 */
export function Countdown({
  dueAt,
  status,
  className,
}: {
  dueAt: string | null;
  status: Status;
  className?: string;
}) {
  const now = useNow(20_000);
  if (!dueAt || status === 'RESOLVED') return null;
  const left = new Date(dueAt).getTime() - now;
  return (
    <span
      role="timer"
      aria-label={`Deadline: ${formatCountdown(dueAt, now)}`}
      className={cx(
        'tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        left <= 0
          ? 'bg-urgent-soft text-urgent'
          : left < 86_400_000
            ? 'bg-high-soft text-high'
            : 'bg-sunken text-ink-2',
        className,
      )}
    >
      <span
        aria-hidden
        className={cx('size-1.5 rounded-full bg-current', left > 0 && 'animate-pulse')}
      />
      {formatCountdown(dueAt, now)}
    </span>
  );
}
