import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  FileQuestion,
  Hand,
  MessageSquareText,
  PencilLine,
  PlayCircle,
  RotateCcw,
} from 'lucide-react';
import {
  canAssign,
  canWorkOn,
  noteSchema,
  PRIORITIES,
  PRIORITY_LABEL,
  SOURCES,
  SOURCE_LABEL,
  updateRequestSchema,
  type NoteInput,
  type Priority,
  type ServiceRequest,
  type Status,
  type User,
} from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import {
  useAddNote,
  useAssign,
  useAssignees,
  useChangeStatus,
  useNotes,
  useRequest,
  useRequestActivity,
  useUpdateRequest,
} from '../lib/queries';
import { ApiError, errorMessage } from '../lib/api';
import { formatDateTime, timeAgo } from '../lib/format';
import { ActivityList } from '../components/ActivityList';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  PanelHeader,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui';
import {
  LifecycleRail,
  PriorityBadge,
  RequestRef,
  SourceLabel,
  StatusBadge,
} from '../components/request-bits';

export function RequestDetailPage() {
  const id = Number(useParams().id);
  const q = useRequest(id);

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) {
    const missing =
      q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 400);
    return (
      <Panel>
        {missing ? (
          <EmptyState
            icon={<FileQuestion />}
            title="This request doesn’t exist"
            body="It may have the wrong number in the address. Check the reference and try again."
            action={
              <Link to="/requests" className="text-sm font-medium text-cobalt hover:underline">
                Back to all requests
              </Link>
            }
          />
        ) : (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        )}
      </Panel>
    );
  }
  return <RequestView request={q.data} />;
}

function RequestView({ request: r }: { request: ServiceRequest }) {
  const user = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const mayWork = canWorkOn(user, { assignedToId: r.assignedTo?.id ?? null });
  const resolved = r.status === 'RESOLVED';

  return (
    <>
      <Link
        to="/requests"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> All requests
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <RequestRef value={r.referenceNumber} className="text-[13px]" />
            <StatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} />
          </div>
          <h1 className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.015em] text-ink">
            {r.title}
          </h1>
        </div>
        {mayWork && !resolved && (
          <Button onClick={() => setEditing(true)}>
            <PencilLine className="size-4" aria-hidden /> Edit
          </Button>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <LifecyclePanel request={r} user={user} mayWork={mayWork} />
          <Panel>
            <PanelHeader title="Description" />
            <p className="px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {r.description}
            </p>
          </Panel>
          <NotesPanel request={r} mayWork={mayWork} />
          <ActivityPanel requestId={r.id} />
        </div>
        <PropertiesPanel request={r} user={user} mayWork={mayWork} />
      </div>

      <EditDialog request={r} open={editing} onClose={() => setEditing(false)} />
    </>
  );
}

// ---------- Lifecycle ----------

function LifecyclePanel({
  request: r,
  user,
  mayWork,
}: {
  request: ServiceRequest;
  user: User;
  mayWork: boolean;
}) {
  const change = useChangeStatus(r.id);
  const assign = useAssign(r.id);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [pending, setPending] = useState<Status | null>(null);

  const go = async (status: Status) => {
    setPending(status);
    try {
      await change.mutateAsync({ status, version: r.version });
      setConfirmReopen(false);
    } catch {
      /* toast shown by the mutation */
    } finally {
      setPending(null);
    }
  };

  const canClaim =
    canAssign(user, { assignedToId: r.assignedTo?.id ?? null }, user.id) &&
    !r.assignedTo &&
    r.status !== 'RESOLVED';
  const noAssignee = !r.assignedTo;

  return (
    <Panel>
      <div className="px-4 pt-5 pb-4 sm:px-6">
        <LifecycleRail status={r.status} size="lg" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/50 px-4 py-3 sm:px-6">
        <p className="text-[13px] text-ink-2" aria-live="polite">
          {r.status === 'RESOLVED' && r.resolvedBy && r.resolvedAt ? (
            <>
              Resolved by <span className="font-medium text-ink">{r.resolvedBy.name}</span>{' '}
              <time dateTime={r.resolvedAt} title={formatDateTime(r.resolvedAt)}>
                {timeAgo(r.resolvedAt)}
              </time>
            </>
          ) : !mayWork ? (
            r.assignedTo ? (
              <>Only {r.assignedTo.name} or a manager can update this request.</>
            ) : (
              <>Unassigned. Claim it to start working on it.</>
            )
          ) : r.status === 'OPEN' && noAssignee ? (
            'Assign someone before starting work.'
          ) : r.status === 'OPEN' ? (
            'Waiting to be started.'
          ) : (
            'Work in progress.'
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {canClaim && !mayWork && (
            <Button
              variant="primary"
              size="sm"
              loading={assign.isPending}
              onClick={() => assign.mutate({ assignedToId: user.id, version: r.version })}
            >
              <Hand className="size-3.5" aria-hidden /> Assign to me
            </Button>
          )}
          {mayWork && r.status === 'OPEN' && (
            <Button
              size="sm"
              onClick={() => void go('IN_PROGRESS')}
              disabled={noAssignee}
              loading={pending === 'IN_PROGRESS'}
            >
              <PlayCircle className="size-3.5" aria-hidden /> Start work
            </Button>
          )}
          {mayWork && r.status !== 'RESOLVED' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void go('RESOLVED')}
              loading={pending === 'RESOLVED'}
            >
              <CheckCircle2 className="size-3.5" aria-hidden /> Resolve
            </Button>
          )}
          {mayWork && r.status === 'RESOLVED' && (
            <Button size="sm" onClick={() => setConfirmReopen(true)}>
              <RotateCcw className="size-3.5" aria-hidden /> Reopen
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmReopen}
        title={`Reopen ${r.referenceNumber}?`}
        body="It goes back to Open and the current resolution is cleared. The history keeps a record of who resolved it."
        confirmLabel="Reopen request"
        loading={pending === 'OPEN'}
        onConfirm={() => void go('OPEN')}
        onClose={() => setConfirmReopen(false)}
      />
    </Panel>
  );
}

// ---------- Properties ----------

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-2.5">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function PropertiesPanel({
  request: r,
  user,
  mayWork,
}: {
  request: ServiceRequest;
  user: User;
  mayWork: boolean;
}) {
  const assignees = useAssignees();
  const assign = useAssign(r.id);
  const update = useUpdateRequest(r.id);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const resolved = r.status === 'RESOLVED';
  const isManager = user.role === 'MANAGER';

  const onAssign = (value: string) => {
    if (value === '') return setConfirmUnassign(true);
    assign.mutate({ assignedToId: Number(value), version: r.version });
  };

  return (
    <Panel className="lg:sticky lg:top-6">
      <PanelHeader title="Details" />
      <dl className="divide-y divide-line">
        <Row label="Assignee">
          {isManager && !resolved ? (
            <Select
              aria-label="Assignee"
              value={r.assignedTo?.id ?? ''}
              onChange={(e) => onAssign(e.target.value)}
              disabled={assign.isPending}
            >
              <option value="">Unassigned</option>
              {/* keep the current assignee selectable even if the list is loading */}
              {r.assignedTo && !assignees.data?.some((u) => u.id === r.assignedTo!.id) && (
                <option value={r.assignedTo.id}>{r.assignedTo.name}</option>
              )}
              {assignees.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.activeCount ? ` (${u.activeCount})` : ''}
                </option>
              ))}
            </Select>
          ) : r.assignedTo ? (
            <span className="flex items-center gap-2">
              <Avatar name={r.assignedTo.name} size="xs" />
              {r.assignedTo.name}
            </span>
          ) : (
            <span className="text-ink-3">Unassigned</span>
          )}
        </Row>
        <Row label="Priority">
          {mayWork && !resolved ? (
            <Select
              aria-label="Priority"
              value={r.priority}
              disabled={update.isPending}
              onChange={(e) =>
                update.mutate({ priority: e.target.value as Priority, version: r.version })
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          ) : (
            <PriorityBadge priority={r.priority} />
          )}
        </Row>
        <Row label="Source">
          <SourceLabel source={r.source} />
        </Row>
        <Row label="Requester">{r.requesterName}</Row>
        <Row label="Contact">
          <span className="break-words">{r.requesterContact}</span>
        </Row>
        <Row label="Created by">{r.createdBy.name}</Row>
        <Row label="Created">
          <time dateTime={r.createdAt}>{formatDateTime(r.createdAt)}</time>
        </Row>
        <Row label="Updated">
          <time dateTime={r.updatedAt}>{formatDateTime(r.updatedAt)}</time>
        </Row>
        <Row label="Resolved by">{r.resolvedBy?.name ?? <span className="text-ink-3">—</span>}</Row>
        <Row label="Resolved">
          {r.resolvedAt ? (
            <time dateTime={r.resolvedAt}>{formatDateTime(r.resolvedAt)}</time>
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </Row>
      </dl>
      <ConfirmDialog
        open={confirmUnassign}
        title={`Unassign ${r.assignedTo?.name ?? ''}?`}
        body={
          r.status === 'IN_PROGRESS'
            ? 'The request will go back to Open because work cannot be in progress without an owner.'
            : 'The request will go back to the unassigned queue.'
        }
        confirmLabel="Unassign"
        danger
        loading={assign.isPending}
        onConfirm={() =>
          assign.mutate(
            { assignedToId: null, version: r.version },
            { onSettled: () => setConfirmUnassign(false) },
          )
        }
        onClose={() => setConfirmUnassign(false)}
      />
    </Panel>
  );
}

// ---------- Edit ----------

type EditValues = {
  title: string;
  description: string;
  requesterName: string;
  requesterContact: string;
  source: ServiceRequest['source'];
  priority: Priority;
  version: number;
};

function EditDialog({
  request: r,
  open,
  onClose,
}: {
  request: ServiceRequest;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`Edit ${r.referenceNumber}`} width="max-w-xl">
      {/* Remount the form on every open so it starts from the latest saved values. */}
      {open && <EditForm request={r} onDone={onClose} />}
    </Dialog>
  );
}

function EditForm({ request: r, onDone }: { request: ServiceRequest; onDone: () => void }) {
  const update = useUpdateRequest(r.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<EditValues>({
    resolver: zodResolver(updateRequestSchema) as never,
    defaultValues: {
      title: r.title,
      description: r.description,
      requesterName: r.requesterName,
      requesterContact: r.requesterContact,
      source: r.source,
      priority: r.priority,
      version: r.version,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Send only what changed, so the activity log records exactly the edited fields.
    const changed = Object.fromEntries(
      Object.entries(values).filter(([k]) => dirtyFields[k as keyof EditValues]),
    ) as Partial<EditValues>;
    try {
      await update.mutateAsync({ ...changed, version: r.version });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        for (const [field, msgs] of Object.entries(err.details)) {
          if (msgs[0]) setError(field as keyof EditValues, { message: msgs[0] });
        }
      }
      if (err instanceof ApiError && err.code === 'STALE_VERSION') onDone();
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field id="edit-title" label="Title" error={errors.title?.message}>
        <Input id="edit-title" aria-invalid={!!errors.title} {...register('title')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="edit-requesterName" label="Requester name" error={errors.requesterName?.message}>
          <Input
            id="edit-requesterName"
            aria-invalid={!!errors.requesterName}
            {...register('requesterName')}
          />
        </Field>
        <Field
          id="edit-requesterContact"
          label="Contact information"
          error={errors.requesterContact?.message}
        >
          <Input
            id="edit-requesterContact"
            aria-invalid={!!errors.requesterContact}
            {...register('requesterContact')}
          />
        </Field>
      </div>
      <Field id="edit-description" label="Description" error={errors.description?.message}>
        <Textarea
          id="edit-description"
          rows={5}
          aria-invalid={!!errors.description}
          {...register('description')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="edit-source" label="Source">
          <Select id="edit-source" {...register('source')}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="edit-priority" label="Priority">
          <Select id="edit-priority" {...register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <input type="hidden" {...register('version', { valueAsNumber: true })} />
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

// ---------- Notes ----------

function NotesPanel({ request: r, mayWork }: { request: ServiceRequest; mayWork: boolean }) {
  const notes = useNotes(r.id);
  const add = useAddNote(r.id);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<NoteInput>({ resolver: zodResolver(noteSchema) });

  const onSubmit = handleSubmit(async ({ content }) => {
    try {
      await add.mutateAsync(content);
      reset({ content: '' });
    } catch (err) {
      setError('content', { message: errorMessage(err) });
    }
  });

  return (
    <Panel>
      <PanelHeader title={`Internal notes${notes.data?.length ? ` (${notes.data.length})` : ''}`} />
      <div className="px-4 py-4">
        {notes.isPending ? (
          <div className="space-y-3">
            <Skeleton className="w-2/3" />
            <Skeleton className="w-1/2" />
          </div>
        ) : notes.isError ? (
          <ErrorState message={errorMessage(notes.error)} onRetry={() => void notes.refetch()} />
        ) : notes.data.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-[13px] text-ink-3">
            <MessageSquareText className="size-4" aria-hidden /> No internal notes yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {notes.data.map((n) => (
                <motion.li
                  key={n.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                  className="flex gap-3"
                >
                  <Avatar name={n.author.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                      <span className="font-medium text-ink">{n.author.name}</span>
                      <time
                        dateTime={n.createdAt}
                        className="text-xs text-ink-3"
                        title={formatDateTime(n.createdAt)}
                      >
                        {formatDateTime(n.createdAt)}
                      </time>
                    </p>
                    <p className="mt-1 rounded-[0_8px_8px_8px] bg-sunken px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                      {n.content}
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      {mayWork ? (
        <form onSubmit={onSubmit} noValidate className="border-t border-line px-4 py-3">
          <label htmlFor="note" className="sr-only">
            Add an internal note
          </label>
          <Textarea
            id="note"
            rows={2}
            placeholder="Add an internal note for the team…"
            aria-invalid={!!errors.content}
            className="min-h-16"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void onSubmit();
            }}
            {...register('content')}
          />
          {errors.content && (
            <p id="note-error" role="alert" className="mt-1.5 text-[13px] text-urgent">
              {errors.content.message}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="hidden text-xs text-ink-3 sm:inline">Ctrl + Enter to add</span>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={add.isPending}
              className="ml-auto"
            >
              Add note
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-[13px] text-ink-3">
          Only the assignee or a manager can add notes to this request.
        </p>
      )}
    </Panel>
  );
}

function ActivityPanel({ requestId }: { requestId: number }) {
  const q = useRequestActivity(requestId);
  return (
    <Panel>
      <PanelHeader title="Activity history" />
      <div className="px-4 py-4">
        {q.isPending ? (
          <div className="space-y-3">
            <Skeleton className="w-3/4" />
            <Skeleton className="w-1/2" />
          </div>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : (
          <ActivityList items={q.data} />
        )}
      </div>
    </Panel>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading request">
      <Skeleton className="mb-5 w-24" />
      <Skeleton className="mb-3 w-40" />
      <Skeleton className="mb-8 h-6 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="h-56">{null}</Panel>
        <Panel className="h-80">{null}</Panel>
      </div>
    </div>
  );
}
