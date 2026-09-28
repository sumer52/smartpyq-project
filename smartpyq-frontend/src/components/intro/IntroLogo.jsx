import React from 'react';
import { motion } from 'framer-motion';

const cinematicEase = [0.22, 1, 0.36, 1];

export default function IntroLogo({ reducedMotion, onEnter }) {
  return (
    <motion.div
      className="sp-intro__brand"
      initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94, filter: reducedMotion ? 'none' : 'blur(16px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.018, filter: reducedMotion ? 'none' : 'blur(8px)' }}
      transition={{ duration: reducedMotion ? 0.35 : 1.1, ease: cinematicEase }}
    >
      <motion.div
        className="sp-intro__brand-halo"
        aria-hidden="true"
        initial={{ opacity: 0, scale: 0.72 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reducedMotion ? 0.3 : 1.25, ease: cinematicEase }}
      />
      <img className="sp-intro__logo" src="/logo.png" alt="SmartPYQ — Learn Smarter, Score Better" />
      <motion.p
        className="sp-intro__brand-support"
        initial={{ opacity: 0, y: reducedMotion ? 0 : 8, filter: reducedMotion ? 'none' : 'blur(5px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: reducedMotion ? 0.25 : 0.45, delay: reducedMotion ? 0 : 0.72, ease: cinematicEase }}
      >
        AI-Powered PYQ Analysis
      </motion.p>
      <motion.button
        type="button"
        className="sp-intro__enter"
        onClick={onEnter}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: reducedMotion ? 0 : 1.08, ease: cinematicEase }}
      >
        Enter SmartPYQ <span aria-hidden="true">→</span>
      </motion.button>
    </motion.div>
  );
}
