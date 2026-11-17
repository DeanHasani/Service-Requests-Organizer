import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import {
  animate,
  AnimatePresence,
  motion,
  useAnimationFrame,
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

/** Shared easing curves, so the dots, lines, border, pop and exit move as one family. */
const EASE = {
  /** Travel between stops: speeds up, then settles into the next stop. */
  inOut: [0.65, 0, 0.35, 1],
  /** Arrivals and reveals: quick start, soft landing. */
  out: [0.16, 1, 0.3, 1],
  /** Leaving: starts gently, ends fast. */
  in: [0.55, 0, 1, 0.45],
} as const;
/** Following the form as you type: a spring with a slight, natural settle. */
const FOLLOW = { type: 'spring', visualDuration: 0.85, bounce: 0.18 } as const;

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
  // Done sits mid-way along the bottom edge, so the bottom half of the border passes under it
  // exactly half-way through. From there Done fills in step with the border, and both finish
  // as the two halves meet.
  done: [0.66, 0.9],
} as const;

/**
 * Phones have no room for the rail beside the card, so a mini rail (Open, In progress, Done)
 * sits inside the card instead. Its line runs across the whole timeline while the border fills
 * at the same time, and both finish as Done lights up.
 */
const SEG_MOBILE = {
  line1: [0.04, 0.42],
  progress: [0.42, 0.47],
  line2: [0.47, 0.66],
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
  typed <= 0 ? 0 : SEG.line2[1] + (SEG.done[0] - SEG.line2[1]) * Math.min(typed / 0.85, 1);

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduce = useReducedMotion();
  // No scrollbar on the sign-in screen; it can still scroll on short screens.
  useEffect(() => {
    document.documentElement.classList.add('no-scrollbar');
    return () => document.documentElement.classList.remove('no-scrollbar');
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [forgot, setForgot] = useState(false);
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
  // Typing and waiting stop just short of Done; the border closes and Done completes on success.
  const target = done ? 1 : isSubmitting ? SEG.done[0] : typedToTime(typed);
  const desktop = useDesktop();
  const { t, fade } = useTimeline(interactive, target, !!reduce, desktop);
  // Feedback: red flash + shake on a failed sign-in; green glow, then ease out, on success.
  const alarm = useMotionValue(0);
  const shake = useMotionValue(0);
  const success = useMotionValue(0);
  const leave = useMotionValue(0);
  const pageOpacity = useTransform(leave, [0, 1], [1, 0]);
  const pageScale = useTransform(leave, [0, 1], [1, 0.975]);
  const pageBlur = useTransform(leave, (v) => `blur(${v * 6}px)`);

  // Pause the CSS-driven parts (icon stream, pulses) while the tab is hidden.
  useEffect(() => {
    const sync = () => document.documentElement.classList.toggle('page-hidden', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      document.documentElement.classList.remove('page-hidden');
    };
  }, []);

  if (user && !finishing) return <Navigate to={safeNext(params.get('next'))} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setFinishing(true);
    try {
      await login(values);
      setDone(true);
      if (!reduce) {
        // Done lands and its tick draws, the card glows green, then the page eases away.
        void animate(success, [0, 1, 0.45], { duration: 1.1, times: [0, 0.35, 1], ease: EASE.out });
        await wait(1000);
        await animate(leave, 1, { duration: 0.45, ease: EASE.in });
      }
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setFinishing(false);
      setFormError(errorMessage(err));
      if (!reduce) {
        // The line slides back to where the form is, briefly red, and the card shakes once.
        void animate(alarm, [0, 1, 1, 0], { duration: 1.4, times: [0, 0.12, 0.55, 1] });
        void animate(shake, [0, -10, 9, -6, 4, -2, 0], { duration: 0.5, ease: 'easeOut' });
      }
    }
  });

  return (
    <FlowContext value={{ fade, alarm, reduce: !!reduce }}>
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
        <motion.div
          className="grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-0"
          style={{ opacity: pageOpacity, scale: pageScale, filter: pageBlur }}
        >
          {/* Left: brand, sentences, then the rail. Its line ends at the card's edge. */}
          <div className="flex flex-col justify-end">
            {/* Extra left padding centres the text over the In progress stop (56px right of centre). */}
            <header className="text-center lg:pr-10 lg:pl-[152px]">
              <span className="block pl-[0.08em] text-2xl font-bold tracking-[0.08em] text-white sm:text-4xl">
                DESKFLOW
              </span>
              <Logo className="mx-auto mt-5 block h-4 w-12 sm:h-5 sm:w-15" />
              <RollingTagline reduce={!!reduce} />
            </header>

            <div
              className="mt-20 hidden items-center pl-10 lg:flex"
              style={{ marginBottom: RAIL_Y - DOT / 2 }}
              aria-hidden
            >
              <span className="relative">
                {!reduce && <IntakeFlow />}
                <span className="relative z-[1] block">
                  <Stop t={t} at={0} label="Open" tone={TONE.open}>
                    <span className="size-4 rounded-full bg-white" />
                  </Stop>
                </span>
              </span>
              <Line t={t} range={SEG.line1} from={TONE.open} to={TONE.progress} />
              <Stop t={t} at={SEG.progress} label="In progress" tone={TONE.progress}>
                <ProgressIcon t={t} from={SEG.progress[0]} />
              </Stop>
              <Line t={t} range={SEG.line2} from={TONE.progress} to={TONE.done} intoCard />
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
              shake={shake}
              success={success}
              footer={
                desktop ? <DoneStop t={t} signedIn={done} /> : <MiniRail t={t} signedIn={done} />
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
                <div className="-mt-1 text-[13px]">
                  <button
                    type="button"
                    onClick={() => setForgot((v) => !v)}
                    aria-expanded={forgot}
                    className="font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                  >
                    Forgot password?
                  </button>
                  {forgot && (
                    <p className="mt-1.5 text-ink-2">
                      Ask your manager to reset it. They’ll give you a temporary password, and you
                      choose a new one when you sign in.
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting && !done}
                  disabled={done}
                  className="mt-2 h-12! text-base!"
                >
                  {done ? 'Signed in' : isSubmitting ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </ProgressCard>
          </main>
        </motion.div>

        <p className="absolute bottom-5 left-6 text-xs text-navy-ink-dim sm:left-8">
          © 2026 GROWIN AL
        </p>
      </div>
    </FlowContext>
  );
}

// ---------- intake flow: mail, chat and phone streaming into Open ----------

const FLOW_ICONS = ['mail', 'chat', 'phone'] as const;

/**
 * Fixed "random" spread so the stream looks natural but renders the same every time. Each item:
 * icon, starting height above or below the dot, size, travel time, start offset, sway, tilt.
 */
const FLOW_COUNT = 14;
const FLOW = Array.from({ length: FLOW_COUNT }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 * n) * 43758.5453;
    return x - Math.floor(x);
  };
  const dur = 4.4 + r(1) * 2;
  // Heights are a shuffled even spread, so the stream fills the band instead of clumping.
  const slot = (i * 5) % FLOW_COUNT;
  return {
    icon: FLOW_ICONS[i % 3]!,
    y0: Math.round((slot / (FLOW_COUNT - 1) - 0.5) * 230 + (r(2) - 0.5) * 14),
    size: Math.round(34 + r(3) * 28),
    dur,
    sway: Math.round((r(4) - 0.5) * 36),
    tilt: Math.round((r(5) - 0.5) * 50),
  };
});

/**
 * Requests arriving by mail, chat and phone: icons drift in from the left edge of the screen,
 * large and faint, and narrow like a river into the Open stop, shrinking as they reach it.
 * The layer spans exactly from the screen edge to the dot's centre, measured on resize.
 */
function IntakeFlow() {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const anchor = ref.current?.parentElement;
    if (!anchor) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setWidth(Math.max(0, anchor.getBoundingClientRect().left + DOT / 2)),
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, []);
  const count = Math.min(FLOW_COUNT, Math.max(7, Math.round(width / 34)));
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute top-1/2"
      style={{ right: DOT / 2, width, height: 0 }}
    >
      {width > 0 &&
        // Fewer icons on a short run so a narrow screen doesn't look crowded.
        FLOW.slice(0, count).map((f, i) => (
          <span
            key={i}
            className="intake-lane"
            style={
              {
                '--dur': `${f.dur}s`,
                // Evenly staggered over the icons shown; negative so it is already flowing.
                '--delay': `${-(i / count) * f.dur}s`,
              } as CSSProperties
            }
          >
            <span
              className="intake-icon"
              style={
                {
                  '--y0': `${f.y0}px`,
                  '--sway': `${f.sway}px`,
                  '--tilt': `${f.tilt}deg`,
                  '--size': `${f.size}px`,
                  '--tone': TONE.open,
                  '--icon': `url(/loginflow/${f.icon}.png)`,
                } as CSSProperties
              }
            />
          </span>
        ))}
    </span>
  );
}

/** What DESKFLOW does, one line at a time. */
const TAGLINES = [
  'Every request has an owner, a status and a history.',
  'Log every call, email and message in one queue.',
  'Managers set the priority and deadline, then assign the work.',
  'See what is open, what is late and who is on it.',
];
/** One line every 4.5 s: the wave takes about 1.5 s, leaving about 3 s to read the settled line. */
const TAGLINE_MS = 4500;

// The wave: word by word, first word first. Outgoing words leave quickly upward; incoming words
// start a moment later, so the first new word rises into the space the first old one just left.
const OUT_EASE = EASE.in;
const IN_EASE = EASE.out;
const wordMotion = {
  initial: { y: '110%', opacity: 0 },
  enter: (i: number) => ({
    y: '0%',
    opacity: 1,
    transition: { delay: 0.32 + i * 0.06, duration: 0.75, ease: IN_EASE },
  }),
  exit: (i: number) => ({
    y: '-110%',
    opacity: 0,
    transition: { delay: i * 0.04, duration: 0.45, ease: OUT_EASE },
  }),
};

/**
 * Rolls each line out word by word, like a wave, while the next rolls in the same way. Each word
 * moves inside its own mask, so it rises out of and into the line rather than sliding across it.
 * Stays on the first line with reduced motion.
 */
function RollingTagline({ reduce }: { reduce: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % TAGLINES.length);
    }, TAGLINE_MS);
    return () => clearInterval(timer);
  }, [reduce]);
  return (
    <h2 className="relative mx-auto mt-5 h-[52px] max-w-xl text-xl leading-tight font-semibold tracking-[-0.02em] text-white sm:h-[72px] sm:text-[28px]">
      {/* Screen readers get the lines once, not a live region that keeps changing. */}
      <span className="sr-only">{TAGLINES.join(' ')}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={index}
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-balance"
          initial="initial"
          animate="enter"
          exit="exit"
        >
          <span>
            {TAGLINES[index]!.split(' ').map((word, i) => (
              <span key={i}>
                {i > 0 && ' '}
                {/* The mask: tall enough for descenders, clips the word as it moves */}
                <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
                  <motion.span className="inline-block" custom={i} variants={wordMotion}>
                    {word}
                  </motion.span>
                </span>
              </span>
            ))}
          </span>
        </motion.span>
      </AnimatePresence>
    </h2>
  );
}

// ---------- motion system: one set of curves and timings for the whole rail ----------

/**
 * Shared live values: `fade` dims the whole rail for a clean restart, `alarm` tints it red for a
 * moment after a failed sign-in. Provided by the page, read by every rail part.
 */
type FlowValues = { fade: MotionValue<number>; alarm: MotionValue<number>; reduce: boolean };
const FlowContext = createContext<FlowValues | null>(null);
function useFlow() {
  const ctx = use(FlowContext);
  if (!ctx) throw new Error('useFlow must be used inside FlowContext');
  return ctx;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Resolves straight away, or once the tab is visible again. */
const whenVisible = () =>
  new Promise<void>((resolve) => {
    if (!document.hidden) return resolve();
    const on = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', on);
      resolve();
    };
    document.addEventListener('visibilitychange', on);
  });

/**
 * The idle loop as paced steps: travel, arrive, pause briefly at each stop, then on. Each entry is
 * [timeline value to reach, seconds, easing].
 */
type Step = readonly [number, number, readonly number[] | 'linear'];
const IDLE_DESKTOP: Step[] = [
  [SEG.line1[1], 1.5, EASE.inOut],
  [SEG.progress[1], 0.45, EASE.out],
  [SEG.progress[1], 0.35, 'linear'],
  [SEG.line2[1], 1.2, EASE.inOut],
  // The border at one steady pace: first half up to Done's level, second half filling Done too.
  [SEG.done[0], 1.7, 'linear'],
  [SEG.done[1], 1.7, 'linear'],
  [1, 0.15, 'linear'],
];
const IDLE_MOBILE: Step[] = [
  [SEG_MOBILE.line1[1], 2.4, EASE.inOut],
  [SEG_MOBILE.progress[1], 0.45, EASE.out],
  [SEG_MOBILE.progress[1], 0.35, 'linear'],
  [SEG_MOBILE.line2[1], 1.5, 'linear'],
  [SEG_MOBILE.done[1], 1.9, 'linear'],
  [1, 0.15, 'linear'],
];

/**
 * The shared timeline. With nobody typing it plays on its own in paced steps, rests, fades out
 * and starts again. While typing it springs to wherever the form has got to. Everything pauses
 * while the tab is hidden.
 */
function useTimeline(interactive: boolean, target: number, reduce: boolean, desktop: boolean) {
  const t = useMotionValue(0);
  const fade = useMotionValue(1);
  useEffect(() => {
    if (reduce) {
      t.set(interactive ? target : SEG.border[0] + 0.2);
      fade.set(1);
      return;
    }
    let alive = true;
    let current: { stop: () => void; pause: () => void; play: () => void } | undefined;
    const onVisibility = () => (document.hidden ? current?.pause() : current?.play());
    document.addEventListener('visibilitychange', onVisibility);
    const cleanup = () => {
      alive = false;
      current?.stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };

    if (interactive) {
      current = animate(fade, 1, { duration: 0.3 });
      const c = animate(t, target, target === 1 ? { duration: 0.8, ease: EASE.out } : FOLLOW);
      return () => {
        c.stop();
        cleanup();
      };
    }

    const steps = desktop ? IDLE_DESKTOP : IDLE_MOBILE;
    const total = steps.reduce((n, s) => n + s[1], 0);
    let acc = 0;
    const times = [0, ...steps.map((s) => (acc += s[1]) / total)];
    const values = [0, ...steps.map((s) => s[0])];
    const ease = steps.map((s) => (s[2] === 'linear' ? 'linear' : [...s[2]])) as never;

    (async () => {
      // Coming back from typing: fade out, then start clean rather than rewinding.
      if (t.get() > 0) {
        await (current = animate(fade, 0, { duration: 0.4, ease: EASE.in }));
        if (!alive) return;
        t.jump(0);
        await (current = animate(fade, 1, { duration: 0.4, ease: EASE.out }));
      }
      while (alive) {
        await wait(700);
        await whenVisible();
        if (!alive) break;
        await (current = animate(t, values, { duration: total, times, ease }));
        if (!alive) break;
        await wait(1600);
        await whenVisible();
        if (!alive) break;
        await (current = animate(fade, 0, { duration: 0.6, ease: EASE.in }));
        if (!alive) break;
        t.jump(0);
        await (current = animate(fade, 1, { duration: 0.5, ease: EASE.out }));
      }
    })();
    return cleanup;
  }, [interactive, target, reduce, desktop, t, fade]);
  return { t, fade };
}

/** 0..1 progress of one segment of the timeline. */
const useSegment = (t: MotionValue<number>, [a, b]: readonly [number, number]) =>
  useTransform(t, [a, b], [0, 1], { clamp: true });

/** Fades a moving head in after it leaves a stop and out before it arrives. */
const edgeFade = (v: number) => Math.max(0, Math.min(1, v / 0.04, (1 - v) / 0.04));

/**
 * The arrival moment when `value` rises past `threshold`: a small zoom pop and one ring rippling
 * out from the stop.
 */
function useArrival(value: MotionValue<number>, threshold: number) {
  const { reduce } = useFlow();
  const pop = useMotionValue(1);
  const ripple = useMotionValue(1);
  const rippleOpacity = useMotionValue(0);
  const prev = useRef(value.get());
  useMotionValueEvent(value, 'change', (v) => {
    if (!reduce && prev.current < threshold && v >= threshold) {
      animate(pop, [1, 1.16, 1], { duration: 0.5, times: [0, 0.35, 1], ease: EASE.out });
      animate(ripple, [1, 1.75], { duration: 0.9, ease: EASE.out });
      animate(rippleOpacity, [0.55, 0], { duration: 0.9, ease: EASE.out });
    }
    prev.current = v;
  });
  return { pop, ripple, rippleOpacity };
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

/**
 * A stop on the dark side, label above. `at` is when it lights up (0 = lit from the start). Its
 * colour fills in from the left, the side the line arrives from, and a ring ripples out as it
 * lands.
 */
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
  const { fade } = useFlow();
  const lit = useSegment(t, at === 0 ? [-1, 0] : at);
  // What shows: lit, dimmed by a restart fade.
  const shown = useTransform(() => lit.get() * fade.get());
  const ring = useTransform(shown, [0, 1], [EMPTY.ring, tone]);
  const ink = useTransform(shown, [0, 1], ['#5d6c88', '#ffffff']);
  const labelInk = useTransform(shown, [0, 1], [EMPTY.label, '#ffffff']);
  const glow = useTransform(shown, (v) => `0 0 ${20 * v}px ${-6 * v}px ${tone}`);
  const sweep = useTransform(lit, (v) => `inset(0 ${(1 - v) * 100}% 0 0 round 999px)`);
  // Open is lit from the start, so it arrives when the timeline sets off instead.
  const { pop, ripple, rippleOpacity } = useArrival(at === 0 ? t : lit, at === 0 ? 0.005 : 0.999);
  return (
    <span className="relative z-[1] shrink-0">
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
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border-2"
        style={{ borderColor: tone, scale: ripple, opacity: rippleOpacity }}
      />
      <motion.span
        className={cx(
          'relative grid place-items-center overflow-hidden rounded-full',
          small ? 'border-2' : 'border-[3px]',
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: EMPTY.fill,
          borderColor: ring,
          color: ink,
          boxShadow: glow,
          scale: pop,
        }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundColor: tone, clipPath: sweep, opacity: fade }}
        />
        <span className="relative grid place-items-center">{children}</span>
      </motion.span>
    </span>
  );
}

/**
 * Two arrows turning around a dot while work is in progress. The spin eases up to speed and
 * coasts to a stop instead of switching on and off.
 */
function ProgressIcon({
  t,
  from,
  small = false,
}: {
  t: MotionValue<number>;
  /** When the spinning starts on the timeline. */
  from: number;
  small?: boolean;
}) {
  const { reduce } = useFlow();
  const rotate = useMotionValue(0);
  const speed = useRef(0);
  const active = useRef(t.get() >= from && t.get() < SEG.done[0]);
  useMotionValueEvent(t, 'change', (v) => {
    active.current = v >= from && v < SEG.done[0];
  });
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const goal = active.current ? 360 / 2.6 : 0; // degrees per second
    // Ease towards the goal speed over roughly half a second.
    speed.current += (goal - speed.current) * Math.min(1, delta / 450);
    if (goal === 0 && speed.current < 1) speed.current = 0;
    if (speed.current) rotate.set((rotate.get() + (speed.current * delta) / 1000) % 360);
  });
  return (
    <span className="relative grid place-items-center">
      <motion.span className="grid place-items-center" style={{ rotate }}>
        <RefreshCw className={small ? 'size-5' : 'size-9'} strokeWidth={2.25} />
      </motion.span>
      <span className={cx('absolute rounded-full bg-current', small ? 'size-1.5' : 'size-2.5')} />
    </span>
  );
}

/**
 * Track between stops; fills during its own part of the timeline, led by a small glowing head in
 * the colour the line has reached. Flashes red for a moment after a failed sign-in.
 */
function Line({
  t,
  range,
  from,
  to,
  small = false,
  intoCard = false,
}: {
  t: MotionValue<number>;
  range: readonly [number, number];
  from: string;
  to: string;
  small?: boolean;
  /** The last stretch: square end that meets the card border flush, without overlapping it. */
  intoCard?: boolean;
}) {
  const { fade, alarm, reduce } = useFlow();
  const filled = useSegment(t, range);
  const headColor = useTransform(filled, [0, 1], [from, to]);
  const headGlow = useTransform(
    headColor,
    (c) => `0 0 ${small ? 8 : 12}px ${small ? 2 : 3}px ${c}, 0 0 2px 1px #ffffff`,
  );
  const headOpacity = useTransform(() => edgeFade(filled.get()) * fade.get());
  // The head rides the right edge of a full-width layer slid along by transform only.
  const headX = useTransform(filled, (v) => `${(v - 1) * 100}%`);
  return (
    <span
      className={cx(
        // Both ends tuck under the stops (which sit above it), so the line reads as one piece.
        'relative z-0 flex-1',
        small ? '-mx-2 h-[3px] min-w-4' : 'h-1 min-w-12',
        !small && (intoCard ? '-ml-4' : '-mx-4'),
      )}
    >
      <span
        className={cx(
          'absolute inset-0 overflow-hidden bg-white/10',
          intoCard && !small ? 'rounded-l-full' : 'rounded-full',
        )}
      >
        <motion.span
          className="absolute inset-0 origin-left"
          style={{
            backgroundImage: `linear-gradient(90deg, ${from}, ${to})`,
            scaleX: filled,
            opacity: fade,
          }}
        />
        <motion.span
          className="absolute inset-0 origin-left bg-[#e5484d]"
          style={{ scaleX: filled, opacity: alarm }}
        />
      </span>
      {!reduce && (
        <motion.span className="pointer-events-none absolute inset-0" style={{ x: headX }}>
          <motion.span
            className={cx(
              'absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 rounded-full bg-white',
              small ? 'size-1.5' : 'size-2.5',
            )}
            style={{ opacity: headOpacity, boxShadow: headGlow }}
          />
        </motion.span>
      )}
    </span>
  );
}

/** A tick that draws itself as `lit` goes from half to full, over a faint placeholder tick. */
function DrawnCheck({
  lit,
  className,
  placeholder,
}: {
  lit: MotionValue<number>;
  className: string;
  placeholder: MotionValue<string> | string;
}) {
  const draw = useTransform(lit, [0.35, 1], [0, 1], { clamp: true });
  const ghost = useTransform(lit, [0, 0.6], [1, 0], { clamp: true });
  // A zero-length round-capped stroke still paints a dot; hide it until drawing starts.
  const drawn = useTransform(draw, (v) => (v > 0.02 ? 1 : 0));
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <motion.path d="M5 12.5l4.5 4.5L19 7.5" style={{ stroke: placeholder, opacity: ghost }} />
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="#ffffff"
        style={{ pathLength: draw, opacity: drawn }}
      />
    </svg>
  );
}

/** Phone version: Open, In progress and Done in a row at the foot of the card. */
function MiniRail({ t, signedIn }: { t: MotionValue<number>; signedIn: boolean }) {
  const doneLit = useSegment(t, SEG_MOBILE.done);
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
          <ProgressIcon t={t} from={SEG_MOBILE.progress[0]} small />
        </Stop>
        <Line t={t} range={SEG_MOBILE.line2} from={TONE.progress} to={TONE.done} small />
        <Stop t={t} at={SEG_MOBILE.done} label="Done" tone={TONE.done} size={MINI_DOT} small>
          <DrawnCheck lit={doneLit} className="size-5" placeholder="#5d6c88" />
        </Stop>
      </div>
    </div>
  );
}

/** Done stop centred at the foot of the card, label above it. Its tick draws itself as it lands. */
function DoneStop({ t, signedIn }: { t: MotionValue<number>; signedIn: boolean }) {
  const { fade } = useFlow();
  const lit = useSegment(t, SEG.done);
  const shown = useTransform(() => lit.get() * fade.get());
  // Unlit it looks like the other stops: dark, with a faint ring and tick.
  const ring = useTransform(shown, [0, 1], [EMPTY.ring, TONE.done]);
  const ghostInk = useTransform(shown, [0, 1], ['#5d6c88', '#ffffff']);
  const labelInk = useTransform(shown, [0, 1], [EMPTY.label, TONE.done]);
  const grow = useTransform(shown, [0, 1], [0.92, 1]);
  const { pop, ripple, rippleOpacity } = useArrival(lit, 0.999);
  const scale = useTransform(() => grow.get() * pop.get());
  const glow = useTransform(shown, (v) => `0 0 ${18 * v}px ${-6 * v}px ${TONE.done}`);
  const sweep = useTransform(lit, (v) => `inset(0 ${(1 - v) * 100}% 0 0 round 999px)`);
  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <motion.span className="text-sm font-semibold" style={{ color: labelInk }}>
        {signedIn ? 'Done. Opening DESKFLOW…' : 'Done'}
      </motion.span>
      <span className="relative">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{ borderColor: TONE.done, scale: ripple, opacity: rippleOpacity }}
        />
        <motion.span
          className="relative grid place-items-center overflow-hidden rounded-full border-[3px]"
          style={{
            width: DOT,
            height: DOT,
            backgroundColor: EMPTY.fill,
            borderColor: ring,
            scale,
            boxShadow: glow,
          }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundColor: TONE.done, clipPath: sweep, opacity: fade }}
          />
          <DrawnCheck lit={lit} className="relative size-8" placeholder={ghostInk} />
        </motion.span>
      </span>
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

/** A glowing point that rides along an SVG path as `progress` goes from 0 to 1. */
function PathHead({
  pathRef,
  progress,
  size,
}: {
  pathRef: React.RefObject<SVGPathElement | null>;
  progress: MotionValue<number>;
  size: { w: number; h: number };
}) {
  const { fade } = useFlow();
  const cx_ = useMotionValue(0);
  const cy = useMotionValue(0);
  const opacity = useTransform(() => edgeFade(progress.get()) * fade.get());
  const place = (v: number) => {
    const el = pathRef.current;
    if (!el) return;
    const p = el.getPointAtLength(el.getTotalLength() * v);
    cx_.set(p.x);
    cy.set(p.y);
  };
  useMotionValueEvent(progress, 'change', place);
  // Re-place when the card is measured or resized.
  useEffect(() => place(progress.get()), [size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <motion.circle
      r={4.5}
      fill="#ffffff"
      cx={cx_}
      cy={cy}
      style={{ opacity, filter: `drop-shadow(0 0 6px ${TONE.done}) drop-shadow(0 0 2px #ffffff)` }}
    />
  );
}

/**
 * The glass card whose outline fills during the border part of the timeline, led by a glowing head
 * on each side. It flashes red and shakes after a failed sign-in, and glows green on success.
 */
function ProgressCard({
  t,
  border: range,
  fromBottom,
  shake,
  success,
  children,
  footer,
}: {
  t: MotionValue<number>;
  /** Part of the timeline the outline fills in. */
  border: readonly [number, number];
  /** Where the outline starts: height above the bottom edge, on the left side. */
  fromBottom: number;
  /** Horizontal offset, animated for the "wrong password" shake. */
  shake: MotionValue<number>;
  /** 0..1 green glow around the card after a successful sign-in. */
  success: MotionValue<number>;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { fade, alarm, reduce } = useFlow();
  const ref = useRef<HTMLDivElement>(null);
  const topRef = useRef<SVGPathElement>(null);
  const bottomRef = useRef<SVGPathElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const border = useSegment(t, range);
  const visible = useTransform(() => (border.get() > 0 ? 1 : 0) * fade.get());
  const redVisible = useTransform(() => (border.get() > 0 ? alarm.get() : 0));
  const shadow = useTransform(
    success,
    (g) =>
      `0 40px 90px -30px rgb(0 0 0 / 0.6), 0 0 ${48 * g}px ${8 * g}px rgb(63 165 111 / ${0.4 * g})`,
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Outer edge of the card (padding included), so the outline traces the real border.
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      // At most once a frame, however many resize events arrive.
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return; // older browsers: measured once is enough
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  const inset = STROKE / 2;
  const halves = size.w > 0 ? outlineHalves(size.w, size.h, 28 - inset, fromBottom, inset) : null;

  return (
    <motion.div
      ref={ref}
      style={{ ...GLASS_TOKENS, x: shake, boxShadow: shadow }}
      className="relative flex flex-col justify-between rounded-[28px] bg-[#0f1b2d]/35 px-7 pt-7 pb-8 text-ink backdrop-blur-xl sm:p-8 lg:min-h-[540px]"
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
          {[
            [halves.top, topRef],
            [halves.bottom, bottomRef],
          ].map(([d, pathRef]) => (
            <motion.path
              key={d as string}
              ref={pathRef as React.RefObject<SVGPathElement>}
              d={d as string}
              fill="none"
              stroke={TONE.done}
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ pathLength: border, opacity: visible }}
            />
          ))}
          {[halves.top, halves.bottom].map((d) => (
            <motion.path
              key={`alarm${d}`}
              d={d}
              fill="none"
              stroke="#e5484d"
              strokeWidth={STROKE}
              strokeLinecap="round"
              style={{ pathLength: border, opacity: redVisible }}
            />
          ))}
          {!reduce && (
            <>
              <PathHead pathRef={topRef} progress={border} size={size} />
              <PathHead pathRef={bottomRef} progress={border} size={size} />
            </>
          )}
        </svg>
      )}
      <div>{children}</div>
      <div className="mt-8">{footer}</div>
    </motion.div>
  );
}
