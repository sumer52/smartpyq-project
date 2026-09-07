import React, { useRef, useState, useEffect } from 'react';

/**
 * Marquee - CSS-based infinite scrolling row.
 * Duplicates content for seamless loop. Pauses on hover.
 */
const Marquee = ({ children, className = '', speed = 30, direction = 'left' }) => {
  const [paused, setPaused] = useState(false);

  return (
    <div
      className={`overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex w-max gap-6"
        style={{
          animation: `marquee-${direction === 'right' ? 'right' : 'left'} ${speed}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      >
        {children}
        {children}
        {children}
        {children}
      </div>
    </div>
  );
};

export default Marquee;
