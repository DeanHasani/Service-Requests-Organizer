import { describe, expect, it } from 'vitest';
import {
  deadlineTime,
  formatCountdown,
  fromDateTimeInput,
  isEndOfDay,
  toDateInput,
  toTimeInput,
} from '../lib/format';

describe('deadline date and time', () => {
  it('treats a date without a time as the end of that day', () => {
    const iso = fromDateTimeInput('2026-11-20')!;
    expect(isEndOfDay(iso)).toBe(true);
    expect(toDateInput(iso)).toBe('2026-11-20');
    expect(toTimeInput(iso)).toBe('');
    expect(deadlineTime(iso)).toBeNull();
  });

  it('keeps a picked time and reads it back', () => {
    const iso = fromDateTimeInput('2026-11-20', '14:30')!;
    expect(isEndOfDay(iso)).toBe(false);
    expect(toDateInput(iso)).toBe('2026-11-20');
    expect(toTimeInput(iso)).toBe('14:30');
    expect(deadlineTime(iso)).not.toBeNull();
  });

  it('clears the deadline when there is no date', () => {
    expect(fromDateTimeInput('', '14:30')).toBeNull();
  });
});

describe('deadline countdown', () => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  const at = (ms: number) => new Date(now + ms).toISOString();
  it('shows the two biggest units left', () => {
    expect(formatCountdown(at((2 * 24 + 5) * 3600_000 + 59_000), now)).toBe('2d 5h left');
    expect(formatCountdown(at(5 * 3600_000 + 12 * 60_000), now)).toBe('5h 12m left');
    expect(formatCountdown(at(30_000), now)).toBe('1m left');
  });
  it('counts up once overdue', () => {
    expect(formatCountdown(at(-(3 * 3600_000 + 10 * 60_000)), now)).toBe('Overdue by 3h 10m');
  });
});
