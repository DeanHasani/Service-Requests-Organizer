import { X } from 'lucide-react';
import { cx, fromDateTimeInput, toDateInput, toTimeInput } from '../lib/format';
import { Button, Input } from './ui';

/** What the two inputs hold: `YYYY-MM-DD` and an optional `HH:MM`. */
export type Deadline = { date: string; time: string };

export const deadlineOf = (iso: string | null): Deadline => ({
  date: toDateInput(iso),
  time: toTimeInput(iso),
});
export const deadlineToIso = (d: Deadline) => fromDateTimeInput(d.date, d.time);
export const sameDeadline = (a: Deadline, b: Deadline) => a.date === b.date && a.time === b.time;

/**
 * A deadline is a date, plus an optional time. With no time it means "by the end of that day".
 * The time stays disabled until a date is picked; clearing the date clears both.
 */
export function DeadlineInput({
  value,
  onChange,
  id,
  label = 'Deadline',
  disabled,
  clearable,
  className,
}: {
  value: Deadline;
  onChange: (next: Deadline) => void;
  id?: string;
  /** Used for the accessible names of both inputs. */
  label?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}) {
  return (
    <span className={cx('flex items-center gap-1.5', className)}>
      <Input
        id={id}
        type="date"
        aria-label={`${label}: date`}
        value={value.date}
        min={toDateInput(new Date().toISOString())}
        onChange={(e) => onChange({ date: e.target.value, time: e.target.value ? value.time : '' })}
        disabled={disabled}
        className="w-auto! min-w-0 flex-1"
      />
      <Input
        type="time"
        aria-label={`${label}: time (optional, end of day if empty)`}
        title={value.date ? 'Time (optional). Empty means end of day.' : 'Pick a date first'}
        value={value.time}
        onChange={(e) => onChange({ ...value, time: e.target.value })}
        disabled={disabled || !value.date}
        className="w-[7.5rem]! shrink-0"
      />
      {clearable && value.date && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ date: '', time: '' })}
          disabled={disabled}
          aria-label={`Remove ${label.toLowerCase()}`}
          title="Remove deadline"
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      )}
    </span>
  );
}
