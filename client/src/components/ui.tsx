import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, ChevronDown, Loader2, RotateCw, X } from 'lucide-react';
import { cx, initials } from '../lib/format';

// ---------- Button ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-navy text-white hover:bg-navy-3 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_1px_2px_rgb(15_27_45/0.2)]',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken hover:border-ink-3/40',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-urgent border border-urgent/30 hover:bg-urgent-soft',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center rounded-control font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

// ---------- Form fields ----------

const control =
  'w-full rounded-control border border-line-strong bg-surface text-ink placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-ink-3/50 focus:border-cobalt focus:outline-none focus:ring-3 focus:ring-cobalt/15 ' +
  'aria-invalid:border-urgent aria-invalid:focus:ring-urgent/15 disabled:bg-sunken disabled:text-ink-3';

export function Field({
  label,
  error,
  hint,
  optional,
  children,
  id,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-urgent">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string | undefined, invalid: boolean) =>
  id && invalid ? `${id}-error` : undefined;

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const invalid = rest['aria-invalid'] === true || rest['aria-invalid'] === 'true';
  return (
    <input
      aria-describedby={describedBy(rest.id, invalid)}
      {...rest}
      className={cx(control, 'h-9 px-3 text-sm', className)}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const invalid = rest['aria-invalid'] === true || rest['aria-invalid'] === 'true';
  return (
    <textarea
      aria-describedby={describedBy(rest.id, invalid)}
      {...rest}
      className={cx(control, 'min-h-24 resize-y px-3 py-2 text-sm leading-relaxed', className)}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const invalid = rest['aria-invalid'] === true || rest['aria-invalid'] === 'true';
  return (
    <div className={cx('relative', className)}>
      <select
        aria-describedby={describedBy(rest.id, invalid)}
        {...rest}
        className={cx(control, 'h-9 cursor-pointer appearance-none pr-8 pl-3 text-sm')}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
    </div>
  );
}

// ---------- Avatar ----------

const avatarTones = ['#3d5fc0', '#8a4fb5', '#1f7a6d', '#a3561c', '#4b5a75', '#b0385d'];

export function Avatar({
  name,
  size = 'sm',
  className,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const tone = avatarTones[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % avatarTones.length];
  return (
    <span
      aria-hidden
      style={{ backgroundColor: tone }}
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-white',
        size === 'xs' && 'size-5 text-[9px]',
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-8 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

// ---------- Panels and states ----------

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cx('rounded-panel border border-line bg-surface shadow-panel', className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  action,
  id,
}: {
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 id={id} className="text-[13px] font-semibold text-ink">
        {title}
      </h2>
      {action}
    </header>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('df-skeleton block h-3.5', className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cx('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}
    >
      <span className="mb-3 grid size-10 place-items-center rounded-full bg-sunken text-ink-3 [&>svg]:size-5">
        {icon}
      </span>
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 grid size-10 place-items-center rounded-full bg-urgent-soft text-urgent">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <p className="font-medium text-ink">This didn’t load</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-2">{message}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" onClick={onRetry}>
          <RotateCw className="size-3.5" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

// ---------- Dialog (native <dialog>: focus trap, Esc and inertness for free) ----------

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        'df-dialog m-auto w-[calc(100%-2rem)] rounded-[12px] border border-line bg-surface p-0 text-ink shadow-pop',
        width,
      )}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-[13px] text-ink-2">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 grid size-8 place-items-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} width="max-w-md">
      <p className="text-sm text-ink-2">{body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.015em] text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
