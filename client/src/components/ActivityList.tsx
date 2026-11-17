import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  CirclePlus,
  Flag,
  PencilLine,
  PlayCircle,
  RotateCcw,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type { Activity, ActionType } from '@deskflow/shared';
import { formatDateTime, timeAgo, cx } from '../lib/format';

const icon: Record<ActionType, { Icon: typeof CirclePlus; tone: string }> = {
  CREATED: { Icon: CirclePlus, tone: 'text-open bg-open-soft' },
  UPDATED: { Icon: PencilLine, tone: 'text-ink-2 bg-sunken' },
  PRIORITY_CHANGED: { Icon: Flag, tone: 'text-high bg-high-soft' },
  ASSIGNED: { Icon: UserPlus, tone: 'text-ink-2 bg-sunken' },
  REASSIGNED: { Icon: ArrowRightLeft, tone: 'text-ink-2 bg-sunken' },
  UNASSIGNED: { Icon: UserMinus, tone: 'text-ink-2 bg-sunken' },
  STATUS_CHANGED: { Icon: PlayCircle, tone: 'text-progress bg-progress-soft' },
  RESOLVED: { Icon: CheckCircle2, tone: 'text-resolved bg-resolved-soft' },
  REOPENED: { Icon: RotateCcw, tone: 'text-open bg-open-soft' },
  DEADLINE_CHANGED: { Icon: CalendarClock, tone: 'text-progress bg-progress-soft' },
};

const refLink = (a: Activity) => (
  <Link
    to={`/requests/${a.request.id}`}
    className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
  >
    {a.request.referenceNumber}
  </Link>
);

/** In the global feed, link the request: inline when the text already names it, appended otherwise. */
function DescriptionWithLink({ activity: a }: { activity: Activity }) {
  const [before, after] = a.description.split(a.request.referenceNumber);
  if (after !== undefined) {
    return (
      <>
        {before}
        {refLink(a)}
        {after}
      </>
    );
  }
  return (
    <>
      {a.description} on {refLink(a)}
    </>
  );
}

/** Field edits show the before/after values; descriptive actions already name them. */
const showsValues = (a: Activity) => a.actionType === 'UPDATED' && a.fieldName !== 'description';

export function ActivityList({
  items,
  showRequest = false,
}: {
  items: Activity[];
  showRequest?: boolean;
}) {
  return (
    <ol className="relative">
      <AnimatePresence initial={false}>
        {items.map((a, idx) => {
          const { Icon, tone } = icon[a.actionType];
          return (
            <motion.li
              key={a.id}
              layout="position"
              initial={{ opacity: 0, transform: 'translateY(-6px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              className="relative flex gap-3 pb-4 last:pb-0"
            >
              {idx < items.length - 1 && (
                <span aria-hidden className="absolute top-7 bottom-1 left-[13px] w-px bg-line" />
              )}
              <span
                className={cx(
                  'relative grid size-[27px] shrink-0 place-items-center rounded-full',
                  tone,
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 pt-[3px] text-[13px] leading-snug">
                <p className="text-ink-2">
                  <span className="font-medium text-ink">{a.actor.name}</span>{' '}
                  {showRequest ? <DescriptionWithLink activity={a} /> : a.description}
                </p>
                {showsValues(a) && (a.oldValue || a.newValue) && (
                  <p className="mt-1 truncate text-xs text-ink-3">
                    <span className="line-through decoration-ink-3/50">{a.oldValue}</span>
                    {' to '}
                    <span className="text-ink-2">{a.newValue}</span>
                  </p>
                )}
                <time
                  dateTime={a.createdAt}
                  title={formatDateTime(a.createdAt)}
                  className="mt-0.5 block text-xs text-ink-3"
                >
                  {timeAgo(a.createdAt)}
                </time>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
