import type { PointerEvent, ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { cx } from '../lib/format';

const SPRING = { stiffness: 140, damping: 18, mass: 0.6 };

/**
 * Dark navy "liquid glass" card that tilts toward the mouse, with coloured light behind it
 * that drifts the other way. Still for touch and
 * reduced-motion users.
 */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  // Pointer position inside the card, 0..1 on each axis (0.5 = centre).
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const x = useSpring(px, SPRING);
  const y = useSpring(py, SPRING);

  const rotateY = useTransform(x, [0, 1], [-9, 9]);
  const rotateX = useTransform(y, [0, 1], [7, -7]);
  const shiftX = useTransform(x, [0, 1], [-10, 10]);
  const shiftY = useTransform(y, [0, 1], [-8, 8]);
  const glowX = useTransform(x, [0, 1], [40, -40]);
  const glowY = useTransform(y, [0, 1], [30, -30]);

  const track = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <div
      className={cx('relative [perspective:1400px]', className)}
      onPointerMove={track}
      onPointerLeave={reset}
    >
      {/* Coloured light behind the glass, in the three status colours; clipped to the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
      >
        <motion.div
          className="absolute inset-0"
          style={reduce ? undefined : { x: glowX, y: glowY }}
        >
          <span className="df-blob absolute top-[8%] left-[6%] size-72 rounded-full bg-[#4f72e3] opacity-55 blur-3xl" />
          <span className="df-blob absolute top-[38%] right-[4%] size-80 rounded-full bg-[#e09a36] opacity-35 blur-3xl [animation-delay:-6s]" />
          <span className="df-blob absolute bottom-[6%] left-[22%] size-72 rounded-full bg-[#3fa56f] opacity-40 blur-3xl [animation-delay:-12s]" />
        </motion.div>
      </div>

      <motion.div
        className="relative h-full overflow-hidden rounded-[28px] border border-white/15 text-navy-ink shadow-[0_40px_90px_-30px_rgb(15_27_45/0.55),inset_0_1px_0_rgb(255_255_255/0.22),inset_0_-1px_0_rgb(255_255_255/0.05)] [transform-style:preserve-3d]"
        style={{
          rotateX: reduce ? 0 : rotateX,
          rotateY: reduce ? 0 : rotateY,
          x: reduce ? 0 : shiftX,
          y: reduce ? 0 : shiftY,
          backgroundImage:
            'linear-gradient(150deg, rgb(20 33 54 / 0.9) 0%, rgb(12 21 37 / 0.94) 55%, rgb(7 13 25 / 0.97) 100%)',
          backdropFilter: 'blur(28px) saturate(170%)',
          WebkitBackdropFilter: 'blur(28px) saturate(170%)',
        }}
      >
        {/* glass edge: a bright rim along the top-left that fades out */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[28px] [background:linear-gradient(135deg,rgb(255_255_255/0.22),transparent_32%,transparent_70%,rgb(255_255_255/0.06))] [mask:linear-gradient(#000,#000)_content-box,linear-gradient(#000,#000)] [mask-composite:exclude] p-px"
        />
        <div className="relative h-full [transform-style:preserve-3d]">{children}</div>
      </motion.div>
    </div>
  );
}

/** Lifts a child off the glass when the card tilts. */
export function Depth({
  z,
  children,
  className,
}: {
  z: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} style={{ transform: `translateZ(${z}px)` }}>
      {children}
    </div>
  );
}
