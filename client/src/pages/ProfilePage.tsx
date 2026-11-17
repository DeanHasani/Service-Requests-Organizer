import { useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { ROLE_LABEL } from '@deskflow/shared';
import { useAuth, useCurrentUser } from '../lib/auth';
import { useInsights, useTeam } from '../lib/queries';
import { errorMessage } from '../lib/api';
import { ErrorState } from '../components/errors';
import { ChangePasswordForm } from '../components/account';
import { InsightsView } from '../components/InsightsView';
import { InsightsSkeleton, PersonCard } from './MemberPage';
import { Button, ConfirmDialog, PageHeader, Panel, PanelHeader } from '../components/ui';
import { toast } from 'sonner';

export function ProfilePage() {
  const me = useCurrentUser();
  const insights = useInsights(me.id);
  const team = useTeam();
  const managers = team.data?.filter((u) => u.role === 'MANAGER' && u.id !== me.id) ?? [];

  return (
    <>
      <PageHeader title="Profile" subtitle="Your work so far, and your account settings." />
      <PersonCard
        name={me.name}
        role={ROLE_LABEL[me.role]}
        email={me.email}
        extra={
          me.role === 'EMPLOYEE' && managers.length > 0 ? (
            <span className="text-sm text-ink-2">
              {managers.length === 1 ? 'Your manager: ' : 'Your managers: '}
              <span className="font-semibold text-ink">
                {managers.map((m) => m.name).join(', ')}
              </span>
            </span>
          ) : null
        }
      />

      <h2 className="mt-8 mb-3 text-lg font-bold text-ink">Insights</h2>
      {insights.isPending ? (
        <InsightsSkeleton />
      ) : insights.isError ? (
        <Panel>
          <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
        </Panel>
      ) : (
        <InsightsView data={insights.data} self />
      )}

      <h2 className="mt-8 mb-3 text-lg font-bold text-ink">Account</h2>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Change password" />
          <div className="p-4 sm:p-5">
            <ChangePasswordForm />
          </div>
        </Panel>
        <SignOutEverywhere />
      </div>
    </>
  );
}

function SignOutEverywhere() {
  const { logoutEverywhere } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Panel>
      <PanelHeader title="Sessions" />
      <div className="flex flex-col items-start gap-4 p-4 sm:p-5">
        <p className="flex gap-3 text-sm text-ink-2">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
          Left yourself signed in on a shared or lost device? Sign out everywhere, including here.
        </p>
        <Button onClick={() => setOpen(true)}>
          <LogOut className="size-4" aria-hidden /> Sign out everywhere
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title="Sign out on every device?"
        body="You will be signed out here and on every other device. Sign in again with your password."
        confirmLabel="Sign out everywhere"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await logoutEverywhere();
          } catch (err) {
            toast.error(errorMessage(err));
            setBusy(false);
            setOpen(false);
          }
        }}
        onClose={() => setOpen(false)}
      />
    </Panel>
  );
}
