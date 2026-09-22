import React from 'react';
import { motion } from 'framer-motion';

/**
 * BorderBeam - VengeanceUI-inspired animated border effect.
 * Creates a sweeping light beam along the border of a container.
 * Used on AI Analysis showcase cards for premium feel.
 */
const BorderBeam = ({
  children,
  className = '',
  duration = 4,
  colorFrom = 'rgba(139,92,246,0.6)',
  colorTo = 'rgba(34,211,238,0.4)',
  thickness = 1,
  ...props
}) => {
  return (
    <div className={`relative overflow-hidden ${className}`} {...props}>
      {/* Animated beam */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, ${colorFrom} 10%, transparent 20%)`,
            animation: `border-beam-spin ${duration}s linear infinite`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `conic-gradient(from 180deg, transparent 0%, ${colorTo} 8%, transparent 16%)`,
            animation: `border-beam-spin ${duration * 1.3}s linear infinite reverse`,
          }}
        />
      </motion.div>

      {/* Inner content with mask */}
      <div
        className="relative z-10 rounded-2xl"
        style={{
          background: 'rgba(10,6,24,0.95)',
          margin: `${thickness}px`,
          borderRadius: 'calc(1rem - 1px)',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default BorderBeam;
