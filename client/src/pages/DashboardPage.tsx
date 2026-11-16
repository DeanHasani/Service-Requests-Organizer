import { Link } from 'react-router';
import { motion } from 'motion/react';
import {
  Activity as ActivityIcon,
  BriefcaseBusiness,
  CircleCheckBig,
  CircleDot,
  Inbox,
  Layers,
  RefreshCw,
  UserPlus,
  UserRoundX,
  type LucideIcon,
} from 'lucide-react';
import type { DashboardSummary } from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useActivityFeed, useDashboard, useRequests } from '../lib/queries';
import { ErrorState } from '../components/errors';
import { ActivitySkeleton, RecentRowsSkeleton } from '../components/skeletons';
import { cx, timeAgo } from '../lib/format';
import { ActivityList } from '../components/ActivityList';
import { Avatar, EmptyState, PageHeader, Panel, PanelHeader, Skeleton } from '../components/ui';
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
      />
      {summary.isError ? (
        <Panel>
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        </Panel>
      ) : (
        <StatusLedger data={summary.data} isManager={user.role === 'MANAGER'} />
      )}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RecentRequests />
        <RecentActivity />
      </div>
    </>
  );
}

function StatusLedger({ data, isManager }: { data?: DashboardSummary; isManager: boolean }) {
  const total_ = {
    label: 'Total requests',
    value: data?.total,
    to: '/requests',
    icon: Layers,
    note: 'Everything logged, open or closed',
  };
  const statuses = [
    {
      label: 'Open',
      value: data?.open,
      to: '/requests?status=OPEN',
      icon: CircleDot,
      note: 'waiting to start',
    },
    {
      label: 'In progress',
      value: data?.inProgress,
      to: '/requests?status=IN_PROGRESS',
      icon: RefreshCw,
      note: 'being worked on',
    },
    {
      label: 'Resolved',
      value: data?.resolved,
      to: '/requests?status=RESOLVED',
      icon: CircleCheckBig,
      note: 'closed out',
    },
    {
      label: 'Unassigned',
      value: data?.unassigned,
      to: '/unassigned',
      icon: UserRoundX,
      note: 'without an owner',
      alert: (data?.unassigned ?? 0) > 0,
    },
  ];
  const total = Math.max(1, data?.total ?? 1);
  // Managers never own requests, so their card shows what the team is carrying instead.
  const card = !data
    ? null
    : isManager
      ? {
          to: '/team',
          label: 'Team workload',
          value: data.open - data.unassigned + data.inProgress,
          detail: `${data.inProgress} in progress, ${data.open - data.unassigned} waiting to start`,
        }
      : {
          to: '/my',
          label: 'My workload',
          value: data.mine.open + data.mine.inProgress,
          detail: `${data.mine.inProgress} in progress, ${data.mine.resolved} resolved by you`,
        };
  const pressing = data ? data.byPriority.URGENT + data.byPriority.HIGH : 0;

  return (
    <Panel className="p-3">
      {/* Desktop: Total | 2x2 statuses | workload. Hovering a card grows it and squeezes its
          neighbours (flex-grow transitions in styles.css). Phones: a plain two-column grid. */}
      <div className="ledger grid grid-cols-2 gap-3 lg:flex lg:h-[184px]">
        <StatCard {...total_} big className="col-span-2 lg:col-span-1" />
        <div className="ledger-mid contents lg:flex lg:flex-col lg:gap-3">
          {[statuses.slice(0, 2), statuses.slice(2)].map((row, i) => (
            <div key={i} className="ledger-row contents lg:flex lg:gap-3">
              {row.map((c) => (
                <StatCard key={c.label} {...c} />
              ))}
            </div>
          ))}
        </div>
        <Link
          to={card?.to ?? (isManager ? '/team' : '/my')}
          className="ledger-cell col-span-2 flex flex-col justify-between gap-2 rounded-panel bg-navy p-5 text-navy-ink hover:bg-navy-2 lg:col-span-1"
        >
          <span className="flex items-start justify-between gap-2">
            <span>
              <span className="block text-[15px] font-semibold text-white">
                {isManager ? 'Team workload' : 'My workload'}
              </span>
              {card && <span className="mt-1 block text-xs text-navy-ink-dim">{card.detail}</span>}
            </span>
            <BriefcaseBusiness
              className="size-5 shrink-0 text-white"
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
          {card ? (
            <span className="text-[13px]">
              <span className="ledger-num tabular inline-block text-[56px] leading-none font-semibold tracking-[-0.03em] text-white">
                {card.value}
              </span>{' '}
              active
            </span>
          ) : (
            <Skeleton className="h-10 w-24 opacity-20" />
          )}
        </Link>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-2 pb-1">
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

function StatCard({
  label,
  value,
  to,
  icon: Icon,
  note,
  alert,
  big = false,
  className,
}: {
  label: string;
  value?: number;
  to: string;
  icon: LucideIcon;
  /** Short description: under the title on the big card, beside the number on the small ones. */
  note: string;
  alert?: boolean;
  big?: boolean;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        'ledger-cell flex flex-col justify-between rounded-panel border border-line bg-surface',
        big ? 'gap-3 p-5' : 'gap-2 px-4 py-3',
        className,
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span>
          <span className={cx('block font-semibold text-ink', big ? 'text-[15px]' : 'text-sm')}>
            {label}
          </span>
          {big && <span className="mt-1 block text-xs text-ink-3">{note}</span>}
        </span>
        <Icon
          className={cx('shrink-0 text-ink', big ? 'size-5' : 'size-[18px]')}
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={cx(
            'ledger-num tabular block origin-left leading-none font-semibold tracking-[-0.03em]',
            big ? 'text-[56px]' : 'text-[28px]',
            alert && 'text-high',
          )}
        >
          {value ?? <Skeleton className={big ? 'h-12 w-20' : 'h-7 w-10'} />}
        </span>
        {!big && <span className="truncate text-xs text-ink-3">{note}</span>}
      </span>
    </Link>
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
        <RecentRowsSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
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
                  <span className="block truncate text-[15px] font-medium text-ink">{r.title}</span>
                  <span className="mt-0.5 flex items-center gap-3 text-xs whitespace-nowrap text-ink-3">
                    <RequestRef value={r.referenceNumber} />
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
          <ActivitySkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
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
