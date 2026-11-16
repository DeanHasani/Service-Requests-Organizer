import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { cx } from '../lib/format';

/** Native radio group styled as a segmented control: arrow keys, labels and form submission all work. */
export function Segmented({
  legend,
  options,
  registration,
  error,
}: {
  legend: string;
  options: { value: string; label: string; icon?: ReactNode; tone?: string }[];
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-medium text-ink">{legend}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-line-strong bg-sunken p-1 sm:grid-cols-4">
        {options.map((o) => (
          <label key={o.value} className="relative">
            <input type="radio" value={o.value} {...registration} className="peer sr-only" />
            <span
              className={cx(
                'flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] text-[13px] font-medium text-ink-2',
                'transition-[background-color,color,box-shadow] duration-150',
                'hover:text-ink peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-[0_1px_2px_rgb(23_32_51/0.12),0_0_0_1px_rgb(23_32_51/0.06)]',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-cobalt',
                o.tone,
              )}
            >
              {o.icon}
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-urgent">
          {error}
        </p>
      )}
    </fieldset>
  );
}
