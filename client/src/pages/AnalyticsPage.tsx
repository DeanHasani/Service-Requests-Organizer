import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import {
  AlarmClock,
  CheckCircle2,
  Inbox,
  RotateCcw,
  Table2,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import {
  ANALYTICS_RANGES,
  CATEGORY_LABEL,
  UNCATEGORISED,
  type Analytics,
  type AnalyticsRange,
  type Category,
} from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useAnalytics } from '../lib/queries';
import { cx, formatDuration, formatShortDate } from '../lib/format';
import { ErrorState } from '../components/errors';
import { Avatar, EmptyState, PageHeader, Panel, PanelHeader, Skeleton } from '../components/ui';
import { RequestRef, StatusBadge } from '../components/request-bits';

/** Series colours: validated as a pair (CVD and normal vision) against the white panel surface. */
const CREATED = '#3d63dd';
const RESOLVED = '#3fa56f';

const RANGE_LABEL: Record<AnalyticsRange, string> = {
  '30': '30 days',
  '90': '90 days',
  all: 'All time',
};

const categoryName = (c: Category | null) => (c ? CATEGORY_LABEL[c] : UNCATEGORISED);
const hours = (h: number | null) => (h === null ? '–' : formatDuration(h));

export function AnalyticsPage() {
  const user = useCurrentUser();
  if (user.role !== 'MANAGER') return <Navigate to="/" replace />;
  return <AnalyticsView />;
}

function AnalyticsView() {
  const [range, setRange] = useState<AnalyticsRange>('30');
  const q = useAnalytics(range);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="How the queue is doing: what comes in, what takes longest, what comes back, and who is carrying it."
        actions={<RangePicker value={range} onChange={setRange} />}
      />
      {q.isError ? (
        <Panel>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Panel>
      ) : !q.data ? (
        <div className="flex flex-col gap-6" aria-hidden>
          <Skeleton className="h-24 rounded-panel" />
          <Skeleton className="h-80 rounded-panel" />
        </div>
      ) : (
        <div
          className={cx(
            'flex flex-col gap-6 transition-opacity',
            q.isPlaceholderData && 'opacity-60',
          )}
        >
          <Summary data={q.data} range={range} />
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <CategoryPanel data={q.data} />
            <TrendPanel data={q.data} />
          </div>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <WorkloadPanel data={q.data} />
            <ReopenedPanel data={q.data} />
          </div>
        </div>
      )}
    </>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (r: AnalyticsRange) => void;
}) {
  return (
    <div role="group" aria-label="Time range" className="flex rounded-control bg-sunken p-0.5">
      {ANALYTICS_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className={cx(
            'h-8 rounded-[5px] px-3 text-[13px] font-medium transition-colors',
            value === r ? 'bg-surface text-ink shadow-panel' : 'text-ink-2 hover:text-ink',
          )}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

// ---------- summary ----------

function Summary({ data, range }: { data: Analytics; range: AnalyticsRange }) {
  const s = data.summary;
  const window = range === 'all' ? 'all time' : `last ${RANGE_LABEL[range]}`;
  const tiles: { label: string; value: string | number; note: string; icon: LucideIcon }[] = [
    { label: 'Logged', value: s.created, note: window, icon: Inbox },
    { label: 'Resolved', value: s.resolved, note: window, icon: CheckCircle2 },
    {
      label: 'Average time',
      value: hours(s.avgResolveHours),
      note: 'logged to work',
      icon: Timer,
    },
    {
      label: 'Reopen rate',
      value: s.reopenRate === null ? '–' : `${Math.round(s.reopenRate * 100)}%`,
      note: 'of resolved work',
      icon: RotateCcw,
    },
    {
      label: 'Overdue now',
      value: s.overdueNow,
      note: `of ${s.openNow} open`,
      icon: AlarmClock,
    },
  ];
  return (
    <section aria-label="Summary" className="ledger grid grid-cols-2 gap-3 md:grid-cols-3 lg:flex">
      {tiles.map(({ label, value, note, icon: Icon }) => (
        <div
          key={label}
          className="ledger-cell flex flex-col gap-3 rounded-panel border border-line bg-surface px-4 py-3.5"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{label}</span>
            <Icon className="size-[18px] shrink-0 text-ink" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="flex items-baseline gap-3">
            <span className="ledger-num tabular inline-block origin-left text-[28px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap">
              {value}
            </span>
            <span className="truncate text-xs text-ink-3">{note}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

// ---------- by category ----------

function CategoryPanel({ data }: { data: Analytics }) {
  const max = Math.max(1, ...data.byCategory.map((c) => c.created));
  const slowest = data.byCategory
    .filter((c) => c.avgResolveHours !== null)
    .sort((a, b) => b.avgResolveHours! - a.avgResolveHours!)[0];
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="By category" />
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-xs text-ink-2">
            <th scope="col" className="py-2.5 pr-2 pl-4 font-medium">
              Category
            </th>
            <th scope="col" className="w-[38%] px-2 py-2.5 font-medium">
              Logged
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium">
              Unresolved now
            </th>
            <th scope="col" className="py-2.5 pr-4 pl-2 text-right font-medium">
              Avg time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.byCategory.map((c) => (
            <tr key={c.category ?? 'none'}>
              <th scope="row" className="py-2.5 pr-2 pl-4 font-medium text-ink">
                {categoryName(c.category)}
              </th>
              <td className="px-2 py-2.5">
                <span className="flex items-center gap-2">
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
                    <span
                      className="block h-full rounded-full bg-cobalt transition-[width] duration-500"
                      style={{ width: `${(c.created / max) * 100}%` }}
                    />
                  </span>
                  <span className="tabular w-7 shrink-0 text-right font-semibold text-ink">
                    {c.created}
                  </span>
                </span>
              </td>
              <td
                className={cx(
                  'tabular px-2 py-2.5 text-right font-semibold',
                  c.unresolved ? 'text-ink' : 'text-ink-3',
                )}
              >
                {c.unresolved}
              </td>
              <td className="tabular py-2.5 pr-4 pl-2 text-right whitespace-nowrap text-ink-2">
                {hours(c.avgResolveHours)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {slowest && (
        <p className="border-t border-line px-4 py-3 text-[13px] text-ink-2">
          Slowest to resolve:{' '}
          <span className="font-semibold text-ink">{categoryName(slowest.category)}</span>, about{' '}
          {hours(slowest.avgResolveHours)} on average (typical case{' '}
          {hours(slowest.medianResolveHours)}).
        </p>
      )}
    </Panel>
  );
}

// ---------- weekly trend ----------

/** Tracks an element's width so the SVG draws at real pixels (crisp 2px lines, true 4px radii). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const weekLabel = (iso: string) => formatShortDate(iso);

function TrendPanel({ data }: { data: Analytics }) {
  const [asTable, setAsTable] = useState(false);
  const weeks = data.trend;
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Week by week"
        action={
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            <Table2 className="size-4" aria-hidden /> {asTable ? 'Show chart' : 'Show table'}
          </button>
        }
      />
      {weeks.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No requests in this period" compact />
      ) : asTable ? (
        <TrendTable weeks={weeks} />
      ) : (
        <div className="flex flex-col gap-5 px-4 py-4">
          <ChartBlock
            title="Logged and resolved"
            legend={
              <>
                <LegendItem color={CREATED} label="Logged" />
                <LegendItem color={RESOLVED} label="Resolved" />
              </>
            }
          >
            <VolumeChart weeks={weeks} />
          </ChartBlock>
          <ChartBlock title="Average time to resolve">
            <SpeedChart weeks={weeks} />
          </ChartBlock>
        </div>
      )}
    </Panel>
  );
}

function ChartBlock({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        {legend && <span className="flex gap-3">{legend}</span>}
      </figcaption>
      {children}
    </figure>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

const CHART_H = 150;
const AXIS_W = 28;
const AXIS_H = 20;
/** Room above the plot so the top gridline's label isn't clipped. */
const PAD_T = 10;

/** Rounded only at the data end (top), square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Up to five round gridline values from 0 to at least `max`. */
function ticks(max: number) {
  const step = Math.max(1, Math.ceil(max / 4));
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-control border border-line bg-surface px-2.5 py-1.5 text-xs whitespace-nowrap text-ink shadow-pop"
      style={{ left }}
    >
      {children}
    </div>
  );
}

function VolumeChart({ weeks }: { weeks: Analytics['trend'] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const yTicks = ticks(Math.max(1, ...weeks.flatMap((w) => [w.created, w.resolved])));
  const top = yTicks.at(-1)!;
  const plotW = Math.max(0, width - AXIS_W);
  const slot = weeks.length ? plotW / weeks.length : 0;
  const barW = Math.max(3, Math.min(18, (slot - 10) / 2));
  const y = (v: number) => PAD_T + CHART_H - (v / top) * CHART_H;
  const labelEvery = Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 64)));

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={PAD_T + CHART_H + AXIS_H}
          role="img"
          aria-label="Requests logged and resolved per week"
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={AXIS_W}
                x2={width}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text x={AXIS_W - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-3 text-[10px]">
                {t}
              </text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const cx0 = AXIS_W + slot * i + slot / 2;
            return (
              <g key={w.weekStart}>
                {hover === i && (
                  <rect
                    x={cx0 - slot / 2}
                    y={PAD_T}
                    width={slot}
                    height={CHART_H}
                    className="fill-sunken"
                  />
                )}
                {w.created > 0 && (
                  <path
                    d={barPath(cx0 - barW - 1, y(w.created), barW, PAD_T + CHART_H - y(w.created))}
                    fill={CREATED}
                  />
                )}
                {w.resolved > 0 && (
                  <path
                    d={barPath(cx0 + 1, y(w.resolved), barW, PAD_T + CHART_H - y(w.resolved))}
                    fill={RESOLVED}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text
                    x={cx0}
                    y={PAD_T + CHART_H + 14}
                    textAnchor="middle"
                    className="fill-ink-3 text-[10px]"
                  >
                    {weekLabel(w.weekStart)}
                  </text>
                )}
                {/* Hit area wider than the bars */}
                <rect
                  x={cx0 - slot / 2}
                  y={0}
                  width={slot}
                  height={CHART_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && weeks[hover] && (
        <Tooltip x={AXIS_W + slot * hover + slot / 2} width={width}>
          <p className="font-semibold">Week of {weekLabel(weeks[hover]!.weekStart)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-ink-2">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: CREATED }} />
            Logged{' '}
            <span className="tabular ml-auto font-semibold text-ink">{weeks[hover]!.created}</span>
          </p>
          <p className="flex items-center gap-1.5 text-ink-2">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: RESOLVED }} />
            Resolved{' '}
            <span className="tabular ml-auto font-semibold text-ink">{weeks[hover]!.resolved}</span>
          </p>
        </Tooltip>
      )}
    </div>
  );
}

function SpeedChart({ weeks }: { weeks: Analytics['trend'] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 110;
  const values = weeks.map((w) => w.avgResolveHours);
  const known = values.filter((v): v is number => v !== null);
  if (!known.length)
    return <p className="text-[13px] text-ink-3">Nothing was resolved in this period.</p>;
  const yTicks = ticks(Math.max(...known));
  const top = yTicks.at(-1)!;
  const plotW = Math.max(0, width - AXIS_W);
  const slot = weeks.length ? plotW / weeks.length : 0;
  const px = (i: number) => AXIS_W + slot * i + slot / 2;
  const py = (v: number) => PAD_T + H - (v / top) * H;
  // Break the line where a week had nothing resolved, rather than drawing through it.
  const segments: string[] = [];
  let current = '';
  values.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = '';
    } else current += `${current ? 'L' : 'M'}${px(i)},${py(v)} `;
  });
  if (current) segments.push(current);
  const first = known[0]!;
  const last = known.at(-1)!;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg
          width={width}
          height={PAD_T + H + 8}
          role="img"
          aria-label="Average hours to resolve per week"
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={AXIS_W}
                x2={width}
                y1={py(t)}
                y2={py(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={AXIS_W - 6}
                y={py(t) + 4}
                textAnchor="end"
                className="fill-ink-3 text-[10px]"
              >
                {t}h
              </text>
            </g>
          ))}
          {hover !== null && (
            <line
              x1={px(hover)}
              x2={px(hover)}
              y1={PAD_T}
              y2={PAD_T + H}
              className="stroke-line-strong"
              strokeWidth={1}
            />
          )}
          {segments.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={CREATED}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {values.map((v, i) =>
            v === null ? null : (
              <circle
                key={i}
                cx={px(i)}
                cy={py(v)}
                r={hover === i ? 5 : 3.5}
                fill={CREATED}
                className="stroke-surface"
                strokeWidth={2}
              />
            ),
          )}
          {weeks.map((w, i) => (
            <rect
              key={w.weekStart}
              x={px(i) - slot / 2}
              y={0}
              width={slot}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
      )}
      {hover !== null && weeks[hover] && (
        <Tooltip x={px(hover)} width={width}>
          <p className="font-semibold">Week of {weekLabel(weeks[hover]!.weekStart)}</p>
          <p className="mt-0.5 text-ink-2">
            Average{' '}
            <span className="tabular font-semibold text-ink">
              {hours(weeks[hover]!.avgResolveHours)}
            </span>
          </p>
        </Tooltip>
      )}
      {known.length > 1 && (
        <p className="mt-2 text-[13px] text-ink-2">
          {last < first ? 'Faster' : last > first ? 'Slower' : 'Steady'}: from {hours(first)} in the
          first week to {hours(last)} in the latest.
        </p>
      )}
    </div>
  );
}

function TrendTable({ weeks }: { weeks: Analytics['trend'] }) {
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-xs text-ink-2">
            <th scope="col" className="py-2.5 pl-4 font-medium">
              Week of
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium">
              Logged
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium">
              Resolved
            </th>
            <th scope="col" className="py-2.5 pr-4 text-right font-medium">
              Avg time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...weeks].reverse().map((w) => (
            <tr key={w.weekStart}>
              <th scope="row" className="py-2 pl-4 font-medium text-ink">
                {weekLabel(w.weekStart)}
              </th>
              <td className="tabular px-2 py-2 text-right">{w.created}</td>
              <td className="tabular px-2 py-2 text-right">{w.resolved}</td>
              <td className="tabular py-2 pr-4 text-right text-ink-2">
                {hours(w.avgResolveHours)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- workload ----------

function WorkloadPanel({ data }: { data: Analytics }) {
  const max = Math.max(5, ...data.workload.map((w) => w.active));
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Workload" />
      {data.workload.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No active employees" compact />
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-xs text-ink-2">
              <th scope="col" className="py-2.5 pr-2 pl-4 font-medium">
                Employee
              </th>
              <th scope="col" className="w-[34%] px-2 py-2.5 font-medium">
                Active now
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">
                Overdue
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">
                Resolved
              </th>
              <th
                scope="col"
                className="hidden py-2.5 pr-4 pl-2 text-right font-medium sm:table-cell"
              >
                Avg time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.workload.map((w) => (
              <tr key={w.user.id} className="transition-colors hover:bg-canvas">
                <th scope="row" className="py-2.5 pr-2 pl-4 font-medium">
                  <Link
                    to={`/team/${w.user.id}`}
                    className="flex items-center gap-2 text-ink hover:underline"
                  >
                    <Avatar name={w.user.name} size="sm" />
                    <span className="truncate">{w.user.name}</span>
                  </Link>
                </th>
                <td className="px-2 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="tabular w-5 shrink-0 text-right font-semibold text-ink">
                      {w.active}
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-sunken"
                    >
                      <span
                        className="block h-full rounded-full bg-progress-dot"
                        style={{ width: `${(w.active / max) * 100}%` }}
                      />
                    </span>
                  </span>
                </td>
                <td
                  className={cx(
                    'tabular px-2 py-2.5 text-right font-semibold',
                    w.overdue ? 'text-urgent' : 'text-ink-3',
                  )}
                >
                  {w.overdue}
                </td>
                <td className="tabular px-2 py-2.5 text-right text-ink">{w.resolved}</td>
                <td className="tabular hidden py-2.5 pr-4 pl-2 text-right whitespace-nowrap text-ink-2 sm:table-cell">
                  {hours(w.avgResolveHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// ---------- reopened ----------

function ReopenedPanel({ data }: { data: Analytics }) {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Most reopened" />
      {data.mostReopened.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title="Nothing was reopened"
          body="Fixes in this period held the first time."
          compact
        />
      ) : (
        <ul className="divide-y divide-line">
          {data.mostReopened.map((r) => (
            <li key={r.request.id}>
              <Link
                to={`/requests/${r.request.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">
                    {r.request.title}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ink-3">
                    <RequestRef
                      value={r.request.referenceNumber}
                      className="shrink-0 text-[11px] whitespace-nowrap"
                    />
                    <span className="truncate">{categoryName(r.category)}</span>
                  </span>
                </span>
                <StatusBadge status={r.request.status} />
                <span className="tabular w-16 shrink-0 text-right text-[13px] font-semibold text-ink">
                  {r.reopens}× <span className="font-normal text-ink-3">back</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
