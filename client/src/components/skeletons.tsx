import { cx } from '../lib/format';
import { Panel, PanelHeader, Skeleton } from './ui';

// Placeholders shaped like the real sections, so the layout does not jump when data arrives.

const Bar = Skeleton;
const Circle = ({ className }: { className?: string }) => (
  <Skeleton className={cx('rounded-full', className)} />
);

export function PageHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6" aria-hidden>
      <div className="space-y-2.5">
        <Bar className="h-6 w-44" />
        <Bar className="h-3 w-64 max-w-[60vw]" />
      </div>
      {action && <Bar className="h-9 w-32 rounded-control" />}
    </div>
  );
}

/** Three-dot rail placeholder, same footprint as the real one. */
function RailSkeleton() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      <Circle className="size-[7px]" />
      <Bar className="h-0.5 w-2" />
      <Circle className="size-[7px]" />
      <Bar className="h-0.5 w-2" />
      <Circle className="size-[7px]" />
    </span>
  );
}

/** Request table rows on tablet and up, request cards on phones. */
export function RequestListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading requests">
      <div className="hidden md:block">
        <div className="flex gap-6 border-b border-line bg-canvas/60 px-4 py-3">
          {[16, 40, 14, 16, 18].map((w, i) => (
            <Bar key={i} className="h-2.5" style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 border-b border-line px-4 py-3.5 last:border-b-0"
          >
            <span className="flex w-[8rem] shrink-0 items-center gap-2.5">
              <RailSkeleton />
              <Bar className="w-16" />
            </span>
            <Bar className="flex-1" style={{ maxWidth: `${55 + ((i * 17) % 30)}%` }} />
            <Bar className="hidden w-24 xl:block" />
            <Bar className="w-14" />
            <Bar className="h-5 w-20 rounded-full" />
            <span className="flex w-32 items-center gap-2">
              <Circle className="size-5" />
              <Bar className="flex-1" />
            </span>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-line md:hidden">
        {Array.from({ length: Math.min(rows, 6) }, (_, i) => (
          <li key={i} className="space-y-2.5 px-4 py-3.5">
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <RailSkeleton />
                <Bar className="w-16" />
              </span>
              <Bar className="w-12" />
            </span>
            <Bar className="w-4/5" />
            <span className="flex justify-between">
              <Bar className="w-24" />
              <Bar className="w-20" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rows used by the dashboard's "Recently updated" panel. */
export function RecentRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-line" aria-busy="true" aria-label="Loading requests">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-4 py-3.5">
          <RailSkeleton />
          <span className="flex-1 space-y-2">
            <Bar style={{ width: `${50 + ((i * 13) % 35)}%` }} />
            <Bar className="h-2.5 w-36" />
          </span>
          <Bar className="hidden w-14 sm:block" />
          <Circle className="size-6" />
        </li>
      ))}
    </ul>
  );
}

/** Timeline entries: icon dot, a line of text, a timestamp. */
export function ActivitySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Circle className="size-[27px] shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <Bar style={{ width: `${60 + ((i * 11) % 30)}%` }} />
            <Bar className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotesSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading notes">
      {[0, 1].map((i) => (
        <div key={i} className="flex gap-3">
          <Circle className="size-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <Bar className="h-2.5 w-40" />
            <Bar className="h-10 w-full rounded-[0_8px_8px_8px]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Request page: header, lifecycle, description, notes, history, and the details column. */
export function RequestDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading request">
      <Bar className="mb-5 h-3 w-24" />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <span className="flex items-center gap-2.5">
            <Bar className="w-20" />
            <Bar className="h-5 w-20 rounded-full" />
            <Bar className="w-14" />
          </span>
          <Bar className="h-6 w-3/5" />
        </div>
        <Bar className="h-9 w-20 rounded-control" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel>
            <div className="grid grid-cols-3 px-6 pt-5 pb-4">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex flex-col items-center gap-2">
                  <Circle className="size-[25px]" />
                  <Bar className="h-2.5 w-16" />
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line px-6 py-3">
              <Bar className="w-40" />
              <Bar className="h-8 w-24 rounded-control" />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Description" />
            <div className="space-y-2.5 px-4 py-4">
              <Bar className="w-full" />
              <Bar className="w-11/12" />
              <Bar className="w-2/3" />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Internal notes" />
            <div className="px-4 py-4">
              <NotesSkeleton />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Activity history" />
            <div className="px-4 py-4">
              <ActivitySkeleton rows={3} />
            </div>
          </Panel>
        </div>
        <Panel>
          <PanelHeader title="Details" />
          <div className="divide-y divide-line">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-3"
              >
                <Bar className="h-2.5 w-16" />
                <Bar className={i < 2 ? 'h-8 rounded-control' : 'w-3/4'} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Unassigned queue rows: meta line, title, summary, and the assign control. */
export function UnassignedSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading requests" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex-1 space-y-2.5">
            <span className="flex items-center gap-3">
              <Bar className="w-16" />
              <Bar className="w-14" />
              <Bar className="w-28" />
            </span>
            <Bar style={{ width: `${45 + ((i * 19) % 30)}%` }} />
            <Bar className="h-2.5 w-4/5" />
          </div>
          <span className="flex items-center gap-2">
            <Bar className="h-9 flex-1 rounded-control sm:w-48 sm:flex-none" />
            <Bar className="h-8 w-16 rounded-control" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Team members: avatar and name, account badge, workload bar, resolved count. */
export function TeamSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading team" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
          <span className="flex min-w-48 flex-1 items-center gap-3">
            <Circle className="size-8 shrink-0" />
            <span className="flex-1 space-y-2">
              <Bar className="w-32" />
              <Bar className="h-2.5 w-44" />
            </span>
          </span>
          <Bar className="h-5 w-16 rounded-full" />
          <span className="flex w-full items-center gap-3 md:w-44">
            <Bar className="w-4" />
            <Bar className="h-1.5 flex-1 rounded-full" />
          </span>
          <Bar className="hidden w-6 md:block" />
        </div>
      ))}
    </div>
  );
}

/** Shown while the app checks the session on first load: the real shell, filled with placeholders. */
export function AppSkeleton() {
  return (
    <div className="min-h-dvh lg:pl-60" aria-busy="true" aria-label="Loading DESKFLOW">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-navy px-3 lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-2">
          <span className="size-7 rounded-[7px] bg-navy-3" />
          <span className="h-3 w-24 rounded bg-navy-3" />
        </div>
        <div className="mt-2 space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="flex h-9 items-center gap-3 px-3">
              <span className="size-4 rounded bg-navy-3" />
              <span className="h-2.5 rounded bg-navy-3" style={{ width: `${70 + i * 9}px` }} />
            </span>
          ))}
        </div>
      </aside>
      <header className="flex h-14 items-center bg-navy px-4 lg:hidden">
        <span className="size-7 rounded-[7px] bg-navy-3" />
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <PageHeaderSkeleton />
        <Panel className="mb-6 h-28">{null}</Panel>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel>
            <RecentRowsSkeleton rows={5} />
          </Panel>
          <Panel className="p-4">
            <ActivitySkeleton rows={4} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
