import { useEffect, useRef, useState } from 'react';
import { useReducedMotionSafe } from '../../lib/motion';

/**
 * Parallax — scroll-linked depth wrapper (transform-only, rAF-throttled).
 * `speed` in [-1..1]: positive moves slower than scroll (background feel),
 * negative moves faster (foreground feel). Renders statically (no listener)
 * for reduced-motion / touch-only users, where depth effects are skipped.
 */
export const Parallax = ({ children, speed = 0.15, className = '' }) => {
  const ref = useRef(null);
  const reduced = useReducedMotionSafe();
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (reduced || !ref.current) return undefined;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          const vh = window.innerHeight || 1;
          // -1 (below fold) .. 1 (above fold), then damped
          const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
          setOffset(progress * speed * 60);
        }
        raf = 0;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, speed]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ transform: `translate3d(0, ${offset}px, 0)`, willChange: reduced ? undefined : 'transform' }}
    >
      {children}
    </div>
  );
};

export default Parallax;
