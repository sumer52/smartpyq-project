import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { useReducedMotionSafe } from '../../lib/motion';

/**
 * ScrollProgress — a 2px brand-gradient bar fixed to the top of the viewport.
 * Animated with scaleX (transform-only, GPU-composited) and spring-smoothed.
 * Hidden entirely for reduced-motion users and on short pages it simply
 * stays near zero. z-index sits below the header dropdowns.
 */
const ScrollProgress = () => {
  const reduced = useReducedMotionSafe();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 34, mass: 0.3 });

  if (reduced) return null;

  return (
    <motion.div
      className="scroll-progress"
      style={{ scaleX }}
      aria-hidden="true"
    />
  );
};

export default ScrollProgress;
