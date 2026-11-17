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

/** A picked date means "by the end of that day", local time. Empty clears the deadline. */
export const fromDateInput = (value: string): string | null => {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999).toISOString();
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
