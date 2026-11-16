import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/** Distance from the card's bottom edge to the centre of the Done stop (padding 40 + half of 64). */
const DONE_CENTER = 72;

type RailState = { started: boolean; progress: number; done: boolean };

/** What the rail shows while nobody is typing: a request going from Open to Done, on a loop. */
const DEMO: (RailState & { ms: number })[] = [
  { started: false, progress: 0, done: false, ms: 1500 },
  { started: true, progress: 0.3, done: false, ms: 1000 },
  { started: true, progress: 0.6, done: false, ms: 1000 },
  { started: true, progress: 0.88, done: false, ms: 1000 },
  { started: true, progress: 1, done: true, ms: 2200 },
];

function useDemoLoop(active: boolean): RailState {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active || reduce) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % DEMO.length), DEMO[step]!.ms);
    return () => clearTimeout(t);
  }, [active, reduce, step]);
  return reduce ? DEMO[2]! : DEMO[step]!;
}

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

  // Typing drives the rail; an empty form lets it play on its own.
  const email = (watch('email') ?? '').trim();
  const password = watch('password') ?? '';
  const typed =
    (EMAIL_RE.test(email) ? 0.45 : Math.min(email.length / 20, 1) * 0.25) +
    Math.min(password.length / 8, 1) * 0.4;
  const interactive = typed > 0 || finishing || done;
  const demo = useDemoLoop(!interactive);
  const rail: RailState = interactive
    ? {
        started: true,
        progress: done ? 1 : isSubmitting ? Math.max(typed, 0.9) : typed,
        done,
      }
    : demo;

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
    <div
      className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-12 overflow-hidden bg-[#09111f] px-4 py-14 sm:px-8 lg:gap-16"
      style={{
        // Faint light in the three status colours, coming in from the screen edges.
        backgroundImage: [
          'radial-gradient(38% 42% at 0% 8%, rgb(91 127 240 / 0.14), transparent 70%)',
          'radial-gradient(34% 40% at 100% 48%, rgb(232 162 62 / 0.09), transparent 70%)',
          'radial-gradient(40% 36% at 12% 100%, rgb(63 165 111 / 0.1), transparent 70%)',
          'radial-gradient(55% 45% at 50% 22%, rgb(30 46 72 / 0.55), transparent 72%)',
        ].join(','),
      }}
    >
      <header className="flex max-w-3xl flex-col items-center text-center">
        <div className="flex items-center gap-4">
          <Logo className="size-12 sm:size-16" />
          <span className="text-3xl font-bold tracking-[0.08em] text-white sm:text-5xl">
            DESKFLOW
          </span>
        </div>
        <h2 className="mt-8 text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance text-white sm:text-4xl">
          Every request has an owner, a status and a history.
        </h2>
        <p className="mt-3 text-base text-navy-ink sm:text-lg">
          Log every call, email and message in one queue.
        </p>
      </header>

      <div className="flex w-full max-w-5xl items-end justify-center">
        {/* The first two stops. The line carries on into the card, to the Done stop at its foot. */}
        <div
          className="hidden flex-1 items-center lg:flex"
          style={{ marginBottom: DONE_CENTER - 32 }}
          aria-hidden
        >
          <Stop label="Open" reached tone={TONE.open}>
            <span className="size-4 rounded-full bg-white" />
          </Stop>
          <Line filled={rail.started ? 1 : 0} from={TONE.open} to={TONE.progress} />
          <Stop label="In progress" reached={rail.started} tone={TONE.progress}>
            <span className="relative grid place-items-center">
              <RefreshCw
                className={cx(
                  'size-8',
                  rail.started && !rail.done && !reduce && 'animate-[spin_2.4s_linear_infinite]',
                )}
                strokeWidth={2.25}
              />
              <span className="absolute size-2.5 rounded-full bg-current" />
            </span>
          </Stop>
          <Line filled={Math.min(rail.progress / 0.88, 1)} from={TONE.progress} to={TONE.done} />
        </div>

        <main className="relative w-full max-w-[380px] shrink-0">
          {/* Soft glow peeking out from behind the card. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-14 -z-10 rounded-[48px] opacity-90 blur-3xl"
            style={{
              backgroundImage:
                'radial-gradient(50% 45% at 20% 25%, rgb(91 127 240 / 0.28), transparent 70%), radial-gradient(45% 45% at 85% 50%, rgb(232 162 62 / 0.2), transparent 70%), radial-gradient(50% 45% at 40% 92%, rgb(63 165 111 / 0.26), transparent 70%)',
            }}
          />
          <ProgressCard progress={rail.progress}>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Sign in</h1>
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

            {/* Done stop at the foot of the card, where the rail line comes in. */}
            <span
              aria-hidden
              className="absolute left-0 hidden h-1 w-10 overflow-hidden lg:block"
              style={{ bottom: DONE_CENTER - 2 }}
            >
              <motion.span
                className="block h-full origin-left"
                style={{ backgroundColor: TONE.done }}
                initial={false}
                animate={{ transform: `scaleX(${rail.done ? 1 : 0})` }}
                transition={{ duration: 0.35, ease: EASE }}
              />
            </span>
            <div className="mt-8 flex items-center gap-3" aria-live="polite">
              <motion.span
                initial={false}
                animate={{
                  backgroundColor: rail.done ? TONE.done : '#ffffff',
                  borderColor: rail.done ? TONE.done : '#d6d1c9',
                  color: rail.done ? '#ffffff' : '#c3bdb3',
                  boxShadow: rail.done ? `0 0 28px -4px ${TONE.done}` : '0 0 0 0 rgba(0,0,0,0)',
                  transform: rail.done ? 'scale(1)' : 'scale(0.9)',
                }}
                transition={{ duration: 0.4, ease: EASE, delay: rail.done ? 0.25 : 0 }}
                className="grid size-16 shrink-0 place-items-center rounded-full border-2"
              >
                <Check className="size-7" strokeWidth={3} aria-hidden />
              </motion.span>
              <span
                className={cx(
                  'text-sm font-medium transition-colors duration-300',
                  rail.done ? 'text-resolved' : 'text-ink-3',
                )}
              >
                {done ? 'Done. Opening DESKFLOW…' : 'Done'}
              </span>
            </div>
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
  children: ReactNode;
}) {
  return (
    <span className="relative shrink-0">
      <motion.span
        initial={false}
        animate={{
          backgroundColor: reached ? tone : '#111c30',
          borderColor: reached ? tone : '#3a4963',
          color: reached ? '#ffffff' : '#5d6c88',
          boxShadow: reached ? `0 0 34px -4px ${tone}` : '0 0 0 0 rgba(0,0,0,0)',
        }}
        transition={{ duration: 0.5, ease: EASE }}
        className="grid size-16 place-items-center rounded-full border-2"
      >
        {children}
      </motion.span>
      <span
        className={cx(
          'absolute top-full left-1/2 mt-3.5 -translate-x-1/2 text-[15px] whitespace-nowrap transition-colors duration-300',
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
    <span className="relative h-1 min-w-12 flex-1 overflow-hidden bg-white/10">
      <motion.span
        className="absolute inset-0 origin-left"
        style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})` }}
        initial={false}
        animate={{ transform: `scaleX(${filled})` }}
        transition={{ duration: 0.8, ease: [0.77, 0, 0.175, 1] }}
      />
    </span>
  );
}

/**
 * Rounded-rectangle outline that starts on the left edge at the Done stop, runs up and around
 * the card clockwise, and ends back at Done.
 */
function outlinePath(w: number, h: number, r: number, startFromBottom: number) {
  const i = 0.75; // half the stroke, so the line sits on the edge
  const L = i;
  const T = i;
  const R = w - i;
  const B = h - i;
  const sy = B - startFromBottom;
  return [
    `M ${L} ${sy}`,
    `V ${T + r}`,
    `A ${r} ${r} 0 0 1 ${L + r} ${T}`,
    `H ${R - r}`,
    `A ${r} ${r} 0 0 1 ${R} ${T + r}`,
    `V ${B - r}`,
    `A ${r} ${r} 0 0 1 ${R - r} ${B}`,
    `H ${L + r}`,
    `A ${r} ${r} 0 0 1 ${L} ${B - r}`,
    `V ${sy}`,
  ].join(' ');
}

/** White card whose thin outline draws in green as `progress` goes from 0 to 1. */
function ProgressCard({ progress, children }: { progress: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Outer edge of the card (padding included), so the outline traces the real border.
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return; // older browsers: measured once is enough
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = size.w > 0 ? outlinePath(size.w, size.h, 23.25, DONE_CENTER) : '';

  return (
    <div
      ref={ref}
      className="relative rounded-[24px] bg-white p-8 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.6)] sm:p-10"
    >
      {d && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <path d={d} fill="none" stroke="#e7e4df" strokeWidth="1.5" />
          <motion.path
            d={d}
            fill="none"
            stroke={TONE.done}
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: progress, opacity: progress > 0 ? 1 : 0 }}
            transition={{ duration: 0.9, ease: [0.77, 0, 0.175, 1] }}
          />
        </svg>
      )}
      {children}
    </div>
  );
}
