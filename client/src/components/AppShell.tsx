import { createContext, use, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChartColumn,
  ClipboardCheck,
  Inbox,
  LayoutGrid,
  ListTodo,
  LogOut,
  Menu,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { ROLE_LABEL } from '@deskflow/shared';
import { useAuth, useCurrentUser } from '../lib/auth';
import { useDashboard } from '../lib/queries';
import { cx } from '../lib/format';
import { Avatar } from './ui';
import { ErrorBoundary } from './errors';
import { NotificationBell } from './NotificationBell';

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#24344d" />
        <path d="M9 16h14" stroke="#4b5d7a" strokeWidth="2" />
        <circle cx="9" cy="16" r="3" fill="#8fa8f5" />
        <circle cx="16" cy="16" r="3" fill="#e0a23b" />
        <circle cx="23" cy="16" r="3" fill="#4fb286" />
      </svg>
      <span className="text-[15px] font-bold tracking-[0.06em] text-white">DESKFLOW</span>
    </span>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  count,
  end,
}: {
  to: string;
  icon: typeof Inbox;
  label: string;
  count?: number;
  end?: boolean;
}) {
  const large = use(LargeNav);
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'relative flex items-center gap-3 rounded-md px-3 font-medium transition-colors duration-150',
          large ? 'h-11 text-[15.5px]' : 'h-9 text-[13.5px]',
          isActive ? 'text-white' : 'text-navy-ink hover:bg-navy-2 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-md bg-navy-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
              transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
            />
          )}
          <Icon
            className={cx('relative shrink-0 opacity-90', large ? 'size-[19px]' : 'size-[17px]')}
            aria-hidden
          />
          <span className="relative flex-1">{label}</span>
          {count !== undefined && count > 0 && (
            <span
              className={cx(
                'tabular relative rounded-full bg-white/10 px-1.5 py-px text-navy-ink',
                large ? 'text-xs' : 'text-[11px]',
              )}
            >
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Phone menu: bigger text and taller rows, easier to read and tap. */
const LargeNav = createContext(false);

/**
 * Desktop: logo row with the bell, then the menu. `mobile`: the phone menu under the top bar,
 * which already shows the logo and bell, so it starts with the links, in larger text.
 */
function SidebarContent({ mobile = false }: { mobile?: boolean }) {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { data: summary } = useDashboard();
  const mine = summary ? summary.mine.open + summary.mine.inProgress : undefined;
  const large = mobile;

  return (
    <LargeNav value={large}>
      <div className="flex h-full flex-col">
        {!mobile && (
          <div className="flex h-16 items-center justify-between gap-2 px-5">
            <Logo />
            <NotificationBell align="left" />
          </div>
        )}
        <nav
          aria-label="Main"
          className={cx('flex flex-1 flex-col px-3', mobile ? 'gap-1 pt-4' : 'gap-0.5 pt-2')}
        >
          <NavItem to="/" end icon={LayoutGrid} label="Dashboard" />
          <NavItem
            to="/requests"
            icon={Inbox}
            label={user.role === 'MANAGER' ? 'All requests' : 'Requests'}
          />
          {user.role === 'EMPLOYEE' && (
            <NavItem to="/my" icon={ListTodo} label="My requests" count={mine} />
          )}
          {user.role === 'MANAGER' && (
            <NavItem
              to="/unassigned"
              icon={ClipboardCheck}
              label="To review"
              count={summary?.unassigned}
            />
          )}
          <NavItem to="/team" icon={Users} label="Team" />
          {user.role === 'MANAGER' && (
            <NavItem to="/analytics" icon={ChartColumn} label="Insights" />
          )}
          <NavLink
            to="/requests/new"
            className={cx(
              'mt-5 flex items-center justify-center gap-2 rounded-md border border-white/12 font-medium text-white transition-[background-color,transform] duration-150 hover:bg-navy-2 active:scale-[0.97]',
              large ? 'h-11 text-[15px]' : 'h-9 text-[13px]',
            )}
          >
            <Plus className="size-4" aria-hidden /> New request
          </NavLink>
        </nav>
        <div className="flex items-center gap-3 border-t border-white/8 px-4 py-4">
          <Link
            to="/profile"
            title="Your profile"
            className="-m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-navy-2"
          >
            <Avatar name={user.name} size="md" />
            <span className="min-w-0 flex-1">
              <span
                className={cx(
                  'block truncate font-medium text-white',
                  large ? 'text-[15px]' : 'text-[13px]',
                )}
              >
                {user.name}
              </span>
              <span className={cx('block text-navy-ink-dim', large ? 'text-[13px]' : 'text-xs')}>
                {ROLE_LABEL[user.role]} · Profile
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 place-items-center rounded-md text-navy-ink-dim transition-colors hover:bg-navy-2 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </LargeNav>
  );
}

export function AppShell() {
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [location.pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className="min-h-dvh lg:bg-navy lg:py-3 lg:pr-3 lg:pl-60">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 bg-navy lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar + menu. The bar stays on top and usable while the menu is open. */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between bg-navy px-4 lg:hidden">
        <Logo />
        <span className="flex items-center gap-1">
          <NotificationBell align="right" />
          <button
            type="button"
            onClick={() => setDrawer((v) => !v)}
            aria-label={drawer ? 'Close menu' : 'Open menu'}
            aria-expanded={drawer}
            aria-controls="mobile-menu"
            className="grid size-9 place-items-center rounded-md text-white transition-colors hover:bg-navy-2"
          >
            {/* The three lines turn into an X, and back. */}
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={drawer ? 'close' : 'open'}
                className="grid place-items-center"
                initial={{ opacity: 0, rotate: drawer ? -90 : 90, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: drawer ? 90 : -90, scale: 0.7 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {drawer ? (
                  <X className="size-5" aria-hidden />
                ) : (
                  <Menu className="size-5" aria-hidden />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </span>
      </header>
      <AnimatePresence>
        {drawer && (
          // Below the top bar, so the bar (menu button, bell) stays usable; only the page dims.
          <div id="mobile-menu" className="fixed inset-x-0 top-14 bottom-0 z-40 lg:hidden">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-navy/45 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              aria-label="Menu"
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-navy shadow-pop"
              initial={{ transform: 'translateX(-100%)' }}
              animate={{ transform: 'translateX(0%)' }}
              exit={{ transform: 'translateX(-100%)' }}
              transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            >
              <SidebarContent mobile />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* On desktop the page sits on a rounded sheet; the navy sidebar colour wraps around it. */}
      <div className="lg:min-h-[calc(100dvh-24px)] lg:rounded-[20px] lg:bg-canvas lg:shadow-[0_1px_0_rgb(255_255_255/0.04)]">
        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, transform: 'translateY(6px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          >
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
