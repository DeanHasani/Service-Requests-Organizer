import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Check, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { loginSchema, type LoginInput } from '@deskflow/shared';
import type { z } from 'zod';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { cx } from '../lib/format';
import { Button, Field, Input } from '../components/ui';

/** Only allow same-app paths as the post-login destination (browsers read `/\host` as `//host`). */
export const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/';

const TONE = { open: '#5b7ff0', progress: '#e8a23e', done: '#3fa56f' };
const EASE = [0.23, 1, 0.32, 1] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduce = useReducedMotion();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // While the finishing animation plays, stay on this page even though the user is signed in.
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof loginSchema>, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  // How far the sign-in has got: typing fills the outline, a successful sign-in completes it.
  const email = (watch('email') ?? '').trim();
  const password = watch('password') ?? '';
  const typed =
    (EMAIL_RE.test(email) ? 0.45 : Math.min(email.length / 20, 1) * 0.25) +
    Math.min(password.length / 8, 1) * 0.4;
  const progress = done ? 1 : isSubmitting ? Math.max(typed, 0.9) : typed;
  const started = done || typed > 0;

  if (user && !finishing) return <Navigate to={safeNext(params.get('next'))} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setFinishing(true);
    try {
      await login(values);
      setDone(true);
      setTimeout(() => navigate(safeNext(params.get('next')), { replace: true }), reduce ? 0 : 700);
    } catch (err) {
      setFinishing(false);
      setFormError(errorMessage(err));
    }
  });

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-navy bg-[radial-gradient(55%_45%_at_28%_42%,rgb(36_52_77/0.7),transparent_70%)] px-4 py-16 sm:px-8">
      <div className="flex w-full max-w-5xl items-start justify-center">
        {/* Left: brand and the first two stops. Its line runs into the sign-in card. */}
        <div className="relative hidden flex-1 lg:block" aria-hidden>
          <div className="absolute bottom-full left-0 mb-16 flex items-center gap-5">
            <Logo className="size-16 xl:size-20" />
            <span className="text-4xl font-bold tracking-[0.08em] text-white xl:text-5xl">
              DESKFLOW
            </span>
          </div>
          <div className="mt-10 flex items-center">
            <Stop label="Open" reached tone={TONE.open}>
              <span className="size-3.5 rounded-full bg-white" />
            </Stop>
            <Line filled={started ? 1 : 0} from={TONE.open} to={TONE.progress} />
            <Stop label="In progress" reached={started} tone={TONE.progress}>
              <span className="relative grid place-items-center">
                <RefreshCw
                  className={cx(
                    'size-7',
                    started && !done && !reduce && 'animate-[spin_2.4s_linear_infinite]',
                  )}
                  strokeWidth={2.25}
                />
                <span className="absolute size-2 rounded-full bg-current" />
              </span>
            </Stop>
            <Line filled={Math.min(progress / 0.9, 1)} from={TONE.progress} to={TONE.done} />
          </div>
        </div>

        {/* Right: the sign-in card. Its outline is the last stretch of the rail. */}
        <main className="w-full max-w-[380px] shrink-0">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo className="size-10" />
            <span className="text-xl font-bold tracking-[0.08em] text-white">DESKFLOW</span>
          </div>
          <ProgressCard progress={progress}>
            {/* line entering the card from the left, up to the Done stop */}
            <span
              aria-hidden
              className="absolute top-[67px] left-0 hidden h-[3px] w-10 overflow-hidden lg:block"
            >
              <motion.span
                className="block h-full origin-left"
                style={{ backgroundColor: TONE.done }}
                initial={false}
                animate={{ transform: `scaleX(${done ? 1 : 0})` }}
                transition={{ duration: 0.35, ease: EASE }}
              />
            </span>

            <div className="flex items-center gap-3" aria-live="polite">
              <motion.span
                initial={false}
                animate={{
                  backgroundColor: done ? TONE.done : '#ffffff',
                  borderColor: done ? TONE.done : '#d6d1c9',
                  color: done ? '#ffffff' : '#c3bdb3',
                  boxShadow: done ? `0 0 26px -4px ${TONE.done}` : '0 0 0 0 rgba(0,0,0,0)',
                  transform: done ? 'scale(1)' : 'scale(0.9)',
                }}
                transition={{ duration: 0.4, ease: EASE, delay: done ? 0.25 : 0 }}
                className="grid size-14 shrink-0 place-items-center rounded-full border-2"
              >
                <Check className="size-6" strokeWidth={3} aria-hidden />
              </motion.span>
              <span
                className={cx(
                  'text-sm font-medium transition-colors duration-300',
                  done ? 'text-resolved' : 'text-ink-3',
                )}
              >
                {done ? 'Done. Opening DESKFLOW…' : 'Done'}
              </span>
            </div>

            <h1 className="mt-8 text-2xl font-semibold tracking-[-0.02em]">Sign in</h1>
            <p className="mt-1.5 text-sm text-ink-2">Use your work email and password.</p>

            <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col gap-4">
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
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                disabled={done}
                className="mt-2 h-10"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </ProgressCard>
        </main>
      </div>

      <p className="absolute bottom-5 left-6 text-xs text-navy-ink-dim sm:left-8">
        © 2026 GROWIN AL
      </p>
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#24344d" />
      <path d="M9 16h14" stroke="#4b5d7a" strokeWidth="2" />
      <circle cx="9" cy="16" r="3" fill="#8fa8f5" />
      <circle cx="16" cy="16" r="3" fill="#e0a23b" />
      <circle cx="23" cy="16" r="3" fill="#4fb286" />
    </svg>
  );
}

/** A stop on the dark side of the rail, with its label underneath. */
function Stop({
  label,
  reached,
  tone,
  children,
}: {
  label: string;
  reached: boolean;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative shrink-0">
      <motion.span
        initial={false}
        animate={{
          backgroundColor: reached ? tone : '#111c30',
          borderColor: reached ? tone : '#3a4963',
          color: reached ? '#ffffff' : '#5d6c88',
          boxShadow: reached ? `0 0 30px -4px ${tone}` : '0 0 0 0 rgba(0,0,0,0)',
        }}
        transition={{ duration: 0.45, ease: EASE }}
        className="grid size-14 place-items-center rounded-full border-2"
      >
        {children}
      </motion.span>
      <span
        className={cx(
          'absolute top-full left-1/2 mt-3 -translate-x-1/2 text-sm whitespace-nowrap transition-colors duration-300',
          reached ? 'font-semibold text-white' : 'text-navy-ink-dim',
        )}
      >
        {label}
      </span>
    </span>
  );
}

/** Track between stops; `filled` from 0 to 1. */
function Line({ filled, from, to }: { filled: number; from: string; to: string }) {
  return (
    <span className="relative h-[3px] min-w-12 flex-1 overflow-hidden bg-white/10">
      <motion.span
        className="absolute inset-0 origin-left"
        style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})` }}
        initial={false}
        animate={{ transform: `scaleX(${filled})` }}
        transition={{ duration: 0.6, ease: [0.77, 0, 0.175, 1] }}
      />
    </span>
  );
}

/** White card whose thin outline draws in green as `progress` goes from 0 to 1. */
function ProgressCard({ progress, children }: { progress: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      // border box, not content box: the outline traces the card's outer edge, padding included
      const box = entry?.borderBoxSize?.[0];
      if (box) setSize({ w: box.inlineSize, h: box.blockSize });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="relative rounded-[24px] bg-white p-8 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.6)] sm:p-10"
    >
      {size.w > 0 && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <rect
            x="0.75"
            y="0.75"
            width={size.w - 1.5}
            height={size.h - 1.5}
            rx="23.25"
            fill="none"
            stroke="#e7e4df"
            strokeWidth="1.5"
          />
          <motion.rect
            x="0.75"
            y="0.75"
            width={size.w - 1.5}
            height={size.h - 1.5}
            rx="23.25"
            fill="none"
            stroke={TONE.done}
            strokeWidth="2"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: progress, opacity: progress > 0 ? 1 : 0 }}
            transition={{ duration: 0.6, ease: [0.77, 0, 0.175, 1] }}
          />
        </svg>
      )}
      {children}
    </div>
  );
}
