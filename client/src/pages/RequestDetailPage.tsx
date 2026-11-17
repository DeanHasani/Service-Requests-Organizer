import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  MessageSquareText,
  PencilLine,
  PlayCircle,
  RotateCcw,
} from 'lucide-react';
import {
  canChangeStatus,
  canEditDetails,
  canTransition,
  canWorkOn,
  CATEGORIES,
  CATEGORY_LABEL,
  ESCALATION_HOURS,
  UNCATEGORISED,
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
import { ErrorPage, ErrorState, errorKind } from '../components/errors';
import { ActivitySkeleton, NotesSkeleton, RequestDetailSkeleton } from '../components/skeletons';
import { formatDateTime, formatDeadline, timeAgo } from '../lib/format';
import {
  DeadlineInput,
  deadlineOf,
  deadlineToIso,
  sameDeadline,
} from '../components/DeadlineInput';
import { ActivityList } from '../components/ActivityList';
import { ContactField } from '../components/ContactField';
import { toast } from 'sonner';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  Panel,
  PanelHeader,
  Select,
  Textarea,
} from '../components/ui';
import {
  Countdown,
  DueBadge,
  LifecycleRail,
  PriorityBadge,
  RequestRef,
  SourceLabel,
  StatusBadge,
} from '../components/request-bits';

export function RequestDetailPage() {
  const id = Number(useParams().id);
  const q = useRequest(id);

  if (q.isPending) return <RequestDetailSkeleton />;
  if (q.isError) {
    const kind = errorKind(q.error);
    if (kind === 'notFound') {
      return (
        <ErrorPage
          kind="notFound"
          title="Request not found"
          body="There is no request at this address. The number may be mistyped, or the link is old."
        >
          <Link
            to="/requests"
            className="mt-4 inline-block text-sm font-medium text-cobalt hover:underline"
          >
            Search all requests
          </Link>
        </ErrorPage>
      );
    }
    return <ErrorPage kind={kind} onRetry={() => void q.refetch()} />;
  }
  return <RequestView request={q.data} />;
}

function RequestView({ request: r }: { request: ServiceRequest }) {
  const user = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const mayNote = canWorkOn(user, { assignedToId: r.assignedTo?.id ?? null });
  const mayEdit = canEditDetails(user) && r.status !== 'RESOLVED';

  return (
    <>
      <Link
        to="/requests"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden />{' '}
        {user.role === 'MANAGER' ? 'All requests' : 'Requests'}
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <RequestRef value={r.referenceNumber} className="text-[13px]" />
            <StatusBadge status={r.status} />
            <PriorityBadge priority={r.priority} />
            <DueBadge dueAt={r.dueAt} status={r.status} />
          </div>
          <h1 className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.015em] text-ink">
            {r.title}
          </h1>
        </div>
        {mayEdit && (
          <Button onClick={() => setEditing(true)}>
            <PencilLine className="size-4" aria-hidden /> Edit details
          </Button>
        )}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <LifecyclePanel request={r} user={user} />
          <Panel>
            <PanelHeader title="Description" />
            <p className="px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {r.description}
            </p>
          </Panel>
          <NotesPanel request={r} mayWork={mayNote} />
          <ActivityPanel requestId={r.id} />
        </div>
        <PropertiesPanel request={r} user={user} />
      </div>

      {mayEdit && <EditDialog request={r} open={editing} onClose={() => setEditing(false)} />}
    </>
  );
}

// ---------- Lifecycle ----------

/** What the person looking at the request should know, in one sentence. */
function statusLine(r: ServiceRequest, user: User): ReactNode {
  const owner = r.assignedTo;
  if (r.status === 'RESOLVED' && r.resolvedBy && r.resolvedAt) {
    return (
      <>
        Resolved by <span className="font-medium text-ink">{r.resolvedBy.name}</span>{' '}
        <time dateTime={r.resolvedAt} title={formatDateTime(r.resolvedAt)}>
          {timeAgo(r.resolvedAt)}
        </time>
      </>
    );
  }
  if (!owner) {
    return user.role === 'MANAGER'
      ? 'Nobody owns this yet. Choose an assignee in Details.'
      : 'Waiting for your manager to review it and choose who works on it.';
  }
  if (owner.id === user.id) {
    return r.status === 'OPEN'
      ? 'Assigned to you. Start work when you pick it up.'
      : 'You are working on this. Resolve it when it is done.';
  }
  const name = <span className="font-medium text-ink">{owner.name}</span>;
  return r.status === 'OPEN' ? <>Waiting for {name} to start.</> : <>{name} is working on it.</>;
}

function LifecyclePanel({ request: r, user }: { request: ServiceRequest; user: User }) {
  const change = useChangeStatus(r.id);
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

  const owned = { assignedToId: r.assignedTo?.id ?? null, status: r.status };
  const may = (to: Status) => canTransition(r.status, to) && canChangeStatus(user, owned, to);

  return (
    <Panel>
      <div className="px-4 pt-5 pb-4 sm:px-6">
        <LifecycleRail status={r.status} size="lg" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas/50 px-4 py-3 sm:px-6">
        <p className="text-[13px] text-ink-2" aria-live="polite">
          {statusLine(r, user)}
        </p>
        <div className="flex flex-wrap gap-2">
          {may('IN_PROGRESS') && (
            <Button
              size="sm"
              onClick={() => void go('IN_PROGRESS')}
              loading={pending === 'IN_PROGRESS'}
            >
              <PlayCircle className="size-3.5" aria-hidden /> Start work
            </Button>
          )}
          {may('RESOLVED') && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void go('RESOLVED')}
              loading={pending === 'RESOLVED'}
            >
              <CheckCircle2 className="size-3.5" aria-hidden /> Resolve
            </Button>
          )}
          {may('OPEN') && (
            <Button size="sm" onClick={() => setConfirmReopen(true)}>
              <RotateCcw className="size-3.5" aria-hidden /> Reopen
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmReopen}
        title={`Reopen ${r.referenceNumber}?`}
        body={
          r.assignedTo && r.assignedTo.id !== user.id
            ? `It goes back to Open so ${r.assignedTo.name} can pick it up again. The history keeps a record of the earlier resolution.`
            : 'It goes back to Open and the current resolution is cleared. The history keeps a record of who resolved it.'
        }
        confirmLabel="Reopen request"
        loading={pending === 'OPEN'}
        onConfirm={() => void go('OPEN')}
        onClose={() => setConfirmReopen(false)}
      />
    </Panel>
  );
}

// ---------- Properties ----------

function Row({
  label,
  children,
  changed,
}: {
  label: string;
  children: ReactNode;
  changed?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 px-4 py-2.5">
      <dt className="flex items-center gap-1.5 text-[13px] text-ink-3">
        {label}
        {changed && (
          <span className="size-1.5 rounded-full bg-cobalt" title="Changed, not saved yet">
            <span className="sr-only">(changed, not saved yet)</span>
          </span>
        )}
      </dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function PropertiesPanel({ request: r, user }: { request: ServiceRequest; user: User }) {
  const editable = canEditDetails(user) && r.status !== 'RESOLVED';
  return (
    <Panel className="overflow-hidden lg:sticky lg:top-6">
      <PanelHeader title="Details" />
      <dl className="divide-y divide-line">
        {editable ? (
          // Remounts after every save, so the editor always starts from the saved values.
          <TriageEditor key={r.version} request={r} />
        ) : (
          <>
            <Row label="Assignee">
              {r.assignedTo ? (
                <span className="flex items-center gap-2">
                  <Avatar name={r.assignedTo.name} size="xs" />
                  {r.assignedTo.name}
                </span>
              ) : (
                <span className="text-ink-3">Unassigned</span>
              )}
            </Row>
            <Row label="Priority">
              <PriorityBadge priority={r.priority} />
            </Row>
            <Row label="Deadline">
              {r.dueAt ? (
                <span className="flex flex-col items-start gap-1">
                  <time dateTime={r.dueAt}>{formatDeadline(r.dueAt)}</time>
                  <Countdown dueAt={r.dueAt} status={r.status} />
                </span>
              ) : (
                <span className="text-ink-3">Not set</span>
              )}
            </Row>
            {r.dueAt && r.escalateTo && (
              <Row label="Auto priority">
                {r.escalatedAt
                  ? `Raised to ${PRIORITY_LABEL[r.escalateTo]}`
                  : `Rises to ${PRIORITY_LABEL[r.escalateTo]} in the last ${ESCALATION_HOURS} h`}
              </Row>
            )}
          </>
        )}
        <Row label="Source">
          <SourceLabel source={r.source} />
        </Row>
        <Row label="Category">
          {r.category ? (
            CATEGORY_LABEL[r.category]
          ) : (
            <span className="text-ink-3">{UNCATEGORISED}</span>
          )}
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
        <Row label="Resolved by">
          {r.resolvedBy?.name ?? <span className="text-ink-3">Not yet</span>}
        </Row>
        <Row label="Resolved">
          {r.resolvedAt ? (
            <time dateTime={r.resolvedAt}>{formatDateTime(r.resolvedAt)}</time>
          ) : (
            <span className="text-ink-3">Not yet</span>
          )}
        </Row>
      </dl>
    </Panel>
  );
}

/**
 * Manager's assignee, priority and deadline. Changes wait for an explicit Save; nothing saves on
 * its own.
 */
function TriageEditor({ request: r }: { request: ServiceRequest }) {
  const assignees = useAssignees();
  const assign = useAssign(r.id);
  const update = useUpdateRequest(r.id);
  const savedAssignee = String(r.assignedTo?.id ?? '');
  const [assignee, setAssignee] = useState(savedAssignee);
  const [priority, setPriority] = useState<Priority>(r.priority);
  const savedDue = deadlineOf(r.dueAt);
  const [due, setDue] = useState(savedDue);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const assigneeChanged = assignee !== savedAssignee;
  const priorityChanged = priority !== r.priority;
  const dueChanged = !sameDeadline(due, savedDue);
  const savedEscalate = r.escalateTo ?? '';
  const [escalate, setEscalate] = useState<string>(savedEscalate);
  // The rule only means something with a deadline; clearing the deadline drops it.
  const nextEscalate = due.date ? escalate : '';
  const escalateChanged = nextEscalate !== savedEscalate;
  const detailsChanged = priorityChanged || dueChanged || escalateChanged;
  const dirty = assigneeChanged || detailsChanged;
  const saving = assign.isPending || update.isPending;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const discard = () => {
    setAssignee(savedAssignee);
    setPriority(r.priority);
    setDue(savedDue);
    setEscalate(savedEscalate);
  };

  const save = async () => {
    setConfirmUnassign(false);
    try {
      let version = r.version;
      if (detailsChanged) {
        const changes = {
          ...(priorityChanged && { priority }),
          ...(dueChanged && { dueAt: deadlineToIso(due) }),
          ...(escalateChanged && { escalateTo: (nextEscalate || null) as Priority | null }),
        };
        version = (await update.mutateAsync({ ...changes, version })).version;
      }
      if (assigneeChanged) {
        await assign.mutateAsync({ assignedToId: assignee ? Number(assignee) : null, version });
        if (!detailsChanged) toast.success('Changes saved');
      }
    } catch {
      /* the mutation shows the error and refreshes the request */
    }
  };

  const onSave = () => (assigneeChanged && !assignee ? setConfirmUnassign(true) : void save());

  return (
    <>
      <Row label="Assignee" changed={assigneeChanged}>
        <Select
          aria-label="Assignee"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          disabled={saving}
        >
          <option value="">Unassigned</option>
          {/* keep the current assignee selectable even while the list loads */}
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
      </Row>
      <Row label="Priority" changed={priorityChanged}>
        <Select
          aria-label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          disabled={saving}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </Row>
      {/* Full width: date and time need more room than the value column gives */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-[13px] text-ink-3">
            Deadline
            {(dueChanged || escalateChanged) && (
              <span className="size-1.5 rounded-full bg-cobalt" title="Changed, not saved yet">
                <span className="sr-only">(changed, not saved yet)</span>
              </span>
            )}
          </dt>
          {r.dueAt ? (
            <Countdown dueAt={r.dueAt} status={r.status} />
          ) : (
            <span className="text-[13px] text-ink-3">Not set</span>
          )}
        </div>
        <dd className="mt-2 flex flex-col gap-2">
          <DeadlineInput value={due} onChange={setDue} disabled={saving} clearable />
          {due.date && (
            <label className="flex flex-col gap-1 text-[13px] text-ink-2">
              In the last {ESCALATION_HOURS} hours, raise priority to
              <Select
                value={escalate}
                onChange={(e) => setEscalate(e.target.value)}
                disabled={saving}
              >
                <option value="">Keep as it is</option>
                {PRIORITIES.filter((p) => p !== 'LOW').map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
              {r.escalatedAt && r.escalateTo && escalate === savedEscalate && (
                <span className="text-xs text-ink-3">
                  Already raised to {PRIORITY_LABEL[r.escalateTo]}. A new deadline re-arms it.
                </span>
              )}
            </label>
          )}
        </dd>
      </div>
      <AnimatePresence initial={false}>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden bg-cobalt-soft/60"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-[13px] font-medium text-ink" role="status">
                Unsaved changes
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={discard} disabled={saving}>
                  Discard
                </Button>
                <Button size="sm" variant="primary" onClick={onSave} loading={saving}>
                  Save changes
                </Button>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={confirmUnassign}
        title={`Unassign ${r.assignedTo?.name ?? ''}?`}
        body={
          r.status === 'IN_PROGRESS'
            ? 'The request will go back to Open because work cannot be in progress without an owner.'
            : 'The request will go back to the unassigned queue.'
        }
        confirmLabel="Unassign and save"
        danger
        loading={saving}
        onConfirm={() => void save()}
        onClose={() => setConfirmUnassign(false)}
      />
    </>
  );
}

// ---------- Edit details ----------

type EditValues = {
  title: string;
  description: string;
  requesterName: string;
  requesterContact: string;
  source: ServiceRequest['source'];
  category?: NonNullable<ServiceRequest['category']>;
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
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const close = () => {
    setDirty(false);
    setConfirmDiscard(false);
    onClose();
  };
  const requestClose = () => (dirty ? setConfirmDiscard(true) : close());

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        title={`Edit details of ${r.referenceNumber}`}
        description="Nothing changes until you press Save changes."
        width="max-w-xl"
      >
        {/* Remount the form on every open so it starts from the latest saved values. */}
        {open && <EditForm request={r} onDone={close} onCancel={requestClose} onDirty={setDirty} />}
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your changes?"
        body="You edited this request but did not save. If you leave now, your changes are lost."
        confirmLabel="Discard changes"
        danger
        onConfirm={close}
        onClose={() => setConfirmDiscard(false)}
      />
    </>
  );
}

function EditForm({
  request: r,
  onDone,
  onCancel,
  onDirty,
}: {
  request: ServiceRequest;
  onDone: () => void;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const update = useUpdateRequest(r.id);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<EditValues>({
    resolver: zodResolver(updateRequestSchema) as never,
    mode: 'onTouched',
    defaultValues: {
      title: r.title,
      description: r.description,
      requesterName: r.requesterName,
      requesterContact: r.requesterContact,
      source: r.source,
      category: r.category ?? undefined,
      version: r.version,
    },
  });
  useEffect(() => onDirty(isDirty), [isDirty, onDirty]);

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
        <Field id="edit-source" label="Source">
          <Select id="edit-source" {...register('source')}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="edit-category" label="Category" error={errors.category?.message}>
          <Select
            id="edit-category"
            aria-invalid={!!errors.category}
            {...register('category', { setValueAs: (v) => (v === '' ? undefined : v) })}
          >
            <option value="">Choose a category…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Controller
        name="requesterContact"
        control={control}
        render={({ field, fieldState }) => (
          <ContactField
            id="edit-requesterContact"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            invalid={!!fieldState.error}
            error={fieldState.error?.message}
          />
        )}
      />
      <Field id="edit-description" label="Description" error={errors.description?.message}>
        <Textarea
          id="edit-description"
          rows={5}
          aria-invalid={!!errors.description}
          {...register('description')}
        />
      </Field>
      <input type="hidden" {...register('version', { valueAsNumber: true })} />
      <div className="mt-2 flex items-center justify-end gap-2">
        {isDirty && <span className="mr-auto text-[13px] text-ink-2">Unsaved changes</span>}
        <Button onClick={onCancel}>Cancel</Button>
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
          <NotesSkeleton />
        ) : notes.isError ? (
          <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />
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
          <ActivitySkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          <ActivityList items={q.data} />
        )}
      </div>
    </Panel>
  );
}
