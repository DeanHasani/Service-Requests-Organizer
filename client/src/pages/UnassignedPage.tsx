import { useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Hand } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceRequest } from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useAssign, useAssignees, useRequests } from '../lib/queries';
import { ErrorState } from '../components/errors';
import { UnassignedSkeleton } from '../components/skeletons';
import { formatDate, formatDateTime, timeAgo } from '../lib/format';
import { Button, EmptyState, PageHeader, Panel, Select } from '../components/ui';
import { PriorityBadge, RequestRef, SourceLabel } from '../components/request-bits';
import { Pagination } from './RequestsPage';

export function UnassignedPage() {
  const [page, setPage] = useState(1);
  const list = useRequests({
    assignee: 'none',
    status: 'OPEN',
    sort: 'priority',
    order: 'desc',
    page,
    pageSize: 10,
  });

  return (
    <>
      <PageHeader
        title="Unassigned"
        subtitle="Open requests nobody owns yet, most urgent first. Give each one an owner."
      />
      <Panel className="overflow-hidden">
        {list.isPending ? (
          <UnassignedSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title="Every open request has an owner"
            body="New requests without an assignee will appear here."
          />
        ) : (
          <>
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false}>
                {list.data.items.map((r) => (
                  <motion.li
                    key={r.id}
                    layout
                    exit={{
                      opacity: 0,
                      transform: 'translateX(24px)',
                      transition: { duration: 0.22 },
                    }}
                    transition={{ layout: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } }}
                  >
                    <UnassignedRow request={r} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <Pagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              pageSize={list.data.pageSize}
              onPage={setPage}
            />
          </>
        )}
      </Panel>
    </>
  );
}

function UnassignedRow({ request: r }: { request: ServiceRequest }) {
  const user = useCurrentUser();
  const assignees = useAssignees();
  const assign = useAssign(r.id);
  const [choice, setChoice] = useState('');
  const isManager = user.role === 'MANAGER';

  // Feedback: the row slides out of the queue and a toast names the new owner.
  const doAssign = (id: number) =>
    assign.mutate(
      { assignedToId: id, version: r.version },
      {
        onSuccess: (res) =>
          toast.success(`${res.referenceNumber} assigned to ${res.assignedTo?.name}`),
      },
    );

  return (
    <div className="flex flex-col gap-3 bg-surface px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <RequestRef value={r.referenceNumber} className="text-[11px]" />
          <PriorityBadge priority={r.priority} />
          <span className="text-xs text-ink-3">
            <SourceLabel source={r.source} />
          </span>
          <time
            dateTime={r.createdAt}
            title={formatDateTime(r.createdAt)}
            className="text-xs text-ink-3"
          >
            Created {formatDate(r.createdAt)} ({timeAgo(r.createdAt)})
          </time>
        </div>
        <Link
          to={`/requests/${r.id}`}
          className="mt-1.5 block text-[15px] font-medium text-ink hover:underline"
        >
          {r.title}
        </Link>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">
          {r.requesterName}: {r.description}
        </p>
      </div>
      {isManager ? (
        <form
          className="flex w-full shrink-0 items-center gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            if (choice) doAssign(Number(choice));
          }}
        >
          <Select
            aria-label={`Assignee for ${r.referenceNumber}`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="min-w-0 flex-1 sm:w-48 sm:flex-none"
          >
            <option value="">Choose a person…</option>
            {assignees.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.activeCount} active)
              </option>
            ))}
          </Select>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={!choice}
            loading={assign.isPending}
          >
            Assign
          </Button>
        </form>
      ) : (
        <Button
          size="sm"
          variant="primary"
          loading={assign.isPending}
          onClick={() => doAssign(user.id)}
          className="self-start sm:self-auto"
        >
          <Hand className="size-3.5" aria-hidden /> Assign to me
        </Button>
      )}
    </div>
  );
}
