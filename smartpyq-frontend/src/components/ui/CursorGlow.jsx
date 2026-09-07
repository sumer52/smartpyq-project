import React, { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

/**
 * CursorGlow - VengeanceUI-inspired cursor tracking with spring physics.
 * Enhanced version of SpotlightCard with:
 * - Spring-based cursor following (smoother)
 * - Radial gradient that moves with cursor
 * - Border glow intensity based on cursor proximity
 * - Works on touch devices (center glow on tap)
 */
const CursorGlow = ({
  children,
  className = '',
  glowColor = 'rgba(139,92,246,0.15)',
  glowSize = 250,
  springConfig = { stiffness: 300, damping: 25 },
  ...props
}) => {
  const ref = useRef(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Spring-smoothed values for buttery smooth cursor tracking
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  // Compute gradient position based on spring values
  const gradientX = useTransform(springX, (v) => `${v}px`);
  const gradientY = useTransform(springY, (v) => `${v}px`);

  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = useCallback((e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  }, [mouseX, mouseY]);

  const handleTouchMove = useCallback((e) => {
    if (!ref.current || !e.touches[0]) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.touches[0].clientX - rect.left);
    mouseY.set(e.touches[0].clientY - rect.top);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      ref={ref}
      className={`relative overflow-hidden group ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onTouchMove={handleTouchMove}
      onTouchStart={() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        mouseX.set(rect.width / 2);
        mouseY.set(rect.height / 2);
        setIsHovering(true);
      }}
      onTouchEnd={() => setIsHovering(false)}
      whileHover={{ borderColor: 'rgba(139,92,246,0.3)' }}
      {...props}
    >
      {/* Radial glow that follows cursor with spring physics */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background: useTransform(
            [springX, springY],
            ([x, y]) => `radial-gradient(${glowSize}px circle at ${x}px ${y}px, ${glowColor}, transparent 60%)`
          ),
          opacity: isHovering ? 1 : 0,
        }}
        transition={{ opacity: { duration: 0.2 } }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
};

export default CursorGlow;
