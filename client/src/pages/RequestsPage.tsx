import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Inbox,
  ListTodo,
  Plus,
  Search,
  SearchX,
  X,
} from 'lucide-react';
import {
  PRIORITIES,
  PRIORITY_LABEL,
  CATEGORIES,
  CATEGORY_LABEL,
  SOURCES,
  SOURCE_LABEL,
  STATUSES,
  STATUS_LABEL,
  type ListRequestsQuery,
  type ServiceRequest,
  type SortField,
} from '@deskflow/shared';
import { useAssignees, useRequests } from '../lib/queries';
import { useCurrentUser } from '../lib/auth';
import { ErrorState } from '../components/errors';
import { RequestListSkeleton } from '../components/skeletons';
import { cx, formatDateTime, formatShortDate } from '../lib/format';
import { Avatar, Button, EmptyState, Input, PageHeader, Panel, Select } from '../components/ui';
import {
  DueBadge,
  LifecycleRail,
  RequestPriority,
  RequestRef,
  SourceLabel,
  StatusBadge,
} from '../components/request-bits';

type Scope = 'all' | 'mine';
const FILTER_KEYS = ['q', 'status', 'priority', 'source', 'category', 'assignee', 'due'] as const;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function RequestsPage({ scope }: { scope: Scope }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search.trim());

  const get = (k: string) => params.get(k) ?? undefined;
  const sort = (get('sort') as SortField | undefined) ?? 'createdAt';
  const order = (get('order') as 'asc' | 'desc' | undefined) ?? 'desc';
  const page = Number(get('page') ?? 1) || 1;

  const update = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // Push the debounced search into the URL (and back to page 1).
  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query: ListRequestsQuery = {
    q: get('q'),
    status: get('status') as ListRequestsQuery['status'],
    priority: get('priority') as ListRequestsQuery['priority'],
    source: get('source') as ListRequestsQuery['source'],
    category: get('category') as ListRequestsQuery['category'],
    assignee: scope === 'mine' ? 'me' : (get('assignee') as ListRequestsQuery['assignee']),
    due: get('due') === 'overdue' ? 'overdue' : undefined,
    sort,
    order,
    page,
    pageSize: 15,
  };
  const list = useRequests(query);
  const isManager = useCurrentUser().role === 'MANAGER';
  const assignees = useAssignees({ enabled: isManager });
  const hasFilters = FILTER_KEYS.some((k) => params.get(k));

  const clear = () => {
    setSearch('');
    update(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));
  };

  // Deadlines read soonest first; everything else newest or highest first.
  const toggleSort = (field: SortField) => {
    const first = field === 'dueAt' ? 'asc' : 'desc';
    const flipped = first === 'asc' ? 'desc' : 'asc';
    update({ sort: field, order: sort === field && order === first ? flipped : first }, false);
  };

  const open = (r: ServiceRequest) => navigate(`/requests/${r.id}`);

  return (
    <>
      <PageHeader
        title={scope === 'mine' ? 'My requests' : isManager ? 'All requests' : 'Requests'}
        subtitle={
          scope === 'mine'
            ? 'Requests assigned to you, newest first.'
            : isManager
              ? 'Every request the team has registered.'
              : 'Your requests, the ones you reported, and everything the team has resolved.'
        }
        actions={
          <Link
            to="/requests/new"
            className="inline-flex h-9 items-center gap-2 rounded-control bg-navy px-3.5 text-sm font-medium text-white transition-[background-color,transform] duration-150 hover:bg-navy-3 active:scale-[0.97]"
          >
            <Plus className="size-4" aria-hidden /> New request
          </Link>
        }
      />

      <Panel className="overflow-hidden">
        <div
          role="search"
          className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:flex sm:flex-wrap sm:items-center"
        >
          <div className="relative col-span-2 sm:min-w-56 sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, requester, contact or SR number"
              aria-label="Search requests"
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Filter by status"
            value={get('status') ?? ''}
            onChange={(e) => update({ status: e.target.value })}
            className="w-full sm:w-36"
          >
            <option value="">Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by priority"
            value={get('priority') ?? ''}
            onChange={(e) => update({ priority: e.target.value })}
            className="w-full sm:w-36"
          >
            <option value="">Priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by source"
            value={get('source') ?? ''}
            onChange={(e) => update({ source: e.target.value })}
            className="w-full sm:w-32"
          >
            <option value="">Source</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
          {scope === 'all' && (
            <Select
              aria-label="Filter by assignee"
              value={get('assignee') ?? ''}
              onChange={(e) => update({ assignee: e.target.value })}
              className="w-full sm:w-40"
            >
              <option value="">Assignee</option>
              {!isManager && <option value="me">Assigned to me</option>}
              <option value="none">Unassigned</option>
              {isManager &&
                assignees.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          )}
          <Select
            aria-label="Filter by category"
            value={get('category') ?? ''}
            onChange={(e) => update({ category: e.target.value })}
            className="w-full sm:w-40"
          >
            <option value="">Category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by deadline"
            value={get('due') ?? ''}
            onChange={(e) => update({ due: e.target.value })}
            className="w-full sm:w-32"
          >
            <option value="">Deadline</option>
            <option value="overdue">Overdue</option>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clear} className="col-span-2 sm:col-span-1">
              <X className="size-3.5" aria-hidden /> Clear filters
            </Button>
          )}
        </div>

        {/* thin progress line while a new page/filter loads over the previous results */}
        <div className="relative h-0.5 overflow-hidden" aria-hidden>
          {list.isFetching && !list.isPending && (
            <motion.span
              className="absolute inset-y-0 w-1/3 bg-cobalt/60"
              initial={{ transform: 'translateX(-100%)' }}
              animate={{ transform: 'translateX(300%)' }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
            />
          )}
        </div>

        {list.isPending ? (
          <RequestListSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<SearchX />}
              title="No requests match your search or filters."
              body="Try a different word or remove a filter."
              action={
                <Button size="sm" onClick={clear}>
                  Clear filters
                </Button>
              }
            />
          ) : scope === 'mine' ? (
            <EmptyState
              icon={<ListTodo />}
              title="You don't have any assigned requests at the moment."
              body="When your manager assigns you something, it shows up here."
            />
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="There are no requests yet."
              body="Create your first request to get started."
              action={
                <Link
                  to="/requests/new"
                  className="text-sm font-medium text-cobalt hover:underline"
                >
                  Create a request
                </Link>
              }
            />
          )
        ) : (
          <div
            className={cx(
              'transition-opacity duration-200',
              list.isPlaceholderData && 'opacity-60',
            )}
          >
            <RequestTable
              items={list.data.items}
              sort={sort}
              order={order}
              onSort={toggleSort}
              onOpen={open}
            />
            <MobileList items={list.data.items} />
            <Pagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              pageSize={list.data.pageSize}
              onPage={(p) => update({ page: p > 1 ? String(p) : undefined }, false)}
            />
          </div>
        )}
      </Panel>
    </>
  );
}

// Columns fold away on narrower screens instead of scrolling sideways.
const columns: {
  label: string;
  sort?: SortField;
  className?: string;
  dates?: true;
  show?: string;
}[] = [
  // Title, deadline, status and assignee come first; the rest appear only on wide screens.
  { label: 'Reference', sort: 'referenceNumber', className: 'w-[7rem]' },
  { label: 'Title', sort: 'title' },
  { label: 'Requester', className: 'w-[9rem]', show: 'hidden min-[1600px]:table-cell' },
  { label: 'Source', className: 'w-[4rem]', show: 'hidden min-[1600px]:table-cell' },
  { label: 'Priority', sort: 'priority', className: 'w-[6rem]' },
  { label: 'Status', className: 'w-[7.25rem]' },
  // Below xl the deadline shows under the title instead.
  { label: 'Deadline', sort: 'dueAt', className: 'w-[12rem]', show: 'hidden xl:table-cell' },
  { label: 'Assignee', className: 'w-[10rem]' },
  // Created and Updated share one stacked column so Title keeps the width.
  {
    label: 'Created / Updated',
    className: 'w-[9.5rem]',
    dates: true,
    show: 'hidden min-[1760px]:table-cell',
  },
];

function SortButton({
  field,
  label,
  sort,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  order: 'asc' | 'desc';
  onSort: (f: SortField) => void;
}) {
  const active = sort === field;
  const Icon = active ? (order === 'asc' ? ArrowUp : ArrowDown) : null;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cx(
        'inline-flex items-center gap-0.5 rounded transition-colors hover:text-ink',
        active && 'text-ink',
      )}
    >
      {label}
      {Icon && <Icon className="size-3.5" aria-hidden />}
    </button>
  );
}

function RequestTable({
  items,
  sort,
  order,
  onSort,
  onOpen,
}: {
  items: ServiceRequest[];
  sort: SortField;
  order: 'asc' | 'desc';
  onSort: (f: SortField) => void;
  onOpen: (r: ServiceRequest) => void;
}) {
  return (
    <div className="relative hidden md:block">
      <table className="w-full table-fixed border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-canvas/60">
            {columns.map((c) => {
              const active = c.sort === sort;
              const SortIcon = active ? (order === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
              return (
                <th
                  key={c.label}
                  scope="col"
                  aria-sort={
                    active || (c.dates && (sort === 'createdAt' || sort === 'updatedAt'))
                      ? order === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  className={cx(
                    'px-2.5 py-2.5 text-xs font-medium whitespace-nowrap text-ink-2 first:pl-4',
                    c.className,
                    c.show,
                  )}
                >
                  {c.dates ? (
                    <span className="inline-flex items-center gap-1">
                      <SortButton
                        field="createdAt"
                        label="Created"
                        sort={sort}
                        order={order}
                        onSort={onSort}
                      />
                      <span aria-hidden className="text-ink-3">
                        /
                      </span>
                      <SortButton
                        field="updatedAt"
                        label="Updated"
                        sort={sort}
                        order={order}
                        onSort={onSort}
                      />
                    </span>
                  ) : c.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.sort!)}
                      className={cx(
                        '-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-ink',
                        active && 'text-ink',
                      )}
                    >
                      {c.label}
                      <SortIcon className={cx('size-3.5', !active && 'opacity-40')} aria-hidden />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.id}
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('a')) onOpen(r);
              }}
              className="group cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-canvas"
            >
              <td className="py-3 pr-2.5 pl-4 whitespace-nowrap">
                <span className="flex items-center gap-2.5">
                  <LifecycleRail status={r.status} size="xs" />
                  <RequestRef value={r.referenceNumber} className="text-[11px]" />
                </span>
              </td>
              <td className="px-2.5 py-3">
                <Link
                  to={`/requests/${r.id}`}
                  title={r.title}
                  className="block truncate text-[15px] font-medium text-ink decoration-ink-3/60 group-hover:underline"
                >
                  {r.title}
                </Link>
                {r.dueAt && r.status !== 'RESOLVED' && (
                  <DueBadge dueAt={r.dueAt} status={r.status} className="mt-1 xl:hidden" />
                )}
              </td>
              <td
                className="hidden truncate px-2.5 py-3 text-ink-2 min-[1600px]:table-cell"
                title={r.requesterName}
              >
                {r.requesterName}
              </td>
              <td className="hidden px-2.5 py-3 min-[1600px]:table-cell">
                <SourceLabel source={r.source} iconOnly />
              </td>
              <td className="px-2.5 py-3">
                <RequestPriority request={r} />
              </td>
              <td className="px-2.5 py-3">
                <StatusBadge status={r.status} />
              </td>
              <td className="hidden overflow-hidden px-2.5 py-3 xl:table-cell">
                {r.dueAt && r.status !== 'RESOLVED' ? (
                  <DueBadge dueAt={r.dueAt} status={r.status} className="max-w-full" />
                ) : (
                  <span className="text-ink-3">–</span>
                )}
              </td>
              <td className="px-2.5 py-3">
                {r.assignedTo ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={r.assignedTo.name} size="xs" />
                    <span className="truncate text-sm">{r.assignedTo.name}</span>
                  </span>
                ) : (
                  <span className="text-ink-3">Unassigned</span>
                )}
              </td>
              <td className="tabular hidden px-2.5 py-2.5 leading-tight whitespace-nowrap min-[1760px]:table-cell">
                <span className="block text-ink-2" title={`Created ${formatDateTime(r.createdAt)}`}>
                  {formatShortDate(r.createdAt)}
                </span>
                <span
                  className="block text-xs text-ink-3"
                  title={`Updated ${formatDateTime(r.updatedAt)}`}
                >
                  upd. {formatShortDate(r.updatedAt)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileList({ items }: { items: ServiceRequest[] }) {
  return (
    <ul className="divide-y divide-line md:hidden">
      {items.map((r) => (
        <li key={r.id}>
          <Link to={`/requests/${r.id}`} className="block px-4 py-3 active:bg-canvas">
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <LifecycleRail status={r.status} size="xs" />
                <RequestRef value={r.referenceNumber} className="text-[11px]" />
              </span>
              <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
                <DueBadge dueAt={r.dueAt} status={r.status} className="max-w-full" />
                <RequestPriority request={r} />
              </span>
            </span>
            <span className="mt-1.5 block text-[15px] font-medium text-ink">{r.title}</span>
            <span className="mt-1 flex items-center justify-between gap-3 text-xs text-ink-2">
              <span className="truncate">{r.requesterName}</span>
              <span className="shrink-0">{r.assignedTo?.name ?? 'Unassigned'}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 border-t border-line px-4 py-3 text-[13px] text-ink-2"
    >
      <span className="tabular">
        {from} to {to} of {total}
      </span>
      <span className="flex items-center gap-2">
        <span className="tabular hidden sm:inline">
          Page {page} of {totalPages}
        </span>
        <Button
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </span>
    </nav>
  );
}
