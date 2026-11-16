import { motion } from 'motion/react';
import { Check, Mail, MessageSquare, MoreHorizontal, Phone } from 'lucide-react';
import {
  PRIORITY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUSES,
  type Priority,
  type Source,
  type Status,
} from '@deskflow/shared';
import { cx } from '../lib/format';

const statusTone: Record<Status, { text: string; bg: string; dot: string }> = {
  OPEN: { text: 'text-open', bg: 'bg-open-soft', dot: 'bg-open' },
  IN_PROGRESS: { text: 'text-progress', bg: 'bg-progress-soft', dot: 'bg-progress-dot' },
  RESOLVED: { text: 'text-resolved', bg: 'bg-resolved-soft', dot: 'bg-resolved-dot' },
};

export function StatusBadge({ status }: { status: Status }) {
  const t = statusTone[status];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        t.bg,
        t.text,
      )}
    >
      <span aria-hidden className={cx('size-1.5 rounded-full', t.dot)} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Priority escalates by weight and colour; Low and Normal stay quiet so High and Urgent stand out. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const bars = { LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 }[priority];
  const tone =
    priority === 'URGENT'
      ? 'text-urgent'
      : priority === 'HIGH'
        ? 'text-high'
        : priority === 'NORMAL'
          ? 'text-ink-2'
          : 'text-ink-3';
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        tone,
        priority === 'URGENT' && 'font-semibold',
      )}
    >
      <span aria-hidden className="flex h-3 items-end gap-[2px]">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cx('w-[3px] rounded-[1px]', i <= bars ? 'bg-current' : 'bg-line-strong')}
            style={{ height: `${4 + i * 2}px` }}
          />
        ))}
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
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
  size?: 'sm' | 'lg';
  onDark?: boolean;
}) {
  const at = STATUSES.indexOf(status);

  if (size === 'sm') {
    return (
      <span aria-hidden className="inline-flex items-center">
        {STATUSES.map((s, i) => (
          <span key={s} className="inline-flex items-center">
            {i > 0 && (
              <span
                className="h-[2px] w-2.5"
                style={{ background: i <= at ? stopTone[status] : 'var(--color-line-strong)' }}
              />
            )}
            <span
              className="size-[7px] rounded-full"
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
