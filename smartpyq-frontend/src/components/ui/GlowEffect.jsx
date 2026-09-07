import React, { useRef, useState } from 'react';

/**
 * GlowEffect - Adds a subtle glow that follows the cursor within a container.
 * Wrap any element to add this effect.
 */
const GlowEffect = ({ children, className = '', color = 'rgba(139,92,246,0.12)', size = 300 }) => {
  const ref = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={ref}
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <div
        className="pointer-events-none absolute rounded-full transition-opacity duration-300"
        style={{
          width: size,
          height: size,
          left: position.x - size / 2,
          top: position.y - size / 2,
          background: `radial-gradient(circle, ${color}, transparent 70%)`,
          opacity: visible ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
};

export default GlowEffect;
