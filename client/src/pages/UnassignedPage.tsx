import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { PRIORITIES, PRIORITY_LABEL, type Priority, type ServiceRequest } from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useAssignees, useRequests, useTriage } from '../lib/queries';
import { ErrorState } from '../components/errors';
import { UnassignedSkeleton } from '../components/skeletons';
import { formatDate, formatDateTime, timeAgo } from '../lib/format';
import { DeadlineInput, deadlineOf, deadlineToIso } from '../components/DeadlineInput';
import { Button, EmptyState, PageHeader, Panel, Select } from '../components/ui';
import { PriorityBadge, RequestRef, SourceLabel } from '../components/request-bits';
import { Pagination } from './RequestsPage';

/**
 * The manager's review queue: open requests nobody owns yet, including everything employees
 * report. Each one gets a priority, an optional deadline and an owner in one step.
 */
export function UnassignedPage() {
  const user = useCurrentUser();
  if (user.role !== 'MANAGER') return <Navigate to="/" replace />;
  return <ReviewQueue />;
}

function ReviewQueue() {
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
        title="To review"
        subtitle="New and unassigned requests, most urgent first. Set the priority and deadline, then give each one an owner."
      />
      <Panel className="overflow-hidden">
        {list.isPending ? (
          <UnassignedSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title="Nothing to review"
            body="Requests your team reports, and any that lose their owner, will show up here."
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
                    <ReviewRow request={r} />
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

function ReviewRow({ request: r }: { request: ServiceRequest }) {
  const assignees = useAssignees();
  const triage = useTriage(r);
  const [priority, setPriority] = useState<Priority>(r.priority);
  const [due, setDue] = useState(deadlineOf(r.dueAt));
  const [assignee, setAssignee] = useState('');

  return (
    <div className="flex flex-col gap-4 bg-surface px-4 py-4 xl:flex-row xl:items-center xl:gap-6">
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
            {formatDate(r.createdAt)} ({timeAgo(r.createdAt)})
          </time>
          <span className="text-xs text-ink-3">
            reported by <span className="font-medium text-ink-2">{r.createdBy.name}</span>
          </span>
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
      <form
        className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (!assignee) return;
          triage.mutate({
            priority,
            dueAt: deadlineToIso(due),
            assignedToId: Number(assignee),
          });
        }}
      >
        <Select
          aria-label={`Priority for ${r.referenceNumber}`}
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="sm:w-28"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        <DeadlineInput
          label={`Deadline for ${r.referenceNumber}`}
          value={due}
          onChange={setDue}
          className="col-span-2 sm:col-span-1 sm:w-[17rem]"
        />
        <Select
          aria-label={`Assignee for ${r.referenceNumber}`}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="col-span-2 sm:col-span-1 sm:w-48"
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
          variant="primary"
          disabled={!assignee}
          loading={triage.isPending}
          className="col-span-2 sm:col-span-1"
        >
          Assign
        </Button>
      </form>
    </div>
  );
}
