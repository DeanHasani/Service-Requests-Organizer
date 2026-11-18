import { Link } from 'react-router';
import {
  AlarmClock,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Timer,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { PRIORITIES, PRIORITY_LABEL, type Insights, type ServiceRequest } from '@deskflow/shared';
import { cx, formatDuration, timeAgo } from '../lib/format';
import { ActivityList } from './ActivityList';
import { EmptyState, Panel, PanelHeader } from './ui';
import { DueBadge, RequestPriority, RequestRef, StatusBadge } from './request-bits';

/**
 * One person's work: what they hold now, what they have resolved and how fast, and what they did
 * lately. `self` words it for the person themselves; otherwise for their manager.
 */
export function InsightsView({ data, self }: { data: Insights; self: boolean }) {
  const isEmployee = data.member.role === 'EMPLOYEE';
  const first = data.member.name.split(' ')[0];
  const activeTotal = data.active.open + data.active.inProgress;

  const stats: Stat[] = isEmployee
    ? [
        {
          label: 'Active now',
          value: activeTotal,
          note: `${data.active.inProgress} in progress`,
          icon: ClipboardList,
        },
        {
          label: 'Overdue',
          value: data.active.overdue,
          note: 'past the deadline',
          icon: AlarmClock,
          alert: data.active.overdue > 0,
        },
        {
          label: 'Resolved, 7 days',
          value: data.resolved.last7Days,
          note: `${data.resolved.last30Days} in 30 days`,
          icon: CalendarCheck,
        },
        {
          label: 'Resolved in total',
          value: data.resolved.total,
          note: 'distinct requests',
          icon: CheckCircle2,
        },
        {
          label: 'Average time',
          value: data.avgResolveHours === null ? '–' : formatDuration(data.avgResolveHours),
          note: 'from logged to resolved',
          icon: Timer,
        },
      ]
    : [
        { label: 'Requests logged', value: data.created, note: 'all time', icon: Inbox },
        {
          label: 'Assignments',
          value: data.assignmentsLast30Days,
          note: 'in the last 30 days',
          icon: UserPlus,
        },
      ];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Key numbers"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {stats.map((s) => (
          <StatTile key={s.label} {...s} />
        ))}
      </section>

      {isEmployee && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel>
            <PanelHeader title={self ? 'What you’re working on' : `What ${first} is working on`} />
            {data.activeRequests.length ? (
              <RequestRows items={data.activeRequests} />
            ) : (
              <EmptyState
                icon={<ClipboardList />}
                title="Nothing assigned right now"
                body={self ? 'New work from your manager will show up here.' : undefined}
              />
            )}
            {activeTotal > 0 && <PriorityStrip counts={data.activeByPriority} />}
          </Panel>
          <Panel>
            <PanelHeader title="Recently resolved" />
            {data.recentlyResolved.length ? (
              <RequestRows items={data.recentlyResolved} resolved />
            ) : (
              <EmptyState icon={<CheckCircle2 />} title="Nothing resolved yet" />
            )}
          </Panel>
        </div>
      )}

      <Panel>
        <PanelHeader title={self ? 'Your recent activity' : `${first}’s recent activity`} />
        <div className="p-4">
          {data.recentActivity.length ? (
            <ActivityList items={data.recentActivity} showRequest />
          ) : (
            <p className="text-sm text-ink-3">No activity yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

type Stat = {
  label: string;
  value: number | string;
  note: string;
  icon: LucideIcon;
  alert?: boolean;
};

function StatTile({ label, value, note, icon: Icon, alert }: Stat) {
  return (
    <div className="ledger-cell flex flex-col gap-3 rounded-panel border border-line bg-surface px-4 py-3.5">
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <Icon className="size-[18px] shrink-0 text-ink" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={cx(
            'tabular text-[28px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap',
            alert && 'text-urgent',
          )}
        >
          {value}
        </span>
        <span className="truncate text-xs text-ink-3">{note}</span>
      </span>
    </div>
  );
}

function RequestRows({ items, resolved }: { items: ServiceRequest[]; resolved?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((r) => (
        <li key={r.id}>
          <Link
            to={`/requests/${r.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{r.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <RequestRef value={r.referenceNumber} className="text-[11px]" />
                {resolved ? (
                  <span className="text-xs text-ink-3">
                    resolved {r.resolvedAt ? timeAgo(r.resolvedAt) : ''}
                  </span>
                ) : (
                  <DueBadge dueAt={r.dueAt} status={r.status} />
                )}
              </span>
            </span>
            {resolved ? <RequestPriority request={r} /> : <StatusBadge status={r.status} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const priorityBar: Record<string, string> = {
  LOW: 'bg-line-strong',
  NORMAL: 'bg-ink-3',
  HIGH: 'bg-high',
  URGENT: 'bg-urgent',
};

function PriorityStrip({ counts }: { counts: Insights['activeByPriority'] }) {
  const total = Math.max(
    1,
    PRIORITIES.reduce((n, p) => n + counts[p], 0),
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
      <span
        className="flex h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-sunken"
        role="img"
        aria-label={PRIORITIES.map((p) => `${counts[p]} ${PRIORITY_LABEL[p]}`).join(', ')}
      >
        {[...PRIORITIES]
          .reverse()
          .map((p) =>
            counts[p] ? (
              <span
                key={p}
                className={cx('h-full border-r-2 border-surface last:border-r-0', priorityBar[p])}
                style={{ width: `${(counts[p] / total) * 100}%` }}
              />
            ) : null,
          )}
      </span>
      <span className="flex gap-3 text-xs text-ink-2">
        {[...PRIORITIES].reverse().map((p) =>
          counts[p] ? (
            <span key={p}>
              <span className="tabular font-semibold text-ink">{counts[p]}</span>{' '}
              {PRIORITY_LABEL[p].toLowerCase()}
            </span>
          ) : null,
        )}
      </span>
    </div>
  );
}
