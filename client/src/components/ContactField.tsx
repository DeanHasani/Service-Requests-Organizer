import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  contactInput,
  contactKind,
  formatContact,
  sanitizeContact,
  type ContactKind,
} from '@deskflow/shared';
import { cx } from '../lib/format';

const KINDS: Record<
  ContactKind,
  { label: string; placeholder: string; hint: string; inputMode: 'tel' | 'email' | 'numeric' }
> = {
  phone: {
    label: 'Phone',
    placeholder: '+383 44 123 456',
    hint: 'Digits only, with an optional + for the country code.',
    inputMode: 'tel',
  },
  email: {
    label: 'Email',
    placeholder: 'name@company.com',
    hint: 'A full email address.',
    inputMode: 'email',
  },
  extension: {
    label: 'Ext.',
    placeholder: '214',
    hint: 'The internal extension, 2 to 6 digits.',
    inputMode: 'numeric',
  },
};

/**
 * One contact field with the type chosen inside it. Typing is filtered to what the type allows,
 * and the value is stored as one string (`ext. 214` for extensions) that the server validates again.
 */
export function ContactField({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  error?: string;
}) {
  const [kind, setKind] = useState<ContactKind>(() => (value ? contactKind(value) : 'phone'));
  // Kept locally: a half-typed email has no "@" yet and would otherwise read back as a phone.
  const [typed, setTyped] = useState(() => (value ? contactInput(contactKind(value), value) : ''));
  const input = useRef<HTMLInputElement>(null);
  const meta = KINDS[kind];

  const switchKind = (next: ContactKind) => {
    setKind(next);
    setTyped('');
    onChange(''); // a phone number is not a valid email, so start fresh
    requestAnimationFrame(() => input.current?.focus());
  };

  const type = (raw: string) => {
    const clean = sanitizeContact(kind, raw);
    setTyped(clean);
    onChange(formatContact(kind, clean));
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        Contact information
      </label>
      <div
        className={cx(
          'flex h-9 rounded-control border bg-surface transition-[border-color,box-shadow] duration-150',
          'focus-within:border-cobalt focus-within:ring-3 focus-within:ring-cobalt/15',
          invalid
            ? 'border-urgent focus-within:ring-urgent/15'
            : 'border-line-strong hover:border-ink-3/50',
        )}
      >
        <div className="relative shrink-0 border-r border-line">
          <select
            aria-label="Contact type"
            value={kind}
            onChange={(e) => switchKind(e.target.value as ContactKind)}
            className="h-full cursor-pointer appearance-none rounded-l-control bg-sunken/60 pr-7 pl-3 text-base font-medium text-ink-2 focus:outline-none sm:text-[13px]"
          >
            {(Object.keys(KINDS) as ContactKind[]).map((k) => (
              <option key={k} value={k}>
                {KINDS[k].label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
        </div>
        {kind === 'extension' && (
          <span className="flex items-center pl-3 text-sm text-ink-3" aria-hidden>
            ext.
          </span>
        )}
        <input
          ref={input}
          id={id}
          size={1} // no built-in minimum width; the flex row decides
          type={kind === 'email' ? 'email' : 'text'}
          inputMode={meta.inputMode}
          autoComplete="off"
          placeholder={meta.placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-${error ? 'error' : 'hint'}`}
          value={typed}
          onChange={(e) => type(e.target.value)}
          onBlur={onBlur}
          className={cx(
            'min-w-0 flex-1 rounded-r-control bg-transparent px-3 text-base text-ink placeholder:text-ink-3 focus:outline-none sm:text-sm',
            kind === 'extension' && 'pl-1.5',
          )}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-urgent">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-[13px] text-ink-3">
          {meta.hint}
        </p>
      )}
    </div>
  );
}
