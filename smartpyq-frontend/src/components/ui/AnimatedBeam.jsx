import React from 'react';

/**
 * AnimatedBeam - A horizontal or vertical beam with a CSS pulse animation.
 * Used to visually connect steps or elements.
 */
const AnimatedBeam = ({ direction = 'horizontal', className = '', color = 'from-purple-500/40 via-cyan-500/30 to-purple-500/40' }) => {
  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={`relative overflow-hidden ${isHorizontal ? 'h-[1px] w-full' : 'w-[1px] h-full'} ${className}`}
    >
      {/* Base line */}
      <div className={`absolute inset-0 bg-gradient-to-r ${color}`} />
      {/* Animated pulse using CSS animation to avoid framer-motion keyframe type issues */}
      <div
        className={`absolute ${isHorizontal ? 'h-full w-20' : 'w-full h-20'} bg-gradient-to-r from-transparent via-white/40 to-transparent`}
        style={isHorizontal
          ? { animation: 'beam-slide-h 3s linear infinite' }
          : { animation: 'beam-slide-v 3s linear infinite' }
        }
      />
    </div>
  );
};

export default AnimatedBeam;
