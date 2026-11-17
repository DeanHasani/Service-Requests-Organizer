import { useEffect, useState } from 'react';
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
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'relative flex h-9 items-center gap-3 rounded-md px-3 text-[13.5px] font-medium transition-colors duration-150',
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
          <Icon className="relative size-[17px] shrink-0 opacity-90" aria-hidden />
          <span className="relative flex-1">{label}</span>
          {count !== undefined && count > 0 && (
            <span className="tabular relative rounded-full bg-white/10 px-1.5 py-px text-[11px] text-navy-ink">
              {count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { data: summary } = useDashboard();
  const mine = summary ? summary.mine.open + summary.mine.inProgress : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
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
          <NavItem to="/analytics" icon={ChartColumn} label="Analytics" />
        )}
        <NavLink
          to="/requests/new"
          className="mt-5 flex h-9 items-center justify-center gap-2 rounded-md border border-white/12 text-[13px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-navy-2 active:scale-[0.97]"
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
            <span className="block truncate text-[13px] font-medium text-white">{user.name}</span>
            <span className="block text-xs text-navy-ink-dim">
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
  );
}

export function AppShell() {
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="min-h-dvh lg:bg-navy lg:py-3 lg:pr-3 lg:pl-60">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-navy lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-navy px-4 lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          aria-expanded={drawer}
          // Hidden while the menu is open (it has its own close button); fades back after.
          className={cx(
            'grid size-9 place-items-center rounded-md text-white transition-[opacity,transform] duration-200 hover:bg-navy-2',
            drawer ? 'pointer-events-none scale-90 opacity-0' : 'opacity-100',
          )}
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>
      <AnimatePresence>
        {drawer && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <motion.div
              className="absolute inset-0 bg-navy/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-navy shadow-pop"
              initial={{ transform: 'translateX(-100%)' }}
              animate={{ transform: 'translateX(0%)' }}
              exit={{ transform: 'translateX(-100%)' }}
              transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            >
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="absolute top-4 right-3 grid size-8 place-items-center rounded-md text-navy-ink hover:bg-navy-2"
              >
                <X className="size-4" aria-hidden />
              </button>
              <SidebarContent />
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
