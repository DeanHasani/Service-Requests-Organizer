import { useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { ArrowLeft, KeyRound, Trash2, UserRoundCheck, UserRoundX } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABEL } from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useDeleteUser, useInsights, useResetPassword, useSetUserActive } from '../lib/queries';
import { ApiError, errorMessage } from '../lib/api';
import { ErrorState } from '../components/errors';
import { TemporaryPasswordDialog } from '../components/account';
import { InsightsView } from '../components/InsightsView';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  Panel,
  Skeleton,
} from '../components/ui';
import { NotFoundPage } from './NotFoundPage';

/** A manager's view of one person: their insights plus account actions. */
export function MemberPage() {
  const me = useCurrentUser();
  const id = Number(useParams().id);
  if (!Number.isInteger(id) || id <= 0) return <NotFoundPage />;
  if (id === me.id) return <Navigate to="/profile" replace />;
  if (me.role !== 'MANAGER') return <NotFoundPage />;
  return <Member id={id} />;
}

function Member({ id }: { id: number }) {
  const insights = useInsights(id);
  const reset = useResetPassword();
  const setActive = useSetUserActive();
  const [confirm, setConfirm] = useState<'reset' | 'active' | 'delete' | null>(null);
  const [temp, setTemp] = useState<string | null>(null);

  if (insights.isError) {
    if (insights.error instanceof ApiError && insights.error.status === 404)
      return <NotFoundPage />;
    return (
      <Panel>
        <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
      </Panel>
    );
  }
  const m = insights.data?.member;

  return (
    <>
      <Link
        to="/team"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Team
      </Link>
      {m ? (
        <PersonCard
          name={m.name}
          role={ROLE_LABEL[m.role]}
          email={m.email ?? ''}
          inactive={!m.isActive}
          extra={
            m.mustChangePassword ? (
              <span className="text-sm text-high">Hasn’t chosen a password yet</span>
            ) : null
          }
          actions={
            <>
              {m.isActive && (
                <Button onClick={() => setConfirm('reset')}>
                  <KeyRound className="size-4" aria-hidden /> Reset password
                </Button>
              )}
              <Button
                variant={m.isActive ? 'ghost' : 'secondary'}
                onClick={() => setConfirm('active')}
              >
                {m.isActive ? (
                  <UserRoundX className="size-4" aria-hidden />
                ) : (
                  <UserRoundCheck className="size-4" aria-hidden />
                )}
                {m.isActive ? 'Deactivate' : 'Reactivate'}
              </Button>
              {!m.isActive && (
                <Button variant="danger" onClick={() => setConfirm('delete')}>
                  <Trash2 className="size-4" aria-hidden /> Delete account
                </Button>
              )}
            </>
          }
        />
      ) : (
        <Skeleton className="h-24 w-full rounded-panel" />
      )}

      <h2 className="mt-8 mb-3 text-lg font-bold text-ink">Insights</h2>
      {insights.data ? <InsightsView data={insights.data} self={false} /> : <InsightsSkeleton />}

      {m && (
        <>
          <ConfirmDialog
            open={confirm === 'reset'}
            title={`Reset ${m.name}’s password?`}
            body="They will be signed out everywhere and their current password will stop working. You’ll get a temporary password to give them; they choose their own when they sign in."
            confirmLabel="Reset password"
            loading={reset.isPending}
            onConfirm={() =>
              reset.mutate(m.id, {
                onSuccess: (r) => setTemp(r.temporaryPassword),
                onSettled: () => setConfirm(null),
              })
            }
            onClose={() => setConfirm(null)}
          />
          <ConfirmDialog
            open={confirm === 'active'}
            title={m.isActive ? `Deactivate ${m.name}?` : `Reactivate ${m.name}?`}
            body={
              m.isActive
                ? `They will be signed out and can no longer sign in or be assigned.${
                    m.activeCount
                      ? ` Their ${m.activeCount} unresolved request(s) go back to the review queue.`
                      : ''
                  } Their history stays.`
                : 'They will be able to sign in and be assigned requests again.'
            }
            confirmLabel={m.isActive ? 'Deactivate' : 'Reactivate'}
            danger={m.isActive}
            loading={setActive.isPending}
            onConfirm={() =>
              setActive.mutate(
                { id: m.id, isActive: !m.isActive },
                {
                  onSuccess: () => void insights.refetch(),
                  onSettled: () => setConfirm(null),
                },
              )
            }
            onClose={() => setConfirm(null)}
          />
          <TemporaryPasswordDialog name={m.name} password={temp} onClose={() => setTemp(null)} />
          <DeleteAccountDialog
            open={confirm === 'delete'}
            id={m.id}
            name={m.name}
            onClose={() => setConfirm(null)}
          />
        </>
      )}
    </>
  );
}

export function PersonCard({
  name,
  role,
  email,
  inactive,
  extra,
  actions,
}: {
  name: string;
  role: string;
  email: string;
  inactive?: boolean;
  extra?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <Avatar name={name} size="md" className="size-14! text-lg!" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xl font-bold text-ink">
          {name}
          {inactive && (
            <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-ink-3">
              Deactivated
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">
          {role}
          {email && <> · {email}</>}
        </p>
        {extra && <div className="mt-1.5">{extra}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </Panel>
  );
}

export function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[84px] rounded-panel" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-panel" />
    </div>
  );
}

/** Deleting is for good, so it is confirmed by typing the person's name. */
function DeleteAccountDialog({
  open,
  id,
  name,
  onClose,
}: {
  open: boolean;
  id: number;
  name: string;
  onClose: () => void;
}) {
  const del = useDeleteUser();
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const close = () => {
    setTyped('');
    setError(null);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Delete ${name}’s account?`}
      description="For someone who has left. This can’t be undone."
      width="max-w-md"
    >
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
        <li>They can never sign in again and leave the team lists.</li>
        <li>Their email becomes free for a new account.</li>
        <li>Everything they worked on keeps their name: resolved requests, notes and history.</li>
      </ul>
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!matches) return;
          setError(null);
          del.mutate(
            { id, confirmName: typed },
            {
              onSuccess: () => {
                toast.success(`${name}’s account was deleted`);
                close();
                navigate('/team', { replace: true });
              },
              onError: (err) => setError(errorMessage(err)),
            },
          );
        }}
      >
        <Field id="confirm-delete" label={`Type ${name} to confirm`} error={error ?? undefined}>
          <Input
            id="confirm-delete"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-invalid={!!error}
          />
        </Field>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={!matches} loading={del.isPending}>
            Delete account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
