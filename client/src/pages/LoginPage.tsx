import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Check, Eye, EyeOff, RefreshCw } from 'lucide-react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react';
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
const EMPTY = { fill: '#111c30', ring: '#3a4963', label: '#7d8aa3' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Distance from the card's bottom edge to the centre of the Done stop (padding 40 + half of 64). */
const DONE_CENTER = 72;

/**
 * One timeline, `t` from 0 to 1, drives every part in order so nothing happens at once:
 * Open to In progress, In progress lights up, line to the card, card border, Done.
 */
const SEG = {
  line1: [0.04, 0.22],
  progress: [0.22, 0.27],
  line2: [0.27, 0.42],
  border: [0.42, 0.9],
  done: [0.9, 0.97],
} as const;

/** Typing fills the timeline up to the end of the border; a successful sign-in plays Done. */
const typedToTime = (typed: number) =>
  typed <= 0 ? 0 : SEG.line2[1] + (SEG.border[1] - SEG.line2[1]) * Math.min(typed / 0.85, 1);

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

  const email = (watch('email') ?? '').trim();
  const password = watch('password') ?? '';
  const typed =
    (EMAIL_RE.test(email) ? 0.45 : Math.min(email.length / 20, 1) * 0.25) +
    Math.min(password.length / 8, 1) * 0.4;
  const interactive = typed > 0 || finishing || done;
  const target = done ? 1 : isSubmitting ? SEG.border[1] : typedToTime(typed);
  const t = useTimeline(interactive, target, !!reduce);

  if (user && !finishing) return <Navigate to={safeNext(params.get('next'))} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setFinishing(true);
    try {
      await login(values);
      setDone(true);
      setTimeout(() => navigate(safeNext(params.get('next')), { replace: true }), reduce ? 0 : 900);
    } catch (err) {
      setFinishing(false);
      setFormError(errorMessage(err));
    }
  });

  return (
    <div
      className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#09111f] px-4 py-14 sm:px-8"
      style={{
        // Faint light in the three status colours, coming in from the screen edges.
        backgroundImage: [
          'radial-gradient(38% 42% at 0% 8%, rgb(91 127 240 / 0.14), transparent 70%)',
          'radial-gradient(34% 40% at 100% 48%, rgb(232 162 62 / 0.09), transparent 70%)',
          'radial-gradient(40% 36% at 12% 100%, rgb(63 165 111 / 0.1), transparent 70%)',
          'radial-gradient(50% 50% at 30% 40%, rgb(30 46 72 / 0.5), transparent 72%)',
        ].join(','),
      }}
    >
      <div className="grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-0">
        {/* Left: brand, sentences, then the rail. Its line ends at the card's edge. */}
        <div className="flex flex-col justify-end">
          <header className="text-center lg:px-10">
            <div className="flex items-center justify-center gap-4">
              <Logo className="size-12 sm:size-14" />
              <span className="text-3xl font-bold tracking-[0.08em] text-white sm:text-5xl">
                DESKFLOW
              </span>
            </div>
            <h2 className="mx-auto mt-7 max-w-xl text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance text-white sm:text-[32px]">
              Every request has an owner, a status and a history.
            </h2>
            <p className="mt-3 text-base text-navy-ink sm:text-lg">
              Log every call, email and message in one queue.
            </p>
          </header>

          <div
            className="mt-16 hidden items-center pl-10 lg:flex"
            style={{ marginBottom: DONE_CENTER - 32 }}
            aria-hidden
          >
            <Stop t={t} at={0} label="Open" tone={TONE.open}>
              <span className="size-4 rounded-full bg-white" />
            </Stop>
            <Line t={t} range={SEG.line1} from={TONE.open} to={TONE.progress} />
            <Stop t={t} at={SEG.progress} label="In progress" tone={TONE.progress}>
              <ProgressIcon t={t} reduce={!!reduce} />
            </Stop>
            <Line t={t} range={SEG.line2} from={TONE.progress} to={TONE.done} />
          </div>
        </div>

        {/* Right: the sign-in card. Its border is the last stretch; Done sits at its foot. */}
        <main className="relative mx-auto w-full max-w-[400px]">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-14 -z-10 rounded-[48px] opacity-90 blur-3xl"
            style={{
              backgroundImage:
                'radial-gradient(50% 45% at 20% 25%, rgb(91 127 240 / 0.28), transparent 70%), radial-gradient(45% 45% at 85% 50%, rgb(232 162 62 / 0.2), transparent 70%), radial-gradient(50% 45% at 40% 92%, rgb(63 165 111 / 0.26), transparent 70%)',
            }}
          />
          <ProgressCard t={t} footer={<DoneStop t={t} signedIn={done} />}>
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
          </ProgressCard>
        </main>
      </div>

      <p className="absolute bottom-5 left-6 text-xs text-navy-ink-dim sm:left-8">
        © 2026 GROWIN AL
      </p>
    </div>
  );
}

/**
 * The shared timeline. With nobody typing it plays on its own, slowly, then rests and starts
 * again. While typing it eases to wherever the form has got to.
 */
function useTimeline(interactive: boolean, target: number, reduce: boolean) {
  const t = useMotionValue(0);
  useEffect(() => {
    if (reduce) {
      t.set(interactive ? target : SEG.border[0] + 0.2);
      return;
    }
    if (interactive) {
      const c = animate(t, target, { duration: target === 1 ? 0.8 : 0.9, ease: [0.4, 0, 0.2, 1] });
      return () => c.stop();
    }
    let alive = true;
    let current: ReturnType<typeof animate> | undefined;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await (current = animate(t, 0, { duration: t.get() > 0 ? 0.6 : 0 }));
      while (alive) {
        await wait(700);
        if (!alive) break;
        await (current = animate(t, 1, { duration: 7.5, ease: 'linear' }));
        if (!alive) break;
        await wait(1800);
        if (!alive) break;
        await (current = animate(t, 0, { duration: 0.7, ease: [0.4, 0, 0.2, 1] }));
      }
    })();
    return () => {
      alive = false;
      current?.stop();
    };
  }, [interactive, target, reduce, t]);
  return t;
}

/** 0..1 progress of one segment of the timeline. */
const useSegment = (t: MotionValue<number>, [a, b]: readonly [number, number]) =>
  useTransform(t, [a, b], [0, 1], { clamp: true });

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

/** A stop on the dark side, label above. `at` is when it lights up (0 = lit from the start). */
function Stop({
  t,
  at,
  label,
  tone,
  children,
}: {
  t: MotionValue<number>;
  at: 0 | readonly [number, number];
  label: string;
  tone: string;
  children: ReactNode;
}) {
  const lit = useSegment(t, at === 0 ? [-1, 0] : at);
  const fill = useTransform(lit, [0, 1], [EMPTY.fill, tone]);
  const ring = useTransform(lit, [0, 1], [EMPTY.ring, tone]);
  const ink = useTransform(lit, [0, 1], ['#5d6c88', '#ffffff']);
  const labelInk = useTransform(lit, [0, 1], [EMPTY.label, '#ffffff']);
  const glow = useTransform(lit, (v) => `0 0 ${34 * v}px ${-4 * v}px ${tone}`);
  return (
    <span className="relative shrink-0">
      <motion.span
        className="absolute bottom-full left-1/2 mb-3.5 -translate-x-1/2 text-[15px] font-semibold whitespace-nowrap"
        style={{ color: labelInk }}
      >
        {label}
      </motion.span>
      <motion.span
        className="grid size-16 place-items-center rounded-full border-[3px]"
        style={{ backgroundColor: fill, borderColor: ring, color: ink, boxShadow: glow }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** Dot with two arrows turning around it while work is in progress. */
function ProgressIcon({ t, reduce }: { t: MotionValue<number>; reduce: boolean }) {
  const [spinning, setSpinning] = useState(false);
  useMotionValueEvent(t, 'change', (v) => {
    const next = v >= SEG.progress[0] && v < SEG.done[0];
    if (next !== spinning) setSpinning(next);
  });
  return (
    <span className="relative grid place-items-center">
      <RefreshCw
        className={cx('size-8', spinning && !reduce && 'animate-[spin_2.6s_linear_infinite]')}
        strokeWidth={2.25}
      />
      <span className="absolute size-2.5 rounded-full bg-current" />
    </span>
  );
}

/** Track between stops; fills during its own part of the timeline. */
function Line({
  t,
  range,
  from,
  to,
}: {
  t: MotionValue<number>;
  range: readonly [number, number];
  from: string;
  to: string;
}) {
  const filled = useSegment(t, range);
  return (
    <span className="relative h-1 min-w-12 flex-1 overflow-hidden rounded-full bg-white/10">
      <motion.span
        className="absolute inset-0 origin-left"
        style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})`, scaleX: filled }}
      />
    </span>
  );
}

/** Done stop centred at the foot of the card, label above it. */
function DoneStop({ t, signedIn }: { t: MotionValue<number>; signedIn: boolean }) {
  const lit = useSegment(t, SEG.done);
  const fill = useTransform(lit, [0, 1], ['#ffffff', TONE.done]);
  const ring = useTransform(lit, [0, 1], ['#d6d1c9', TONE.done]);
  const ink = useTransform(lit, [0, 1], ['#c3bdb3', '#ffffff']);
  const labelInk = useTransform(lit, [0, 1], ['#8a8f99', TONE.done]);
  const scale = useTransform(lit, [0, 1], [0.92, 1]);
  const glow = useTransform(lit, (v) => `0 0 ${30 * v}px ${-4 * v}px ${TONE.done}`);
  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <motion.span className="text-sm font-semibold" style={{ color: labelInk }}>
        {signedIn ? 'Done. Opening DESKFLOW…' : 'Done'}
      </motion.span>
      <motion.span
        className="grid size-16 place-items-center rounded-full border-[3px]"
        style={{ backgroundColor: fill, borderColor: ring, color: ink, scale, boxShadow: glow }}
      >
        <Check className="size-7" strokeWidth={3} aria-hidden />
      </motion.span>
    </div>
  );
}

/**
 * Rounded-rectangle outline that starts on the left edge where the rail line meets the card,
 * runs up and around clockwise, and closes back at that point.
 */
function outlinePath(w: number, h: number, r: number, startFromBottom: number, inset: number) {
  const L = inset;
  const T = inset;
  const R = w - inset;
  const B = h - inset;
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

const STROKE = 4;

/** White card whose outline fills during the border part of the timeline. */
function ProgressCard({
  t,
  children,
  footer,
}: {
  t: MotionValue<number>;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const border = useSegment(t, SEG.border);
  const visible = useTransform(border, (v) => (v > 0 ? 1 : 0));
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

  const inset = STROKE / 2;
  const d = size.w > 0 ? outlinePath(size.w, size.h, 28 - inset, DONE_CENTER, inset) : '';

  return (
    <div
      ref={ref}
      className="relative flex flex-col lg:min-h-[540px] justify-between rounded-[28px] bg-white p-8 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.6)] sm:p-10"
    >
      {d && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <path d={d} fill="none" stroke="#e7e4df" strokeWidth={STROKE - 1} />
          <motion.path
            d={d}
            fill="none"
            stroke={TONE.done}
            strokeWidth={STROKE}
            strokeLinecap="round"
            style={{ pathLength: border, opacity: visible }}
          />
        </svg>
      )}
      <div>{children}</div>
      {/* footer sits at the foot: its centre is DONE_CENTER above the bottom edge */}
      <div className="mt-10">{footer}</div>
    </div>
  );
}
