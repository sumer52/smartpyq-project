import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * AuroraGradient - VengeanceUI-inspired fluid gradient background.
 * Creates a mesmerizing aurora-like gradient effect that responds to scroll.
 * Adapted for SmartPYQ's purple/blue color palette.
 */
const AuroraGradient = ({ className = '' }) => {
  const ref = useRef(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      setScrollProgress(Math.min(scrollY / (vh * 2), 1));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={ref} className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden="true">
      {/* Main aurora blob - purple */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, rgba(88,28,135,0.1) 50%, transparent 70%)',
          top: '10%',
          left: '20%',
          filter: 'blur(80px)',
        }}
        animate={{
          x: [0, 40, -20, 30, 0],
          y: [0, -30, 20, -10, 0],
          scale: [1, 1.1, 0.95, 1.05, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Secondary blob - cyan */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(34,211,238,0.15) 0%, rgba(6,182,212,0.08) 50%, transparent 70%)',
          top: '30%',
          right: '15%',
          filter: 'blur(90px)',
        }}
        animate={{
          x: [0, -30, 20, -40, 0],
          y: [0, 20, -30, 10, 0],
          scale: [1, 0.95, 1.1, 0.98, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Accent blob - blue */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(37,99,235,0.08) 50%, transparent 70%)',
          bottom: '20%',
          left: '40%',
          filter: 'blur(70px)',
        }}
        animate={{
          x: [0, 25, -35, 15, 0],
          y: [0, -25, 15, -20, 0],
          scale: [1, 1.05, 0.9, 1.08, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Floating particles - subtle sparkles */}
      {Array.from({ length: 12 }, (_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-purple-300/30"
          style={{
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
          }}
          animate={{
            opacity: [0.2, 0.6, 0.2],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 3 + Math.random() * 4,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Scroll-responsive gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, transparent 0%, rgba(10,6,24,${0.1 + scrollProgress * 0.3}) 100%)`,
          transition: 'background 0.3s ease',
        }}
      />
    </div>
  );
};

export default AuroraGradient;
