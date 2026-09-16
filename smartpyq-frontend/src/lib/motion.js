/**
 * Unified motion system for SmartPYQ.
 * One canonical set of variants/timings so every page animates consistently.
 * All animations use transform/opacity only (GPU-friendly) and fast timings.
 */

/** Signature ease — matches the CSS cubic-bezier used across index.css */
export const EASE = [0.22, 1, 0.36, 1];

/** Stronger deceleration for hero/headline entrances */
export const EASE_OUT = [0.16, 1, 0.3, 1];

/** ------------------------------------------------------------------
 *  Duration tokens (seconds) — use these, never ad-hoc numbers.
 *  ------------------------------------------------------------------ */
export const D = {
  fast: 0.2,     // micro-interactions: presses, icon nudges
  normal: 0.35,  // hovers, dropdowns, small reveals
  reveal: 0.55,  // section/heading entrances
  hero: 0.9,     // hero headline sequence
};

/** Container: staggers children as they enter the viewport */
export const stagger = (delay = 0.06) => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: delay } },
});

/** Primary card/list-item entrance: fade + small rise */
export const cardUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Section/header entrance: slightly larger rise */
export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** Hover lift for cards (pair with cardUp) */
export const hoverLift = { y: -3, transition: { duration: 0.25, ease: EASE } };

/** Shared spring for layout indicators (nav pills, selected states) */
export const spring = { type: 'spring', stiffness: 350, damping: 30 };

/** Page-level enter/exit (matches App.jsx route transitions) */
export const pageIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2, ease: EASE } },
};

/** Modal: backdrop fade + panel scale (use with AnimatePresence) */
export const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};
export const modalPanel = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: EASE } },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15 } },
};

/** Bottom sheet (mobile-first modals): slide up from the bottom edge */
export const sheetPanel = {
  initial: { opacity: 0, y: '100%' },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, y: '100%', transition: { duration: 0.2, ease: EASE } },
};

/** List/table row entrance: tighter than cardUp, for use inside stagger containers */
export const listItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
};

/**
 * Reduced-motion-safe flag: true when the user prefers reduced motion OR the
 * device has no hover pointer (phones/tablets). Use to skip decorative
 * cursor-driven and continuous animations. Static renders remain identical.
 */
export const useReducedMotionSafe = () => {
  const prefersReduced = usePrefersReducedMotion();
  const noHover = useNoHoverPointer();
  return prefersReduced || noHover;
};

import { useEffect, useState, useRef } from 'react';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function useNoHoverPointer() {
  const [noHover, setNoHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    setNoHover(mq.matches);
    const onChange = (e) => setNoHover(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return noHover;
}
