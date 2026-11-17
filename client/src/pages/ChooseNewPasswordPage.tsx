import { KeyRound } from 'lucide-react';
import { useAuth, useCurrentUser } from '../lib/auth';
import { ChangePasswordForm } from '../components/account';

/**
 * Shown instead of the app after signing in with a temporary password (a new account, or a
 * reset by a manager). The server blocks everything else until a new password is chosen.
 */
export function ChooseNewPasswordPage() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy px-4 py-12">
      <main className="w-full max-w-[420px]">
        <p className="mb-6 text-center text-xl font-bold tracking-[0.08em] text-white">DESKFLOW</p>
        <div className="rounded-[20px] bg-surface p-7 shadow-pop sm:p-8">
          <span className="grid size-11 place-items-center rounded-full bg-cobalt-soft text-cobalt">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-[-0.02em] text-ink">
            Choose a new password
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            Hi {user.name.split(' ')[0]}, you signed in with a temporary password. Pick your own to
            continue.
          </p>
          <div className="mt-6">
            <ChangePasswordForm currentLabel="Temporary password" submitLabel="Save and continue" />
          </div>
        </div>
        <p className="mt-5 text-center text-sm text-navy-ink">
          Not you?{' '}
          <button
            type="button"
            onClick={() => void logout()}
            className="font-medium text-white underline underline-offset-2"
          >
            Sign out
          </button>
        </p>
      </main>
    </div>
  );
}
