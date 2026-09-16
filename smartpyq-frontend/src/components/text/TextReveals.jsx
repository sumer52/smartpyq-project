import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView, useMotionValue, useSpring, animate } from 'framer-motion';
import { EASE, EASE_OUT, D, useReducedMotionSafe } from '../../lib/motion';

/* ============================================================
   SmartPYQ text primitives — one consistent reveal language.
   Hierarchy rule: hero uses RevealWords/BlurReveal, section
   headings use RevealText, keywords use GradientKeyword, stats
   use AnimatedCounter, links use AnimatedUnderline. Body text is
   NEVER animated by these components.
   All motion is transform/opacity/filter only (GPU-friendly).
   ============================================================ */

/**
 * Masked slide-up reveal for headings.
 * The text rises from behind a clipping container — the signature
 * SmartPYQ heading entrance. Decorative overflow hidden is safe:
 * descenders are preserved via padding.
 */
export const RevealText = ({ as: Tag = 'span', children, delay = 0, className = '', once = true }) => {
  const reduced = useReducedMotionSafe();
  if (reduced) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag className={`reveal-mask ${className}`}>
      <motion.span
        className="reveal-mask__inner"
        initial={{ y: '110%' }}
        whileInView={{ y: '0%' }}
        viewport={{ once, amount: 0.6 }}
        transition={{ duration: D.reveal, ease: EASE_OUT, delay }}
      >
        {children}
      </motion.span>
    </Tag>
  );
};

/**
 * Word-by-word staggered reveal for hero/section titles.
 * Splits on spaces so wrapping stays natural. `as` controls the tag.
 */
export const RevealWords = ({ text, as: Tag = 'span', delay = 0, stagger = 0.06, className = '', wordClassName = '', once = true }) => {
  const reduced = useReducedMotionSafe();
  const words = String(text || '').split(' ');
  if (reduced) return <Tag className={className}>{text}</Tag>;
  return (
    <Tag className={`inline-block ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="reveal-word" aria-hidden="true">
          <motion.span
            className={`inline-block ${wordClassName}`}
            initial={{ opacity: 0, y: '0.6em' }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once, amount: 0.5 }}
            transition={{ duration: D.reveal * 0.9, ease: EASE_OUT, delay: delay + i * stagger }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
};

/**
 * Emphasized keyword with an animated gradient sweep + soft glow.
 * Use ONLY for hero keywords / section-title highlights — never paragraphs.
 * Pass `active` to control the sweep manually; defaults to on-view once.
 */
export const GradientKeyword = ({ children, className = '', active = true, glow = true }) => {
  const reduced = useReducedMotionSafe();
  const cls = `text-brand-gradient ${reduced ? '' : active ? 'animate' : ''} ${glow ? 'gradient-glow' : ''} ${className}`;
  return <span className={cls.trim()}>{children}</span>;
};

/**
 * Count-up number for stats. Renders the final value for reduced-motion /
 * no-JS environments and animates 0 -> value once in view. Optional
 * `suffix`/`prefix` and gradient styling via `gradient`.
 */
export const AnimatedCounter = ({ value, duration = 1.2, prefix = '', suffix = '', gradient = true, className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotionSafe();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (!inView || reduced) { setDisplay(value); return; }
    const controls = animate(0, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduced]);

  return (
    <span ref={ref} className={`stat-value ${gradient ? 'stat-value--gradient' : ''} ${className}`}>
      {prefix}{display.toLocaleString()}{suffix}
    </span>
  );
};

/**
 * Hover-grow underline for text links. Pure CSS driven (`.link-underline`),
 * this wrapper just standardizes markup. Children are rendered unchanged.
 */
export const AnimatedUnderline = ({ children, className = '', ...props }) => (
  <span className={`link-underline ${className}`} {...props}>{children}</span>
);

/**
 * Blur -> sharp entrance for MAJOR headings only (hero, page titles).
 * Filter transitions are GPU-composited on modern browsers; keep usage rare.
 */
export const BlurReveal = ({ as: Tag = 'span', children, delay = 0, className = '', once = true }) => {
  const reduced = useReducedMotionSafe();
  if (reduced) return <Tag className={className}>{children}</Tag>;
  return (
    <motion.span
      className={`inline-block ${className}`}
      initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
      whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
      viewport={{ once, amount: 0.6 }}
      transition={{ duration: D.reveal, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.span>
  );
};

/**
 * Character-by-character stagger for MAJOR hero typography only.
 * Expensive DOM-wise (one span per character) — keep under ~40 chars and
 * never use for body text. Falls back to plain text for reduced motion.
 */
export const RevealCharacters = ({ text, as: Tag = 'span', delay = 0, stagger = 0.028, className = '', charClassName = '', once = true }) => {
  const reduced = useReducedMotionSafe();
  const chars = Array.from(String(text || ''));
  if (reduced) return <Tag className={className}>{text}</Tag>;
  return (
    <Tag className={`inline-block ${className}`} aria-label={text}>
      {chars.map((ch, i) => (
        <motion.span
          key={i}
          className={`inline-block ${charClassName}`}
          style={{ whiteSpace: ch === ' ' ? 'pre' : undefined }}
          initial={{ opacity: 0, y: '0.45em', rotateX: 35 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
          viewport={{ once, amount: 0.5 }}
          transition={{ duration: D.reveal * 0.8, ease: EASE_OUT, delay: delay + i * stagger }}
          aria-hidden="true"
        >
          {ch}
        </motion.span>
      ))}
    </Tag>
  );
};

/**
 * Subtle 3D tilt following the cursor — premium depth for hero/feature
 * cards. Max ±6° so nothing ever looks gimmicky; disabled entirely for
 * reduced-motion and touch-only users.
 */
export const TiltCard = ({ children, className = '', maxTilt = 6, ...props }) => {
  const ref = useRef(null);
  const reduced = useReducedMotionSafe();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const onMove = (e) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: -py * maxTilt, y: px * maxTilt });
  };
  const onLeave = () => setTilt({ x: 0, y: 0 });

  return (
    <motion.div
      ref={ref}
      className={className}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      animate={{ rotateX: tilt.x, rotateY: tilt.y }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      style={{ transformStyle: 'preserve-3d', perspective: 900 }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default {
  RevealText, RevealWords, RevealCharacters, GradientKeyword, AnimatedCounter, AnimatedUnderline, BlurReveal, TiltCard,
};
