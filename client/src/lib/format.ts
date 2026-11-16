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
