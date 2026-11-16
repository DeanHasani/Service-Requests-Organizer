import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { loginSchema, type LoginInput } from '@deskflow/shared';
import type { z } from 'zod';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { Button, Field, Input } from '../components/ui';
import { LifecycleRail } from '../components/request-bits';

/** Only allow same-app paths as the post-login destination (browsers read `/\host` as `//host`). */
export const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  if (user) return <Navigate to={safeNext(params.get('next'))} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-navy-ink lg:flex">
        <span className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
            <rect width="32" height="32" rx="7" fill="#24344d" />
            <path d="M9 16h14" stroke="#4b5d7a" strokeWidth="2" />
            <circle cx="9" cy="16" r="3" fill="#8fa8f5" />
            <circle cx="16" cy="16" r="3" fill="#e0a23b" />
            <circle cx="23" cy="16" r="3" fill="#4fb286" />
          </svg>
          <span className="text-base font-bold tracking-[0.06em] text-white">DESKFLOW</span>
        </span>
        <div className="max-w-md">
          <p className="text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] text-white">
            Every request has an owner, a status and a history.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed">
            Log every call, email and message in one queue. Each request gets one owner, and every
            change is recorded with a name and a time.
          </p>
          <div className="mt-10 rounded-[12px] border border-white/10 bg-navy-2 p-5">
            <LoginRailDemo />
          </div>
        </div>
        <p className="text-xs text-navy-ink-dim">
          Internal tool. Accounts are created by a manager.
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <span className="mb-10 flex items-center gap-2.5 lg:hidden">
            <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
              <rect width="32" height="32" rx="7" fill="#0f1b2d" />
              <path d="M9 16h14" stroke="#4b5d7a" strokeWidth="2" />
              <circle cx="9" cy="16" r="3" fill="#8fa8f5" />
              <circle cx="16" cy="16" r="3" fill="#e0a23b" />
              <circle cx="23" cy="16" r="3" fill="#4fb286" />
            </svg>
            <span className="text-base font-bold tracking-[0.06em] text-navy">DESKFLOW</span>
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Sign in</h1>
          <p className="mt-1.5 text-sm text-ink-2">Use your work email and password.</p>

          <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-4">
            {formError && (
              <motion.div
                initial={{ opacity: 0, transform: 'translateY(-4px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                role="alert"
                className="flex items-start gap-2 rounded-control border border-urgent/25 bg-urgent-soft px-3 py-2.5 text-[13px] text-urgent"
              >
                <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
                {formError}
              </motion.div>
            )}
            <Field id="email" label="Email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.email}
                {...register('email')}
              />
            </Field>
            <Field id="password" label="Password" error={errors.password?.message}>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  className="pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded text-ink-3 transition-colors hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </Field>
            <Button type="submit" variant="primary" loading={isSubmitting} className="mt-2 h-10">
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

/** A slow loop of the lifecycle rail: the product's one idea, shown instead of described. */
const DEMO_STEPS = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;

function LoginRailDemo() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % DEMO_STEPS.length), 2200);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4 text-[13px]">
        <span className="font-medium text-white">Printer on 2nd floor not connecting</span>
        <span className="tabular text-xs text-navy-ink-dim">SR-000001</span>
      </div>
      <LifecycleRail status={DEMO_STEPS[i]!} size="lg" onDark />
    </div>
  );
}
