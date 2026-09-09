import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';

/** Shimmer skeleton block — size it with Tailwind classes. */
export const Skeleton = ({ className = '' }) => (
  <div className={`skeleton ${className}`} aria-hidden="true" />
);

/** Card-shaped skeleton for list/dashboard loading states. */
export const SkeletonCard = ({ lines = 2 }) => (
  <div className="bg-white/5 rounded-xl border border-white/10 p-4" aria-hidden="true">
    <Skeleton className="h-4 w-3/4 mb-3" />
    {Array.from({ length: lines - 1 }, (_, i) => (
      <Skeleton key={i} className="h-3 w-1/2 mb-2 last:mb-0" />
    ))}
  </div>
);

/** Animated number counter — counts up when scrolled into view. */
export const Counter = ({ value, duration = 900, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState(0);
  const target = typeof value === 'number' ? value : 0;
  const isNumeric = typeof value === 'number' && !Number.isNaN(value);

  useEffect(() => {
    if (!inView || !isNumeric || target === 0) {
      if (target === 0) setDisplay(0);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration, isNumeric]);

  return (
    <span ref={ref} className={`stat-number ${className}`}>
      {isNumeric ? display : (value ?? '-')}
    </span>
  );
};
