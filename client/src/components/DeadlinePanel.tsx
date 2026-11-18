import { Link } from 'react-router';
import {
  AlarmClock,
  CheckCircle2,
  Hourglass,
  PlayCircle,
  Sparkles,
  UserRoundX,
} from 'lucide-react';
import type { AttentionItem, AttentionStage } from '@deskflow/shared';
import { useAttention } from '../lib/queries';
import { cx, formatCountdown, formatDeadline } from '../lib/format';
import { Avatar, EmptyState, Panel, PanelHeader, Skeleton } from './ui';
import { RequestPriority, RequestRef, StatusBadge } from './request-bits';

const STAGE: Record<AttentionStage, { label: string; Icon: typeof AlarmClock; tone: string }> = {
  OVERDUE: { label: 'Overdue', Icon: AlarmClock, tone: 'bg-urgent-soft text-urgent' },
  UNASSIGNED: { label: 'Due soon, unassigned', Icon: UserRoundX, tone: 'bg-high-soft text-high' },
  NOT_STARTED: { label: 'Due soon, not started', Icon: Hourglass, tone: 'bg-high-soft text-high' },
  IN_PROGRESS: {
    label: 'Due soon, in progress',
    Icon: PlayCircle,
    tone: 'bg-progress-soft text-progress',
  },
};

function Item({ item: x, manager }: { item: AttentionItem; manager: boolean }) {
  const s = STAGE[x.stage];
  return (
    <li>
      <Link
        to={`/requests/${x.request.id}`}
        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-canvas sm:flex-row sm:items-center sm:gap-4"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                s.tone,
              )}
            >
              <s.Icon className="size-3" aria-hidden /> {s.label}
            </span>
            <RequestRef
              value={x.request.referenceNumber}
              className="text-[11px] whitespace-nowrap"
            />
            <RequestPriority request={x.request} />
          </span>
          <span className="mt-1 block truncate text-[15px] font-medium text-ink">
            {x.request.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-2">
            {manager &&
              (x.assignee ? (
                <span className="inline-flex items-center gap-1.5">
                  <Avatar name={x.assignee.name} size="xs" /> {x.assignee.name}
                </span>
              ) : (
                <span className="text-ink-3">Unassigned</span>
              ))}
            <span className="text-ink-3">· due {formatDeadline(x.request.dueAt)}</span>
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-xs font-medium text-ink">
            {x.suggested && <Sparkles className="size-3.5 text-cobalt" aria-hidden />}
            {x.nextAction}
          </span>
        </span>
        <span className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <span
            className={cx(
              'tabular text-sm font-semibold whitespace-nowrap',
              x.msLeft < 0 ? 'text-urgent' : 'text-high',
            )}
          >
            {formatCountdown(x.request.dueAt)}
          </span>
          <StatusBadge status={x.request.status} />
        </span>
      </Link>
    </li>
  );
}

/**
 * Requests whose deadline is close or past, worst first, each with what to do next. Managers see
 * the whole team ("Needs attention"); employees see their own ("Your deadlines").
 */
export function DeadlinePanel({ manager }: { manager: boolean }) {
  const q = useAttention();
  const items = q.data ?? [];
  const overdue = items.filter((i) => i.stage === 'OVERDUE').length;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={manager ? 'Needs attention' : 'Your deadlines'}
        action={
          items.length > 0 && (
            <span className="text-xs text-ink-2">
              {overdue > 0 && (
                <>
                  <span className="tabular font-semibold text-urgent">{overdue}</span> overdue
                  ·{' '}
                </>
              )}
              <span className="tabular font-semibold text-ink">{items.length - overdue}</span> due
              soon
            </span>
          )
        }
      />
      {q.isPending ? (
        <div className="space-y-3 p-4" aria-hidden>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title={manager ? 'No deadlines need attention' : 'Nothing due soon'}
          body={
            manager
              ? 'Requests due within a day, or past their deadline, show up here.'
              : 'Your requests due within a day, or past their deadline, show up here.'
          }
          compact
        />
      ) : (
        <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
          {items.map((x) => (
            <Item key={x.request.id} item={x} manager={manager} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
