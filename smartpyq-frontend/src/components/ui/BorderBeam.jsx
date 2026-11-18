import React from 'react';

/**
 * BorderBeam - the framed card used by the analysis showcase.
 *
 * It used to sweep two animated conic gradients around its edge. That moving
 * glow is the tell this redesign removes, so the frame is now a single 1px
 * rule on the ink ground and the card keeps its content untouched.
 *
 * colorFrom / colorTo / duration stay in the signature because callers still
 * pass them; they are ignored now.
 */
const BorderBeam = ({
  children,
  className = '',
  thickness = 1,
  colorFrom,
  colorTo,
  duration,
  ...props
}) => (
  <div
    className={`relative overflow-hidden border border-[rgba(244,238,224,0.12)] ${className}`}
    {...props}
  >
    <div
      className="relative z-10 rounded-2xl"
      style={{
        background: 'rgba(22,19,14,0.97)',
        margin: `${thickness}px`,
        borderRadius: 'calc(0.75rem - 1px)',
      }}
    >
      {children}
    </div>
  </div>
);

export default BorderBeam;
