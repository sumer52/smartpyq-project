import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useReducedMotionSafe } from '../../lib/motion';

/**
 * CursorGlow - VengeanceUI-inspired cursor tracking with spring physics.
 * Enhanced version of SpotlightCard with:
 * - Spring-based cursor following (smoother)
 * - Radial gradient that moves with cursor
 * - Border glow intensity based on cursor proximity
 * - Gated on touch-only devices and for reduced-motion users (static card).
 */
const CursorGlow = ({
  children,
  className = '',
  contentClassName = '',
  glowColor = 'rgba(192,57,43,0.15)',
  glowSize = 250,
  springConfig = { stiffness: 300, damping: 25 },
  ...props
}) => {
  const skipCursorFx = useReducedMotionSafe();
  const ref = useRef(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Spring-smoothed values for buttery smooth cursor tracking
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  const glowRef = useRef(null);

  // The glow position is written to CSS variables instead of interpolating a
  // gradient string through framer-motion. Mixing `radial-gradient(...)`
  // strings that contain `transparent` makes framer treat that token as a
  // colour it cannot parse, which throws
  // "Cannot read properties of undefined (reading 'parse')" as soon as the
  // cursor moves. CSS variables animate visually identically and cost less.
  useEffect(() => {
    const el = glowRef.current;
    if (!el) return undefined;
    el.style.setProperty('--cursor-x', `${springX.get()}px`);
    el.style.setProperty('--cursor-y', `${springY.get()}px`);
    const stopX = springX.on('change', (v) => el.style.setProperty('--cursor-x', `${v}px`));
    const stopY = springY.on('change', (v) => el.style.setProperty('--cursor-y', `${v}px`));
    return () => { stopX(); stopY(); };
  }, [springX, springY]);

  const glowBackground = `radial-gradient(${glowSize}px circle at var(--cursor-x, 50%) var(--cursor-y, 50%), ${glowColor}, transparent 60%)`;

  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = useCallback((e) => {
    if (skipCursorFx || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }, [mouseX, mouseY, skipCursorFx]);

  const handleTouchMove = useCallback((e) => {
    if (skipCursorFx || !ref.current || !e.touches[0]) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.touches[0].clientX - rect.left);
    mouseY.set(e.touches[0].clientY - rect.top);
  }, [mouseX, mouseY, skipCursorFx]);

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden group ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onTouchMove={handleTouchMove}
      onTouchStart={() => {
        if (skipCursorFx || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        mouseX.set(rect.width / 2);
        mouseY.set(rect.height / 2);
        setIsHovering(true);
      }}
      onTouchEnd={() => setIsHovering(false)}
      whileHover={{ borderColor: 'rgba(192,57,43,0.3)' }}
      {...props}
    >
      {/* Radial glow that follows cursor with spring physics */}
      <motion.div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: glowBackground }}
        animate={{ opacity: isHovering ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />

      {/* Content: contentClassName lets a caller keep a flex/height chain
          through this wrapper (e.g. a fixed-height card with a scrolling body). */}
      <div className={`relative z-10 ${contentClassName}`}>{children}</div>
    </motion.div>
  );
};

export default CursorGlow;
