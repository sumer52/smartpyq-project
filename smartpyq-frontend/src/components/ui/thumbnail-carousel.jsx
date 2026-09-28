import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './thumbnail-carousel.css';

/**
 * Vite/React adaptation of the 21st.dev thumbnail-carousel pattern.
 * Controlled by the parent so it can be used for user-paced product tours.
 */
export function ThumbnailCarousel({
  items,
  activeIndex = 0,
  onSelect,
  className = '',
  ariaLabel = 'Carousel navigation',
}) {
  const trackRef = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const track = trackRef.current;
    const active = track?.querySelector(`[data-index="${activeIndex}"]`);
    if (!track || !active) return;
    const left = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeIndex, reduceMotion]);

  const moveFocus = (event, index) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = Math.min(items.length - 1, Math.max(0, index + direction));
    onSelect?.(nextIndex);
    trackRef.current?.querySelector(`[data-index="${nextIndex}"]`)?.focus();
  };

  return (
    <div className={`thumbnail-carousel ${className}`} onClick={(event) => event.stopPropagation()}>
      <div className="thumbnail-carousel__track" ref={trackRef} role="tablist" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <motion.button
              key={item.id ?? item.label}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`Scene ${index + 1}: ${item.label}`}
              tabIndex={active ? 0 : -1}
              data-index={index}
              className={`thumbnail-carousel__item ${active ? 'is-active' : ''}`}
              onClick={() => onSelect?.(index)}
              onKeyDown={(event) => moveFocus(event, index)}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            >
              {active && (
                <motion.span
                  className="thumbnail-carousel__active-frame"
                  layoutId="smartpyq-intro-thumbnail"
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                  aria-hidden="true"
                />
              )}
              <span className="thumbnail-carousel__number">{String(index + 1).padStart(2, '0')}</span>
              <span className={`thumbnail-carousel__visual thumbnail-carousel__visual--${item.tone ?? 'violet'}`} aria-hidden="true">
                <i /><i /><i />
              </span>
              <span className="thumbnail-carousel__label">{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export default ThumbnailCarousel;
