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
        {/* The copies only exist to make the loop seamless — they are hidden
            from assistive tech so nothing is announced four times. */}
        <div className="flex shrink-0 gap-6">{children}</div>
        <div className="flex shrink-0 gap-6" aria-hidden="true">{children}</div>
        <div className="flex shrink-0 gap-6" aria-hidden="true">{children}</div>
        <div className="flex shrink-0 gap-6" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
};

export default Marquee;
