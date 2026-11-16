import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Activity as ActivityIcon, ArrowUpRight, Inbox, Plus, UserPlus } from 'lucide-react';
import type { DashboardSummary } from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useActivityFeed, useDashboard, useRequests } from '../lib/queries';
import { errorMessage } from '../lib/api';
import { cx, timeAgo } from '../lib/format';
import { ActivityList } from '../components/ActivityList';
import {
  Avatar,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
} from '../components/ui';
import { LifecycleRail, PriorityBadge, RequestRef } from '../components/request-bits';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function DashboardPage() {
  const user = useCurrentUser();
  const summary = useDashboard();
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${user.name.split(' ')[0]}. Here is where the queue stands.`}
        actions={
          <Link
            to="/requests/new"
            className="inline-flex h-9 items-center gap-2 rounded-control bg-navy px-3.5 text-sm font-medium text-white transition-[background-color,transform] duration-150 hover:bg-navy-3 active:scale-[0.97]"
          >
            <Plus className="size-4" aria-hidden /> New request
          </Link>
        }
      />
      {summary.isError ? (
        <Panel>
          <ErrorState
            message={errorMessage(summary.error)}
            onRetry={() => void summary.refetch()}
          />
        </Panel>
      ) : (
        <StatusLedger data={summary.data} />
      )}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RecentRequests />
        <RecentActivity />
      </div>
    </>
  );
}

function StatusLedger({ data }: { data?: DashboardSummary }) {
  const cells = [
    { label: 'Total requests', value: data?.total, to: '/requests' },
    { label: 'Open', value: data?.open, to: '/requests?status=OPEN', dot: 'bg-open' },
    {
      label: 'In progress',
      value: data?.inProgress,
      to: '/requests?status=IN_PROGRESS',
      dot: 'bg-progress-dot',
    },
    {
      label: 'Resolved',
      value: data?.resolved,
      to: '/requests?status=RESOLVED',
      dot: 'bg-resolved-dot',
    },
    {
      label: 'Unassigned',
      value: data?.unassigned,
      to: '/unassigned',
      alert: (data?.unassigned ?? 0) > 0,
    },
  ];
  const total = Math.max(1, data?.total ?? 1);
  const mineActive = data ? data.mine.open + data.mine.inProgress : undefined;
  const pressing = data ? data.byPriority.URGENT + data.byPriority.HIGH : 0;

  return (
    <Panel className="overflow-hidden">
      <div className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.35fr)] lg:divide-x">
        {cells.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="group border-b border-line px-5 py-4 transition-colors hover:bg-canvas lg:border-b-0"
          >
            <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
              {c.dot && <span aria-hidden className={cx('size-1.5 rounded-full', c.dot)} />}
              {c.label}
            </span>
            <span
              className={cx(
                'tabular mt-1.5 block text-[26px] leading-none font-semibold tracking-[-0.02em]',
                c.alert && 'text-high',
              )}
            >
              {c.value ?? <Skeleton className="h-6 w-10" />}
            </span>
          </Link>
        ))}
        <Link
          to="/my"
          className="col-span-2 flex flex-col justify-between gap-2 bg-navy px-5 py-4 text-navy-ink transition-colors hover:bg-navy-2 sm:col-span-3 lg:col-span-1"
        >
          <span className="flex items-center justify-between text-[13px]">
            My workload <ArrowUpRight className="size-4 opacity-70" aria-hidden />
          </span>
          {data ? (
            <span className="text-[13px]">
              <span className="tabular text-[26px] leading-none font-semibold tracking-[-0.02em] text-white">
                {mineActive}
              </span>{' '}
              active
              <span className="mt-1.5 block text-xs text-navy-ink-dim">
                {data.mine.inProgress} in progress · {data.mine.resolved} resolved by you
              </span>
            </span>
          ) : (
            <Skeleton className="h-6 w-24 opacity-20" />
          )}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-5 py-3">
        <div
          className="flex h-2 min-w-48 flex-1 overflow-hidden rounded-full bg-sunken"
          role="img"
          aria-label={
            data
              ? `${data.open} open, ${data.inProgress} in progress, ${data.resolved} resolved`
              : 'Loading'
          }
        >
          {data &&
            (
              [
                [data.open, 'bg-open'],
                [data.inProgress, 'bg-progress-dot'],
                [data.resolved, 'bg-resolved-dot'],
              ] as const
            ).map(([n, bg], i) => (
              <motion.span
                key={bg}
                className={cx('h-full origin-left', bg, i > 0 && 'border-l-2 border-surface')}
                initial={{ width: 0 }}
                animate={{ width: `${(n / total) * 100}%` }}
                transition={{ duration: 0.7, ease: [0.77, 0, 0.175, 1], delay: 0.1 + i * 0.08 }}
              />
            ))}
        </div>
        <p className="text-[13px] text-ink-2">
          {data ? (
            pressing > 0 ? (
              <>
                <span className="font-medium text-urgent">{data.byPriority.URGENT} urgent</span> and{' '}
                <span className="font-medium text-high">{data.byPriority.HIGH} high priority</span>{' '}
                still open
              </>
            ) : (
              'Nothing urgent or high priority is waiting'
            )
          ) : (
            <Skeleton className="w-48" />
          )}
        </p>
      </div>
    </Panel>
  );
}

function RecentRequests() {
  const q = useRequests({ sort: 'updatedAt', order: 'desc', pageSize: 10 });
  return (
    <Panel>
      <PanelHeader
        title="Recently updated"
        action={
          <Link to="/requests" className="text-[13px] font-medium text-ink-2 hover:text-ink">
            View all
          </Link>
        }
      />
      {q.isPending ? (
        <ul className="divide-y divide-line">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="w-14" />
              <Skeleton className="flex-1" />
              <Skeleton className="w-16" />
            </li>
          ))}
        </ul>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="There are no requests yet"
          body="Create your first request to get started."
          action={
            <Link to="/requests/new" className="text-sm font-medium text-cobalt hover:underline">
              Create a request
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.items.map((r) => (
            <li key={r.id}>
              <Link
                to={`/requests/${r.id}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-canvas sm:grid-cols-[auto_minmax(0,1fr)_7rem_auto]"
              >
                <LifecycleRail status={r.status} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {r.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs whitespace-nowrap text-ink-3">
                    <RequestRef value={r.referenceNumber} />
                    <span aria-hidden>·</span>
                    <span>updated {timeAgo(r.updatedAt)}</span>
                  </span>
                </span>
                <span className="hidden sm:block">
                  <PriorityBadge priority={r.priority} />
                </span>
                {r.assignedTo ? (
                  <span title={r.assignedTo.name}>
                    <Avatar name={r.assignedTo.name} />
                    <span className="sr-only">Assigned to {r.assignedTo.name}</span>
                  </span>
                ) : (
                  <span
                    title="Unassigned"
                    className="grid size-6 place-items-center rounded-full border border-dashed border-ink-3/70 text-ink-3"
                  >
                    <UserPlus className="size-3" aria-hidden />
                    <span className="sr-only">Unassigned</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentActivity() {
  const q = useActivityFeed(10);
  return (
    <Panel>
      <PanelHeader title="Recent activity" />
      <div className="px-4 py-4">
        {q.isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-6 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-4/5" />
                  <Skeleton className="w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            compact
            icon={<ActivityIcon />}
            title="No activity yet"
            body="Changes to requests will show up here."
          />
        ) : (
          <ActivityList items={q.data} showRequest />
        )}
      </div>
    </Panel>
  );
}
