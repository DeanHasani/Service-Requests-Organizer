import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Bug,
  Clock,
  FileQuestion,
  Lock,
  RefreshCw,
  RotateCw,
  ServerCrash,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { cx } from '../lib/format';
import { Button } from './ui';

export type ErrorKind =
  'offline' | 'server' | 'forbidden' | 'notFound' | 'conflict' | 'rateLimited' | 'crash';

type Copy = { code?: string; icon: LucideIcon; tone: string; title: string; body: string };

/** One message per kind of failure, so people know what happened and what to do next. */
const COPY: Record<ErrorKind, Copy> = {
  offline: {
    icon: WifiOff,
    tone: 'bg-sunken text-ink-2',
    title: 'Can’t reach the server',
    body: 'Your connection dropped or the DESKFLOW server is not running. Check your network, then try again.',
  },
  server: {
    code: '500',
    icon: ServerCrash,
    tone: 'bg-urgent-soft text-urgent',
    title: 'The server ran into a problem',
    body: 'This is on our side. Try again in a moment; if it keeps happening, let your manager know.',
  },
  forbidden: {
    code: '403',
    icon: Lock,
    tone: 'bg-high-soft text-high',
    title: 'You don’t have access to this',
    body: 'Your role does not allow this. Ask a manager if you think you should have access.',
  },
  notFound: {
    code: '404',
    icon: FileQuestion,
    tone: 'bg-open-soft text-open',
    title: 'We couldn’t find that',
    body: 'It may have been moved, or the link is wrong.',
  },
  conflict: {
    code: '409',
    icon: RefreshCw,
    tone: 'bg-progress-soft text-progress',
    title: 'Someone else changed this',
    body: 'Reload to see the latest version, then make your change again.',
  },
  rateLimited: {
    code: '429',
    icon: Clock,
    tone: 'bg-progress-soft text-progress',
    title: 'Too many attempts',
    body: 'Wait a few minutes before trying again.',
  },
  crash: {
    icon: Bug,
    tone: 'bg-urgent-soft text-urgent',
    title: 'This page stopped working',
    body: 'Something went wrong while showing this page. Reloading usually fixes it. Your saved work is not affected.',
  },
};

export function errorKind(error: unknown): ErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'offline';
    if (error.status === 403) return 'forbidden';
    if (error.status === 404 || error.status === 400) return 'notFound';
    if (error.status === 409) return 'conflict';
    if (error.status === 429) return 'rateLimited';
    return 'server';
  }
  return 'crash';
}

/** Compact error inside one panel; the rest of the page keeps working. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const kind = errorKind(error);
  const { icon: Icon, tone, title, body } = COPY[kind];
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <span className={cx('mb-3 grid size-10 place-items-center rounded-full', tone)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-2">{body}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" onClick={onRetry}>
          <RotateCw className="size-3.5" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

/** Whole-page error with its own title, explanation and ways out. */
export function ErrorPage({
  kind,
  title,
  body,
  onRetry,
  fullScreen = false,
  children,
}: {
  kind: ErrorKind;
  title?: string;
  body?: string;
  onRetry?: () => void;
  fullScreen?: boolean;
  children?: ReactNode;
}) {
  const copy = COPY[kind];
  const Icon = copy.icon;
  return (
    <div
      role="alert"
      className={cx(
        'flex items-center justify-center px-4',
        fullScreen ? 'min-h-dvh bg-canvas' : 'min-h-[60vh] py-10',
      )}
    >
      <div className="w-full max-w-md text-center">
        <span
          className={cx('mx-auto grid size-14 place-items-center rounded-2xl', copy.tone)}
          aria-hidden
        >
          <Icon className="size-7" />
        </span>
        {copy.code && (
          <p className="tabular mt-6 text-[13px] font-semibold tracking-[0.08em] text-ink-3">
            Error {copy.code}
          </p>
        )}
        <h1
          className={cx(
            'text-2xl font-semibold tracking-[-0.02em] text-ink',
            copy.code ? 'mt-1' : 'mt-6',
          )}
        >
          {title ?? copy.title}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
          {body ?? copy.body}
        </p>
        {children}
        <ErrorActions onRetry={onRetry} fullScreen={fullScreen} />
      </div>
    </div>
  );
}

function ErrorActions({ onRetry, fullScreen }: { onRetry?: () => void; fullScreen: boolean }) {
  const navigate = useNavigate();
  const linkClass =
    'inline-flex h-9 items-center justify-center rounded-control border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:bg-sunken';
  return (
    <div className="mt-7 flex flex-wrap justify-center gap-2">
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden /> Try again
        </Button>
      )}
      {!fullScreen && (
        <>
          <Button onClick={() => navigate(-1)}>Go back</Button>
          <Link to="/" className={linkClass}>
            Go to dashboard
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * Catches render crashes. Placed around each page (keyed by URL so it resets on navigation)
 * and around the whole app as a last resort.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fullScreen?: boolean },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      '[ui] render failed:',
      error.message,
      info.componentStack?.split('\n')[1]?.trim(),
    );
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorPage
        kind="crash"
        fullScreen={this.props.fullScreen}
        onRetry={() => window.location.reload()}
      />
    );
  }
}
