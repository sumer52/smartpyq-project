import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EASE, useReducedMotionSafe } from '../../lib/motion';

/* ============================================================
   ThumbnailCarousel — responsive stage carousel with:
   • spring-animated slide transitions (direction-aware)
   • swipe/drag gestures on the stage
   • autoplay (pauses on hover/focus; off for reduced motion)
   • clickable thumbnail navigation with animated active ring
   • keyboard arrows + aria semantics
   Built on the project's shared motion tokens — no new deps.
   ============================================================ */

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0, scale: 0.94 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir) => ({ x: dir > 0 ? '-60%' : '60%', opacity: 0, scale: 0.94 }),
};

/**
 * @param {Array}   items    [{ id, label, sublabel, render() -> node, thumbClass }]
 * @param {number}  interval autoplay ms (default 5000)
 * @param {string}  ariaLabel accessible name for the region
 */
const ThumbnailCarousel = ({
  items = [],
  interval = 5000,
  ariaLabel = 'Carousel',
  className = '',
}) => {
  const [[index, direction], setIndex] = useState([0, 0]);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotionSafe();
  const timerRef = useRef(null);
  const count = items.length;

  const paginate = useCallback((dir) => {
    setIndex(([i]) => [(i + dir + count) % count, dir]);
  }, [count]);

  const goTo = useCallback((next) => {
    setIndex(([i]) => [next, next > i ? 1 : -1]);
  }, []);

  // Autoplay — skipped entirely for reduced-motion users.
  useEffect(() => {
    if (reduced || paused || count < 2) return undefined;
    timerRef.current = setTimeout(() => paginate(1), interval);
    return () => clearTimeout(timerRef.current);
  }, [reduced, paused, count, interval, index, paginate]);

  if (!count) return null;
  const active = items[index];

  const onDragEnd = (e, info) => {
    if (info.offset.x < -70) paginate(1);
    else if (info.offset.x > 70) paginate(-1);
  };

  return (
    <section
      className={`relative ${className}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); paginate(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); paginate(-1); }
      }}
    >
      {/* Stage */}
      <div className="relative overflow-hidden rounded-2xl" tabIndex={0} aria-label={`${ariaLabel} — slide ${index + 1} of ${count}`}>
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={active.id}
            custom={direction}
            variants={reduced ? undefined : slideVariants}
            initial={reduced ? { opacity: 0 } : 'enter'}
            animate="center"
            exit={reduced ? { opacity: 0 } : 'exit'}
            transition={{ x: { type: 'spring', stiffness: 260, damping: 30 }, opacity: { duration: 0.25 }, scale: { duration: 0.3, ease: EASE } }}
            drag={reduced ? false : 'x'}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            onDragEnd={onDragEnd}
            className="cursor-grab active:cursor-grabbing touch-pan-y"
            aria-live="polite"
          >
            {active.render()}
          </motion.div>
        </AnimatePresence>

        {/* Arrows (desktop) */}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => paginate(-1)}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-black/40 backdrop-blur border border-white/15 text-white cursor-pointer transition hover:bg-black/60 hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => paginate(1)}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center w-9 h-9 rounded-full bg-black/40 backdrop-blur border border-white/15 text-white cursor-pointer transition hover:bg-black/60 hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail navigation */}
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2.5" role="tablist" aria-label={`${ariaLabel} thumbnails`}>
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}: ${item.label || item.id}`}
              onClick={() => goTo(i)}
              className="cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-hidden"
            >
              <motion.div
                className={`relative h-12 w-20 sm:h-14 sm:w-24 rounded-xl overflow-hidden border transition-colors duration-300 ${item.thumbClass || 'bg-white/5'} ${i === index ? 'border-brand-400/80' : 'border-white/10 hover:border-white/25'}`}
                animate={{ scale: i === index ? 1.04 : 1, opacity: i === index ? 1 : 0.6 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              >
                {item.thumb || (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white/90 text-center px-1 leading-tight">
                    {item.label}
                  </span>
                )}
                {i === index && (
                  <motion.span
                    layoutId="thumb-ring"
                    className="absolute inset-0 rounded-xl ring-2 ring-brand-400/80 pointer-events-none"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </motion.div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default ThumbnailCarousel;
