import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { AlarmClock, Bell, CheckCheck, Circle, Hourglass, UserPlus } from 'lucide-react';
import type { AppNotification, NotificationType } from '@deskflow/shared';
import { useMarkAllNotifications, useMarkNotification, useNotifications } from '../lib/queries';
import { cx, timeAgo } from '../lib/format';

const typeIcon: Record<NotificationType, { Icon: typeof Bell; tone: string }> = {
  ASSIGNED: { Icon: UserPlus, tone: 'text-open' },
  DEADLINE_UNASSIGNED: { Icon: Hourglass, tone: 'text-high' },
  DEADLINE_NOT_STARTED: { Icon: Hourglass, tone: 'text-high' },
  DEADLINE_IN_PROGRESS: { Icon: Hourglass, tone: 'text-progress' },
  DEADLINE_OVERDUE: { Icon: AlarmClock, tone: 'text-urgent' },
};

/**
 * The bell: unread count, and a list that opens the related request. Opening an item marks it
 * read; each item can also be marked read or unread on its own.
 */
export function NotificationBell({
  align = 'left',
  onDark = true,
}: {
  align?: 'left' | 'right';
  onDark?: boolean;
}) {
  const q = useNotifications();
  const mark = useMarkNotification();
  const markAll = useMarkAllNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = q.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = (n: AppNotification) => {
    if (!n.read) mark.mutate({ id: n.id, read: true });
    setOpen(false);
    if (n.request) navigate(`/requests/${n.request.id}`);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cx(
          'relative grid size-9 place-items-center rounded-md transition-colors',
          onDark ? 'text-navy-ink hover:bg-navy-2 hover:text-white' : 'text-ink-2 hover:bg-sunken',
        )}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="tabular absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-urgent px-1 text-[10px] font-bold text-white ring-2 ring-navy">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cx(
              'absolute top-full z-50 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-panel border border-line bg-surface text-ink shadow-pop',
              align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right',
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <span className="text-sm font-semibold">
                Notifications{unread ? ` (${unread} unread)` : ''}
              </span>
              <button
                type="button"
                onClick={() => markAll.mutate()}
                disabled={!unread}
                className="inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline disabled:text-ink-3 disabled:no-underline"
              >
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            </div>
            <ul className="max-h-[min(460px,70vh)] divide-y divide-line overflow-y-auto">
              {q.data?.items.length ? (
                q.data.items.map((n) => {
                  const { Icon, tone } = typeIcon[n.type];
                  return (
                    <li
                      key={n.id}
                      className={cx('flex gap-3 px-4 py-3', !n.read && 'bg-cobalt-soft/40')}
                    >
                      <Icon className={cx('mt-0.5 size-4 shrink-0', tone)} aria-hidden />
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className={cx('block text-[13px]', !n.read && 'font-semibold')}>
                          {n.title}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-2">
                          {n.message}
                        </span>
                        <span className="mt-1 block text-[11px] text-ink-3">
                          {timeAgo(n.createdAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => mark.mutate({ id: n.id, read: !n.read })}
                        aria-label={n.read ? 'Mark as unread' : 'Mark as read'}
                        title={n.read ? 'Mark as unread' : 'Mark as read'}
                        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-cobalt hover:bg-sunken"
                      >
                        <Circle
                          className="size-2.5"
                          fill={n.read ? 'none' : 'currentColor'}
                          strokeWidth={2}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="px-4 py-8 text-center text-sm text-ink-3">
                  {q.isPending ? 'Loading…' : 'No notifications yet.'}
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
