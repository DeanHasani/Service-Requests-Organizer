import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, Crown, UserPlus, Users } from 'lucide-react';
import {
  createUserSchema,
  ROLE_LABEL,
  type CreateUserInput,
  type TeamMember,
} from '@deskflow/shared';
import { useCurrentUser } from '../lib/auth';
import { useCreateUser, useSetUserActive, useTeam } from '../lib/queries';
import { ApiError, errorMessage } from '../lib/api';
import { ErrorState } from '../components/errors';
import { TeamSkeleton } from '../components/skeletons';
import { cx } from '../lib/format';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  PanelHeader,
  Select,
} from '../components/ui';

export function TeamPage() {
  const me = useCurrentUser();
  const isManager = me.role === 'MANAGER';
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Team"
        subtitle={
          isManager
            ? 'Your employees and how much each one is carrying. Open someone to see their work.'
            : 'Your manager and the coworkers you share the queue with.'
        }
        actions={
          isManager && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" aria-hidden /> Add member
            </Button>
          )
        }
      />
      {isManager ? <ManagerTeam /> : <EmployeeTeam />}
      {isManager && <AddMemberDialog open={adding} onClose={() => setAdding(false)} />}
    </>
  );
}

// Fixed scale (5 active = full bar) so equal small loads don't all read as "at capacity".
const scaleFor = (members: TeamMember[]) => Math.max(5, ...members.map((u) => u.activeCount));

/** Managers see the people they manage; other managers sit in their own section below. */
function ManagerTeam() {
  const me = useCurrentUser();
  const team = useTeam();
  const setActive = useSetUserActive();
  const navigate = useNavigate();
  const [target, setTarget] = useState<TeamMember | null>(null);

  if (team.isPending)
    return (
      <Panel className="overflow-hidden">
        <TeamSkeleton />
      </Panel>
    );
  if (team.isError)
    return (
      <Panel>
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      </Panel>
    );

  const employees = team.data.filter((u) => u.role === 'EMPLOYEE');
  const otherManagers = team.data.filter((u) => u.role === 'MANAGER' && u.id !== me.id);
  const maxActive = scaleFor(employees);
  const open = (u: TeamMember) => navigate(`/team/${u.id}`);

  return (
    <>
      <Panel className="overflow-hidden">
        <PanelHeader title={`Employees (${employees.length})`} />
        {employees.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No employees yet"
            body="Add someone so you can start assigning requests."
          />
        ) : (
          <>
            {/* Phones: one card per person */}
            <ul className="divide-y divide-line md:hidden">
              {employees.map((u) => (
                <li key={u.id}>
                  <Link to={`/team/${u.id}`} className="flex flex-col gap-3 px-4 py-4">
                    <span className="flex items-start justify-between gap-3">
                      <MemberName member={u} />
                      <AccountBadge active={u.isActive} />
                    </span>
                    <span className="flex items-center gap-3 text-[13px] text-ink-2">
                      <WorkloadBar count={u.activeCount} max={maxActive} />
                      <span className="shrink-0">
                        active,{' '}
                        <span className="tabular font-medium text-ink">{u.resolvedCount}</span>{' '}
                        resolved
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Tablet and up: rows open the person's page; the button handles the account */}
            <table className="hidden w-full text-left text-[13px] md:table">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-xs text-ink-2">
                  <th scope="col" className="py-2.5 pr-3 pl-4 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Account
                  </th>
                  <th scope="col" className="w-44 px-3 py-2.5 font-medium lg:w-56">
                    Active requests
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Resolved
                  </th>
                  <th scope="col" className="relative px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {employees.map((u) => (
                  <tr
                    key={u.id}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest('a,button')) open(u);
                    }}
                    className="group cursor-pointer transition-colors hover:bg-canvas"
                  >
                    <td className="py-3 pr-3 pl-4">
                      <Link to={`/team/${u.id}`} className="block">
                        <MemberName member={u} />
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <AccountBadge active={u.isActive} />
                    </td>
                    <td className="px-3 py-3">
                      <WorkloadBar count={u.activeCount} max={maxActive} />
                    </td>
                    <td className="tabular px-3 py-3 font-medium text-ink">{u.resolvedCount}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant={u.isActive ? 'ghost' : 'secondary'}
                        onClick={() => setTarget(u)}
                      >
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                      <ChevronRight
                        className="ml-1 inline size-4 text-ink-3 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      {otherManagers.length > 0 && (
        <Panel className="mt-6 overflow-hidden">
          <PanelHeader title="Other managers" />
          <ul className="divide-y divide-line">
            {otherManagers.map((u) => (
              <li key={u.id}>
                <Link
                  to={`/team/${u.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                >
                  <MemberName member={u} />
                  <AccountBadge active={u.isActive} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ConfirmDialog
        open={!!target}
        title={target?.isActive ? `Deactivate ${target?.name}?` : `Reactivate ${target?.name}?`}
        body={
          target?.isActive
            ? `They will be signed out and can no longer sign in or be assigned.${
                target.activeCount
                  ? ` Their ${target.activeCount} unresolved request(s) go back to the review queue.`
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

/** Employees see who they report to, set apart, then the coworkers they share the queue with. */
function EmployeeTeam() {
  const me = useCurrentUser();
  const team = useTeam();

  if (team.isPending)
    return (
      <Panel className="overflow-hidden">
        <TeamSkeleton />
      </Panel>
    );
  if (team.isError)
    return (
      <Panel>
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      </Panel>
    );

  const managers = team.data.filter((u) => u.role === 'MANAGER');
  const coworkers = team.data.filter((u) => u.role === 'EMPLOYEE' && u.id !== me.id);
  const maxActive = scaleFor(coworkers);

  return (
    <>
      <section aria-labelledby="your-manager">
        <h2 id="your-manager" className="mb-3 text-lg font-bold text-ink">
          {managers.length === 1 ? 'Your manager' : 'Your managers'}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {managers.map((m) => (
            <div
              key={m.id}
              className="ledger-cell flex items-center gap-4 rounded-panel bg-navy px-5 py-4 text-white"
            >
              <Avatar
                name={m.name}
                size="md"
                className="size-12! text-base! ring-2 ring-white/15"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-semibold">{m.name}</span>
                <span className="text-sm text-navy-ink">Manager · assigns your work</span>
              </span>
              <Crown className="size-5 shrink-0 text-progress-dot" aria-hidden />
            </div>
          ))}
          {managers.length === 0 && <p className="text-sm text-ink-2">No manager is set up yet.</p>}
        </div>
      </section>

      <Panel className="mt-8 overflow-hidden">
        <PanelHeader title={`Coworkers (${coworkers.length})`} />
        {coworkers.length === 0 ? (
          <EmptyState icon={<Users />} title="No coworkers yet" compact />
        ) : (
          <ul className="divide-y divide-line">
            {coworkers.map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6"
              >
                <span className="sm:w-72">
                  <MemberName member={u} />
                </span>
                <span className="flex flex-1 items-center gap-3 text-[13px] text-ink-2">
                  <WorkloadBar count={u.activeCount} max={maxActive} />
                  <span className="shrink-0">active</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function MemberName({ member: u }: { member: TeamMember }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={u.name} size="md" className={cx(!u.isActive && 'opacity-40 grayscale')} />
      <span className="min-w-0">
        <span
          className={cx('block text-[17px] font-semibold', u.isActive ? 'text-ink' : 'text-ink-3')}
        >
          {u.name}
        </span>
        <span className="block truncate text-xs text-ink-3">
          {ROLE_LABEL[u.role]}
          {u.email && <>, {u.email}</>}
          {u.mustChangePassword && <span className="text-high"> · password not set yet</span>}
        </span>
      </span>
    </span>
  );
}

function AccountBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        active ? 'bg-resolved-soft text-resolved' : 'bg-sunken text-ink-3',
      )}
    >
      <span
        aria-hidden
        className={cx('size-1.5 rounded-full', active ? 'bg-resolved-dot' : 'bg-ink-3')}
      />
      {active ? 'Active' : 'Deactivated'}
    </span>
  );
}

function WorkloadBar({ count, max }: { count: number; max: number }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="tabular w-5 shrink-0 text-right font-medium text-ink">{count}</span>
      <span aria-hidden className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-sunken">
        <span
          className="block h-full origin-left rounded-full bg-progress-dot transition-transform duration-500 ease-out"
          style={{ transform: `scaleX(${count / max})` }}
        />
      </span>
    </span>
  );
}

function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add team member"
      description="They sign in with this email and the temporary password, then choose their own."
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
