import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { changePasswordSchema } from '@deskflow/shared';
import { useAuth } from '../lib/auth';
import { ApiError, errorMessage } from '../lib/api';
import { Button, ConfirmDialog, Dialog, Field, Input } from './ui';

/** The shared rules, plus a repeat of the new password typed in the browser. */
const formSchema = z
  .object({ currentPassword: z.string(), newPassword: z.string(), confirm: z.string() })
  .superRefine((v, ctx) => {
    const result = changePasswordSchema.safeParse(v);
    if (!result.success) {
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
    if (v.confirm !== v.newPassword)
      ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'The passwords don’t match' });
  });
type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordForm({
  currentLabel = 'Current password',
  submitLabel = 'Change password',
  onDone,
  signOutEverywhere = false,
}: {
  currentLabel?: string;
  submitLabel?: string;
  onDone?: () => void;
  /**
   * Profile: ask "are you sure?" first, then sign out on every device, this one included, so the
   * new password is used everywhere from the next sign-in.
   */
  signOutEverywhere?: boolean;
}) {
  const { changePassword, logoutEverywhere } = useAuth();
  const [pending, setPending] = useState<{ currentPassword: string; newPassword: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const showError = (err: unknown) => {
    if (err instanceof ApiError && err.details?.currentPassword)
      setError('currentPassword', { message: err.details.currentPassword[0] });
    else if (err instanceof ApiError && err.details?.newPassword)
      setError('newPassword', { message: err.details.newPassword[0] });
    else setError('root', { message: errorMessage(err) });
  };

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    if (signOutEverywhere) {
      setPending({ currentPassword, newPassword });
      return;
    }
    try {
      await changePassword({ currentPassword, newPassword });
      reset();
      toast.success('Password changed. Other devices have been signed out.');
      onDone?.();
    } catch (err) {
      showError(err);
    }
  });

  const confirmChange = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await changePassword(pending);
    } catch (err) {
      setSaving(false);
      setPending(null);
      showError(err);
      return;
    }
    try {
      await logoutEverywhere('Password changed. Sign in with your new password.');
    } catch {
      // The password is already changed and other devices are signed out; sign in again anyway.
      window.location.assign('/login');
    }
  };

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
      <Field id="current-password" label={currentLabel} error={errors.currentPassword?.message}>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
          {...register('currentPassword')}
        />
      </Field>
      <Field
        id="new-password"
        label="New password"
        error={errors.newPassword?.message}
        hint="At least 8 characters."
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.newPassword}
          {...register('newPassword')}
        />
      </Field>
      <Field id="confirm-password" label="Repeat new password" error={errors.confirm?.message}>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          {...register('confirm')}
        />
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
      {signOutEverywhere && (
        <ConfirmDialog
          open={pending !== null}
          title="Change your password?"
          body="You will be signed out on every device, this one included. Sign in again with your new password."
          confirmLabel="Change and sign out"
          loading={saving}
          onConfirm={() => void confirmChange()}
          onClose={() => !saving && setPending(null)}
        />
      )}
    </form>
  );
}

/** Shows a temporary password once, with a copy button. It cannot be shown again after closing. */
export function TemporaryPasswordDialog({
  name,
  password,
  onClose,
}: {
  name: string;
  password: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password ?? '');
      setCopied(true);
    } catch {
      toast.error('Copy failed. Select the password and copy it by hand.');
    }
  };
  return (
    <Dialog
      open={!!password}
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      title={`Temporary password for ${name}`}
      description="Give it to them in person or over a channel you trust. They will choose their own password when they sign in. It won’t be shown again."
      width="max-w-md"
    >
      <div className="flex items-center gap-2 rounded-control border border-line bg-sunken px-3 py-2.5">
        <code className="tabular flex-1 text-lg font-semibold tracking-[0.06em] text-ink select-all">
          {password}
        </code>
        <Button size="sm" onClick={() => void copy()}>
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-3 text-[13px] text-ink-2">
        They have been signed out everywhere, and their old password no longer works.
      </p>
      <div className="mt-6 flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            setCopied(false);
            onClose();
          }}
        >
          Done
        </Button>
      </div>
    </Dialog>
  );
}
