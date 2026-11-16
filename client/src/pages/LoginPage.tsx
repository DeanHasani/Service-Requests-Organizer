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
import { GlassCard, Depth } from '../components/GlassCard';
import { HeroRail } from '../components/HeroRail';

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
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <div className="hidden p-5 lg:block xl:p-6">
        <GlassCard className="h-full">
          <div className="flex h-full flex-col justify-between p-12 xl:p-14">
            <Depth z={40} className="flex items-center gap-3.5">
              <svg
                viewBox="0 0 32 32"
                className="size-12 drop-shadow-[0_8px_18px_rgb(0_0_0/0.35)]"
                aria-hidden
              >
                <rect width="32" height="32" rx="7" fill="#24344d" />
                <path d="M9 16h14" stroke="#4b5d7a" strokeWidth="2" />
                <circle cx="9" cy="16" r="3" fill="#8fa8f5" />
                <circle cx="16" cy="16" r="3" fill="#e0a23b" />
                <circle cx="23" cy="16" r="3" fill="#4fb286" />
              </svg>
              <span className="text-2xl font-bold tracking-[0.08em] text-white">DESKFLOW</span>
            </Depth>

            <div className="max-w-xl">
              <Depth z={60}>
                <h2 className="text-[44px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-white xl:text-[52px]">
                  Every request has an owner, a status and a history.
                </h2>
                <p className="mt-5 text-lg text-navy-ink">
                  Log every call, email and message in one queue.
                </p>
              </Depth>
              <Depth z={90} className="mt-14">
                <LoginRailDemo />
              </Depth>
            </div>

            <Depth z={20}>
              <p className="text-xs text-navy-ink-dim">© 2026 GROWIN AL</p>
            </Depth>
          </div>
        </GlassCard>
      </div>

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
const DEMO_STEPS = 3;

function LoginRailDemo() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(reduce ? 1 : 0);
  const [pausedUntil, setPausedUntil] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil) return;
      setI((n) => (n + 1) % DEMO_STEPS);
    }, 2000);
    return () => clearInterval(t);
  }, [reduce, pausedUntil]);
  const pick = (n: number) => {
    setI(n);
    setPausedUntil(Date.now() + 6000);
  };
  return <HeroRail at={i} onPick={pick} />;
}
