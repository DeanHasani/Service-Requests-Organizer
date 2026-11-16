import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { STATUS_LABEL, STATUSES, type Status } from '@deskflow/shared';
import { cx } from '../lib/format';

// Empty stops are opaque and match the card, so the track never shows through them.
const EMPTY_FILL = '#111c30';
const EMPTY_RING = '#3a4963';

const TONE: Record<Status, string> = {
  OPEN: '#5b7ff0',
  IN_PROGRESS: '#e8a23e',
  RESOLVED: '#46b97a',
};

/**
 * The big lifecycle rail on the sign-in card. The fill runs through all three colours as the
 * request moves along; each stop is a button, so people can play with it.
 */
export function HeroRail({ at, onPick }: { at: number; onPick: (i: number) => void }) {
  const status = STATUSES[at]!;
  return (
    <div>
      <ol
        className="relative grid grid-cols-3"
        aria-label={`Example status: ${STATUS_LABEL[status]}`}
      >
        <span
          aria-hidden
          className="absolute top-[22px] right-[16.66%] left-[16.66%] h-1.5 rounded-full bg-white/10"
        />
        <motion.span
          aria-hidden
          className="absolute top-[22px] left-[16.66%] h-1.5 w-[66.68%] origin-left rounded-full"
          style={{
            backgroundImage: `linear-gradient(90deg, ${TONE.OPEN}, ${TONE.IN_PROGRESS}, ${TONE.RESOLVED})`,
          }}
          initial={false}
          animate={{ transform: `scaleX(${at / 2})` }}
          transition={{ duration: 0.7, ease: [0.77, 0, 0.175, 1] }}
        />
        {STATUSES.map((s, i) => {
          const reached = i <= at;
          const current = i === at;
          return (
            <li key={s} className="relative flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-label={`Show ${STATUS_LABEL[s]}`}
                aria-pressed={current}
                className="group relative grid size-12 cursor-pointer place-items-center rounded-full outline-offset-4"
              >
                {current && (
                  <span
                    aria-hidden
                    className="df-pulse absolute inset-0 rounded-full"
                    style={{ boxShadow: `0 0 0 2px ${TONE[s]}` }}
                  />
                )}
                <motion.span
                  initial={false}
                  animate={{
                    backgroundColor: reached ? TONE[s] : EMPTY_FILL,
                    borderColor: reached ? TONE[s] : EMPTY_RING,
                    boxShadow: reached ? `0 0 28px -2px ${TONE[s]}` : '0 0 0 0 rgba(0,0,0,0)',
                    transform: current ? 'scale(1)' : 'scale(0.84)',
                  }}
                  transition={{
                    duration: 0.4,
                    ease: [0.23, 1, 0.32, 1],
                    delay: reached ? 0.14 * i : 0,
                  }}
                  className="relative grid size-12 place-items-center rounded-full border-2 text-white transition-[filter] duration-200 group-hover:brightness-110"
                >
                  {reached && (i < at || s === 'RESOLVED') ? (
                    <Check className="size-5" strokeWidth={3} aria-hidden />
                  ) : (
                    <span
                      className={cx('size-3 rounded-full', reached ? 'bg-white' : 'bg-white/25')}
                    />
                  )}
                </motion.span>
              </button>
              <span
                className={cx(
                  'text-sm transition-colors duration-300',
                  current ? 'font-semibold text-white' : 'text-navy-ink-dim',
                )}
              >
                {STATUS_LABEL[s]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
