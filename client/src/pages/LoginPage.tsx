import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

/** Stop diameter in px. */
const DOT = 72;
/** Distance from the card's bottom edge to where the rail line meets it (and the outline starts). */
const RAIL_Y = 150;

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

/**
 * Phones have no room for the rail beside the card, so a mini rail (Open, In progress, Done)
 * sits inside the card instead. Its line runs across the whole timeline while the border fills
 * at the same time, and both finish as Done lights up.
 */
const SEG_MOBILE = {
  line1: [0.04, 0.42],
  progress: [0.42, 0.47],
  line2: [0.47, 0.9],
  border: [0.04, 0.9],
  done: SEG.done,
} as const;
/** Mini rail stop diameter, and where its centre sits above the card's bottom edge (padding 32). */
const MINI_DOT = 40;
const MINI_RAIL_Y = 32 + MINI_DOT / 2;

/** True on screens wide enough for the rail beside the card (Tailwind's `lg`). */
function useDesktop() {
  const query = '(min-width: 1024px)';
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

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
  const desktop = useDesktop();

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
      <div className="grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-0">
        {/* Left: brand, sentences, then the rail. Its line ends at the card's edge. */}
        <div className="flex flex-col justify-end">
          {/* Extra left padding centres the text over the In progress stop (56px right of centre). */}
          <header className="text-center lg:pr-10 lg:pl-[152px]">
            <span className="block pl-[0.08em] text-2xl font-bold tracking-[0.08em] text-white sm:text-4xl">
              DESKFLOW
            </span>
            <Logo className="mx-auto mt-5 block h-4 w-12 sm:h-5 sm:w-15" />
            <h2 className="mx-auto mt-5 max-w-xl text-xl leading-tight font-semibold tracking-[-0.02em] text-balance text-white sm:text-[28px]">
              Every request has an owner, a status and a history.
            </h2>
          </header>

          <div
            className="mt-20 hidden items-center pl-10 lg:flex"
            style={{ marginBottom: RAIL_Y - DOT / 2 }}
            aria-hidden
          >
            <Stop t={t} at={0} label="Open" tone={TONE.open}>
              <span className="size-4 rounded-full bg-white" />
            </Stop>
            <Line t={t} range={SEG.line1} from={TONE.open} to={TONE.progress} />
            <Stop t={t} at={SEG.progress} label="In progress" tone={TONE.progress}>
              <ProgressIcon t={t} reduce={!!reduce} from={SEG.progress[0]} />
            </Stop>
            <Line t={t} range={SEG.line2} from={TONE.progress} to={TONE.done} />
          </div>
        </div>

        {/* Right: the sign-in card. Its border is the last stretch; Done sits at its foot. */}
        <main className="relative mx-auto w-full max-w-[340px] lg:max-w-[420px]">
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-14 -z-10 rounded-[48px] opacity-90 blur-3xl"
            style={{
              backgroundImage:
                'radial-gradient(50% 45% at 20% 25%, rgb(91 127 240 / 0.28), transparent 70%), radial-gradient(45% 45% at 85% 50%, rgb(232 162 62 / 0.2), transparent 70%), radial-gradient(50% 45% at 40% 92%, rgb(63 165 111 / 0.26), transparent 70%)',
            }}
          />
          <ProgressCard
            t={t}
            border={desktop ? SEG.border : SEG_MOBILE.border}
            fromBottom={desktop ? RAIL_Y : MINI_RAIL_Y}
            footer={
              desktop ? (
                <DoneStop t={t} signedIn={done} />
              ) : (
                <MiniRail t={t} signedIn={done} reduce={!!reduce} />
              )
            }
          >
            <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Sign in</h1>
            <p className="mt-2 text-[15px] text-ink-2">Use your work email and password.</p>

            <form
              onSubmit={onSubmit}
              noValidate
              className="mt-8 flex flex-col gap-5 [&_label]:text-[15px]"
            >
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
                  className={FIELD}
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
                    className={cx(FIELD, 'pr-11')}
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
                className="mt-2 h-12! text-base!"
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
        // Start over from the beginning instead of rewinding.
        t.jump(0);
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

/** Small zoom pop (1 → 1.18 → 1) each time `value` rises past `threshold`. */
function usePop(value: MotionValue<number>, threshold: number) {
  const pop = useMotionValue(1);
  const reduce = useReducedMotion();
  const prev = useRef(value.get());
  useMotionValueEvent(value, 'change', (v) => {
    if (!reduce && prev.current < threshold && v >= threshold) {
      animate(pop, [1, 1.18, 1], { duration: 0.42, times: [0, 0.4, 1], ease: 'easeOut' });
    }
    prev.current = v;
  });
  return pop;
}

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="5.5 12.5 21 7" className={className} aria-hidden>
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
  size = DOT,
  small = false,
  children,
}: {
  t: MotionValue<number>;
  at: 0 | readonly [number, number];
  label: string;
  tone: string;
  size?: number;
  small?: boolean;
  children: ReactNode;
}) {
  const lit = useSegment(t, at === 0 ? [-1, 0] : at);
  const fill = useTransform(lit, [0, 1], [EMPTY.fill, tone]);
  const ring = useTransform(lit, [0, 1], [EMPTY.ring, tone]);
  const ink = useTransform(lit, [0, 1], ['#5d6c88', '#ffffff']);
  const labelInk = useTransform(lit, [0, 1], [EMPTY.label, '#ffffff']);
  const glow = useTransform(lit, (v) => `0 0 ${20 * v}px ${-6 * v}px ${tone}`);
  // Open is lit from the start, so it pops when the timeline sets off instead.
  const pop = usePop(at === 0 ? t : lit, at === 0 ? 0.005 : 0.999);
  return (
    <span className="relative shrink-0">
      <motion.span
        className={cx(
          'absolute bottom-full left-1/2 -translate-x-1/2 font-semibold whitespace-nowrap',
          small ? 'mb-2 text-xs' : 'mb-3.5 text-[15px]',
        )}
        style={{ color: labelInk }}
      >
        {label}
      </motion.span>
      <motion.span
        className={cx('grid place-items-center rounded-full', small ? 'border-2' : 'border-[3px]')}
        style={{
          width: size,
          height: size,
          backgroundColor: fill,
          borderColor: ring,
          color: ink,
          boxShadow: glow,
          scale: pop,
        }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** Dot with two arrows turning around it while work is in progress. */
function ProgressIcon({
  t,
  reduce,
  from,
  small = false,
}: {
  t: MotionValue<number>;
  reduce: boolean;
  /** When the spinning starts on the timeline. */
  from: number;
  small?: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  useMotionValueEvent(t, 'change', (v) => {
    const next = v >= from && v < SEG.done[0];
    if (next !== spinning) setSpinning(next);
  });
  return (
    <span className="relative grid place-items-center">
      <RefreshCw
        className={cx(
          small ? 'size-5' : 'size-9',
          spinning && !reduce && 'animate-[spin_2.6s_linear_infinite]',
        )}
        strokeWidth={2.25}
      />
      <span className={cx('absolute rounded-full bg-current', small ? 'size-1.5' : 'size-2.5')} />
    </span>
  );
}

/** Track between stops; fills during its own part of the timeline. */
function Line({
  t,
  range,
  from,
  to,
  small = false,
}: {
  t: MotionValue<number>;
  range: readonly [number, number];
  from: string;
  to: string;
  small?: boolean;
}) {
  const filled = useSegment(t, range);
  return (
    <span
      className={cx(
        'relative flex-1 overflow-hidden rounded-full bg-white/10',
        small ? 'h-[3px] min-w-4' : 'h-1 min-w-12',
      )}
    >
      <motion.span
        className="absolute inset-0 origin-left"
        style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${to})`, scaleX: filled }}
      />
    </span>
  );
}

/** Phone version: Open, In progress and Done in a row at the foot of the card. */
function MiniRail({
  t,
  signedIn,
  reduce,
}: {
  t: MotionValue<number>;
  signedIn: boolean;
  reduce: boolean;
}) {
  return (
    <div className="pt-6" aria-live="polite">
      <span className="sr-only">{signedIn ? 'Done. Opening DESKFLOW…' : ''}</span>
      <div className="flex items-center px-2" aria-hidden>
        <Stop t={t} at={0} label="Open" tone={TONE.open} size={MINI_DOT} small>
          <span className="size-2.5 rounded-full bg-white" />
        </Stop>
        <Line t={t} range={SEG_MOBILE.line1} from={TONE.open} to={TONE.progress} small />
        <Stop
          t={t}
          at={SEG_MOBILE.progress}
          label="In progress"
          tone={TONE.progress}
          size={MINI_DOT}
          small
        >
          <ProgressIcon t={t} reduce={reduce} from={SEG_MOBILE.progress[0]} small />
        </Stop>
        <Line t={t} range={SEG_MOBILE.line2} from={TONE.progress} to={TONE.done} small />
        <Stop t={t} at={SEG_MOBILE.done} label="Done" tone={TONE.done} size={MINI_DOT} small>
          <Check className="size-5" strokeWidth={3} />
        </Stop>
      </div>
    </div>
  );
}

/** Done stop centred at the foot of the card, label above it. */
function DoneStop({ t, signedIn }: { t: MotionValue<number>; signedIn: boolean }) {
  const lit = useSegment(t, SEG.done);
  const fill = useTransform(lit, [0, 1], ['#ffffff', TONE.done]);
  const ring = useTransform(lit, [0, 1], ['#d6d1c9', TONE.done]);
  const ink = useTransform(lit, [0, 1], ['#c3bdb3', '#ffffff']);
  const labelInk = useTransform(lit, [0, 1], ['#8a8f99', TONE.done]);
  const grow = useTransform(lit, [0, 1], [0.92, 1]);
  const pop = usePop(lit, 0.999);
  const scale = useTransform(() => grow.get() * pop.get());
  const glow = useTransform(lit, (v) => `0 0 ${18 * v}px ${-6 * v}px ${TONE.done}`);
  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <motion.span className="text-sm font-semibold" style={{ color: labelInk }}>
        {signedIn ? 'Done. Opening DESKFLOW…' : 'Done'}
      </motion.span>
      <motion.span
        className="grid place-items-center rounded-full border-[3px]"
        style={{
          width: DOT,
          height: DOT,
          backgroundColor: fill,
          borderColor: ring,
          color: ink,
          scale,
          boxShadow: glow,
        }}
      >
        <Check className="size-8" strokeWidth={3} aria-hidden />
      </motion.span>
    </div>
  );
}

/**
 * The two halves of a rounded-rectangle outline. Both start on the left edge where the rail line
 * meets the card: one runs up over the top, the other down under the bottom, and they meet on the
 * right edge at the same height. Each is drawn 0 to 1 over the same time, so the longer top half
 * moves a little faster and they arrive together.
 */
function outlineHalves(w: number, h: number, r: number, fromBottom: number, inset: number) {
  const L = inset;
  const T = inset;
  const R = w - inset;
  const B = h - inset;
  const y = B - fromBottom;
  const top = [
    `M ${L} ${y}`,
    `V ${T + r}`,
    `A ${r} ${r} 0 0 1 ${L + r} ${T}`,
    `H ${R - r}`,
    `A ${r} ${r} 0 0 1 ${R} ${T + r}`,
    `V ${y}`,
  ].join(' ');
  const bottom = [
    `M ${L} ${y}`,
    `V ${B - r}`,
    `A ${r} ${r} 0 0 0 ${L + r} ${B}`,
    `H ${R - r}`,
    `A ${r} ${r} 0 0 0 ${R} ${B - r}`,
    `V ${y}`,
  ].join(' ');
  return { top, bottom };
}

const STROKE = 4;

/** Taller inputs with larger text on this page (`!` beats the shared control size). */
const FIELD = 'h-12! text-base!';

/** Light-on-glass colours for the form inside the card (the app's tokens are for white panels). */
const GLASS_TOKENS = {
  '--color-ink': '#f3f5f9',
  '--color-ink-2': '#c3cbd8',
  '--color-ink-3': '#8592a8',
  '--color-surface': 'rgb(255 255 255 / 0.06)',
  '--color-sunken': 'rgb(255 255 255 / 0.03)',
  '--color-line-strong': 'rgb(255 255 255 / 0.18)',
  '--color-navy': '#3d63dd',
  '--color-navy-3': '#5b7ff0',
} as CSSProperties;

/** White card whose outline fills during the border part of the timeline. */
function ProgressCard({
  t,
  border: range,
  fromBottom,
  children,
  footer,
}: {
  t: MotionValue<number>;
  /** Part of the timeline the outline fills in. */
  border: readonly [number, number];
  /** Where the outline starts: height above the bottom edge, on the left side. */
  fromBottom: number;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const border = useSegment(t, range);
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
  const halves = size.w > 0 ? outlineHalves(size.w, size.h, 28 - inset, fromBottom, inset) : null;

  return (
    <div
      ref={ref}
      style={GLASS_TOKENS}
      className="relative flex flex-col justify-between rounded-[28px] bg-[#0f1b2d]/35 px-7 pt-7 pb-8 text-ink shadow-[0_40px_90px_-30px_rgb(0_0_0/0.6)] backdrop-blur-xl sm:p-8 lg:min-h-[540px]"
    >
      {halves && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          {[halves.top, halves.bottom].map((d) => (
            <path
              key={`track${d}`}
              d={d}
              fill="none"
              stroke="rgb(255 255 255 / 0.14)"
              strokeWidth={STROKE - 1}
            />
          ))}
          {[halves.top, halves.bottom].map((d) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke={TONE.done}
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ pathLength: border, opacity: visible }}
            />
          ))}
        </svg>
      )}
      <div>{children}</div>
      <div className="mt-8">{footer}</div>
    </div>
  );
}
