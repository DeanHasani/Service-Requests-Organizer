import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus, Users } from 'lucide-react';
import {
  createUserSchema,
  ROLE_LABEL,
  type CreateUserInput,
  type TeamMember,
} from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useCreateUser, useSetUserActive, useTeam } from '../lib/queries';
import { ApiError, errorMessage } from '../lib/api';
import { cx } from '../lib/format';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  Skeleton,
} from '../components/ui';

export function TeamPage() {
  const me = useCurrentUser();
  const team = useTeam();
  const setActive = useSetUserActive();
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<TeamMember | null>(null);
  const isManager = me.role === 'MANAGER';
  // Fixed scale (5 active = full bar) so equal small loads don't all read as "at capacity".
  const maxActive = Math.max(5, ...(team.data?.map((u) => u.activeCount) ?? [0]));

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Who is on the team and how much each person is carrying right now."
        actions={
          isManager && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" aria-hidden /> Add member
            </Button>
          )
        }
      />
      <Panel className="overflow-hidden">
        {team.isPending ? (
          <div aria-busy="true" aria-label="Loading team" className="divide-y divide-line">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="w-40" />
              </div>
            ))}
          </div>
        ) : team.isError ? (
          <ErrorState message={errorMessage(team.error)} onRetry={() => void team.refetch()} />
        ) : team.data.length === 0 ? (
          <EmptyState icon={<Users />} title="No team members yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-xs text-ink-2">
                  <th scope="col" className="py-2.5 pr-3 pl-4 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Account
                  </th>
                  <th scope="col" className="w-56 px-3 py-2.5 font-medium">
                    Active requests
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Resolved
                  </th>
                  {isManager && (
                    <th scope="col" className="px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {team.data.map((u) => (
                  <tr key={u.id} className={cx(!u.isActive && 'text-ink-3')}>
                    <td className="py-3 pr-3 pl-4">
                      <span className="flex items-center gap-3">
                        <Avatar
                          name={u.name}
                          size="md"
                          className={cx(!u.isActive && 'opacity-40 grayscale')}
                        />
                        <span className="min-w-0">
                          <span
                            className={cx(
                              'block font-medium',
                              u.isActive ? 'text-ink' : 'text-ink-3',
                            )}
                          >
                            {u.name}
                            {u.id === me.id && (
                              <span className="ml-1.5 font-normal text-ink-3">(you)</span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-ink-3">{u.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3 py-3">
                      <span
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                          u.isActive ? 'bg-resolved-soft text-resolved' : 'bg-sunken text-ink-3',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cx(
                            'size-1.5 rounded-full',
                            u.isActive ? 'bg-resolved-dot' : 'bg-ink-3',
                          )}
                        />
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-3">
                        <span className="tabular w-5 text-right font-medium text-ink">
                          {u.activeCount}
                        </span>
                        <span
                          aria-hidden
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"
                        >
                          <span
                            className="block h-full origin-left rounded-full bg-progress-dot transition-transform duration-500 ease-out"
                            style={{ transform: `scaleX(${u.activeCount / maxActive})` }}
                          />
                        </span>
                      </span>
                    </td>
                    <td className="tabular px-3 py-3 font-medium text-ink">{u.resolvedCount}</td>
                    {isManager && (
                      <td className="px-4 py-3 text-right">
                        {u.id !== me.id && (
                          <Button
                            size="sm"
                            variant={u.isActive ? 'ghost' : 'secondary'}
                            onClick={() => setTarget(u)}
                          >
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {isManager && <AddMemberDialog open={adding} onClose={() => setAdding(false)} />}
      <ConfirmDialog
        open={!!target}
        title={target?.isActive ? `Deactivate ${target?.name}?` : `Reactivate ${target?.name}?`}
        body={
          target?.isActive
            ? `They will be signed out and can no longer sign in or be assigned.${
                target.activeCount
                  ? ` Their ${target.activeCount} unresolved request(s) go back to the unassigned queue.`
                  : ''
              } Their history stays.`
            : 'They will be able to sign in and be assigned requests again.'
        }
        confirmLabel={target?.isActive ? 'Deactivate' : 'Reactivate'}
        danger={target?.isActive}
        loading={setActive.isPending}
        onConfirm={() =>
          target &&
          setActive.mutate(
            { id: target.id, isActive: !target.isActive },
            { onSettled: () => setTarget(null) },
          )
        }
        onClose={() => setTarget(null)}
      />
    </>
  );
}

function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add team member"
      description="They can sign in straight away with this email and password."
    >
      {open && <AddMemberForm onDone={onClose} />}
    </Dialog>
  );
}

function AddMemberForm({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'EMPLOYEE' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN')
        setError('email', { message: err.message });
      else setError('root', { message: errorMessage(err) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {errors.root && (
        <p
          role="alert"
          className="rounded-control bg-urgent-soft px-3 py-2 text-[13px] text-urgent"
        >
          {errors.root.message}
        </p>
      )}
      <Field id="member-name" label="Full name" error={errors.name?.message}>
        <Input id="member-name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
      </Field>
      <Field id="member-email" label="Work email" error={errors.email?.message}>
        <Input
          id="member-email"
          type="email"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="member-password"
          label="Temporary password"
          error={errors.password?.message}
          hint="At least 8 characters."
        >
          <Input
            id="member-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <Field id="member-role" label="Role">
          <Select id="member-role" {...register('role')}>
            <option value="EMPLOYEE">Employee</option>
            <option value="MANAGER">Manager</option>
          </Select>
        </Field>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Add member
        </Button>
      </div>
    </form>
  );
}
