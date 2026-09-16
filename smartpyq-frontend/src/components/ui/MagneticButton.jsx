import React, { useRef } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useReducedMotionSafe } from '../../lib/motion';

/**
 * MagneticButton - VengeanceUI-inspired magnetic hover effect.
 * The button subtly follows the cursor when hovered, creating a magnetic pull.
 * Gated: on touch-only devices and for reduced-motion users the cursor
 * tracking is skipped entirely — the button renders as a normal tap target.
 */
const MagneticButton = ({ children, className = '', strength = 0.3, ...props }) => {
  const ref = useRef(null);
  const skipMagnet = useReducedMotionSafe();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMouseMove = (e) => {
    if (skipMagnet || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) * strength);
    y.set((e.clientY - centerY) * strength);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      className={className}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileTap={{ scale: 0.97 }}
      {...props}
    >
      {children}
    </motion.button>
  );
};

export default MagneticButton;
