/**
 * Unified motion system for SmartPYQ.
 * One canonical set of variants/timings so every page animates consistently.
 * All animations use transform/opacity only (GPU-friendly) and fast timings.
 */

/** Signature ease — matches the CSS cubic-bezier used across index.css */
export const EASE = [0.22, 1, 0.36, 1];

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
