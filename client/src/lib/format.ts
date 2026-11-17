const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const rel = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
const shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
/** Compact date for dense tables: year only when it is not this year. */
export const formatShortDate = (iso: string) => {
  const d = new Date(iso);
  return d.getFullYear() === new Date().getFullYear() ? shortFmt.format(d) : dateFmt.format(d);
};
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rel.format(Math.round(s / 60), 'minute');
  if (abs < 86_400) return rel.format(Math.round(s / 3600), 'hour');
  if (abs < 86_400 * 7) return rel.format(Math.round(s / 86_400), 'day');
  return formatDate(iso);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

// ---------- deadlines ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in local time, for `<input type="date">`. */
export const toDateInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** True for a deadline with no time picked, stored as the very end of that day (local time). */
export const isEndOfDay = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59;
};

/** `HH:MM` in local time, for `<input type="time">`; empty when the deadline is end of day. */
export const toTimeInput = (iso: string | null) => {
  if (!iso || isEndOfDay(iso)) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * A deadline from the date and optional time inputs, local time. No time means "by the end of
 * that day". No date clears the deadline.
 */
export const fromDateTimeInput = (date: string, time = ''): string | null => {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!time) return new Date(y!, m! - 1, d!, 23, 59, 59, 999).toISOString();
  const [h, min] = time.split(':').map(Number);
  return new Date(y!, m! - 1, d!, h!, min!, 0, 0).toISOString();
};

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
/** Clock time of a deadline, or null when it is simply "end of day". */
export const deadlineTime = (iso: string) =>
  isEndOfDay(iso) ? null : timeFmt.format(new Date(iso));

/** "20 Nov 2026" or "20 Nov 2026, 14:00". */
export const formatDeadline = (iso: string) => {
  const t = deadlineTime(iso);
  return t ? `${formatDate(iso)}, ${t}` : formatDate(iso);
};

const DAY_MS = 86_400_000;
/** Whole local days from today to the deadline: 0 today, 1 tomorrow, -1 yesterday. */
export const daysUntil = (iso: string, now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(iso);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  return Math.round((dueDay - start) / DAY_MS);
};

/** "3.5 h" under a day, otherwise "2.1 days". */
export const formatDuration = (hours: number) =>
  hours < 24 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} days`;

/** "2d 5h", "5h 12m" or "12m": the biggest two units, rounded down. */
const span = (ms: number) => {
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
};

/** "2d 5h left", or "Overdue by 3h 10m" once the deadline has passed. */
export const formatCountdown = (iso: string, now = Date.now()) => {
  const diff = new Date(iso).getTime() - now;
  return diff > 0 ? `${span(diff)} left` : `Overdue by ${span(-diff)}`;
};
