import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * PerspectiveGrid - VengeanceUI-inspired subtle grid background.
 * Creates a perspective grid with fading lines for a tech/premium feel.
 * Used behind AI Analysis and Trending sections.
 */
const PerspectiveGrid = ({ className = '', color = 'rgba(139,92,246,0.06)', lines = 20, opacity = 0.5 }) => {
  const gridLines = useMemo(() => {
    return Array.from({ length: lines }, (_, i) => ({
      id: i,
      offset: (i / lines) * 100,
    }));
  }, [lines]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true">
      {/* Horizontal lines */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ opacity }}
        preserveAspectRatio="none"
      >
        {gridLines.map((line) => (
          <line
            key={`h-${line.id}`}
            x1="0"
            y1={`${line.offset}%`}
            x2="100%"
            y2={`${line.offset}%`}
            stroke={color}
            strokeWidth="0.5"
          />
        ))}
        {gridLines.map((line) => (
          <line
            key={`v-${line.id}`}
            x1={`${line.offset}%`}
            y1="0"
            x2={`${line.offset}%`}
            y2="100%"
            stroke={color}
            strokeWidth="0.5"
          />
        ))}
      </svg>

      {/* Radial fade overlay to soften edges */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(10,6,24,0.8) 100%)',
        }}
      />

      {/* Animated glow spot */}
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)',
          filter: 'blur(40px)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
};

export default PerspectiveGrid;
