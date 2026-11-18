import React from 'react';

/**
 * AnimatedBeam - A horizontal or vertical beam with a CSS pulse animation.
 * Used to visually connect steps or elements.
 */
const AnimatedBeam = ({ direction = 'horizontal', className = '', color = 'from-brand-500/40 via-accent-500/30 to-brand-500/40' }) => {
  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`relative overflow-hidden ${isHorizontal ? 'h-[1px] w-full' : 'w-[1px] h-full'} ${className}`}
    >
      {/* Base line */}
      <div className={`absolute inset-0 bg-linear-to-r ${color}`} />
      {/* Animated pulse using CSS animation to avoid framer-motion keyframe type issues */}
      <div
        className={`absolute ${isHorizontal ? 'h-full w-20' : 'w-full h-20'} bg-linear-to-r from-transparent via-[rgba(244,238,224,0.35)] to-transparent`}
        style={isHorizontal
          ? { animation: 'beam-slide-h 3s linear infinite' }
          : { animation: 'beam-slide-v 3s linear infinite' }
        }
      />
    </div>
  );
};

export default AnimatedBeam;
