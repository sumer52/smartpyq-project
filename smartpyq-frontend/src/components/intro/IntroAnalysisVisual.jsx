import React from 'react';
import { motion } from 'framer-motion';

const ease = [0.22, 1, 0.36, 1];
const card = {
  hidden: { opacity: 0, y: 18, scale: 0.96, filter: 'blur(9px)' },
  show: (delay) => ({ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: { duration: 0.48, delay, ease } }),
};

export default function IntroAnalysisVisual({ reducedMotion = false }) {
  const delay = (value) => (reducedMotion ? 0 : value);
  return (
    <motion.section
      className="sp-intro__analysis"
      aria-label="SmartPYQ identifies repeated questions, topic frequency, and exam priorities."
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
      transition={{ duration: reducedMotion ? 0.2 : 0.34 }}
    >
      <div className="sp-intro__scan" aria-hidden="true" />
      <motion.article className="sp-intro__data-card sp-intro__data-card--repeated" variants={card} initial="hidden" animate="show" custom={delay(0.02)}>
        <header><span className="sp-intro__data-icon">↻</span><b>REPEATED QUESTIONS</b><em>HIGH SIGNAL</em></header>
        <div className="sp-intro__question-row">
          <div><small>Statistical Inference</small><strong>Hypothesis Testing + Estimation</strong></div>
          <span className="sp-intro__heat" aria-label="Repeated topic">● ● ● ●</span>
        </div>
        <div className="sp-intro__question-row">
          <div><small>Linear Algebra</small><strong>Eigenvalues/Eigenvectors + Matrix Methods</strong></div>
          <span className="sp-intro__heat sp-intro__heat--strong" aria-label="Repeated topic">● ● ● ● ●</span>
        </div>
        <div className="sp-intro__question-row">
          <div><small>DSA</small><strong>Trees + Graphs</strong></div>
          <span className="sp-intro__heat" aria-label="Repeated topic">● ● ● ●</span>
        </div>
      </motion.article>

      <motion.article className="sp-intro__data-card sp-intro__data-card--frequency" variants={card} initial="hidden" animate="show" custom={delay(0.14)}>
        <header><b>IMPORTANT TOPICS</b><em>SUBJECT-WISE</em></header>
        <div className="sp-intro__subject-row"><span>Mathematics</span><strong>Linear Algebra</strong></div>
        <div className="sp-intro__subject-row"><span>Computer Science</span><strong>Data Structures & Algorithms</strong></div>
        <div className="sp-intro__subject-row"><span>Statistics</span><strong>Statistical Inference</strong></div>
      </motion.article>

      <motion.article className="sp-intro__data-card sp-intro__data-card--priority" variants={card} initial="hidden" animate="show" custom={delay(0.25)}>
        <header><b>EXAM PATTERNS</b><em>DETECTED</em></header>
        <div className="sp-intro__priority-ring"><span>AI</span></div>
        <p>Pattern confidence</p>
        <strong>High Priority</strong>
      </motion.article>

      <motion.article className="sp-intro__data-card sp-intro__data-card--practice" variants={card} initial="hidden" animate="show" custom={delay(0.36)}>
        <header><b>PRACTICE PRIORITIES</b><em>READY</em></header>
        <span className="sp-intro__practice-mark">✓</span>
        <strong>Study these first</strong>
      </motion.article>

      <motion.p className="sp-intro__analysis-message" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay(0.48), duration: 0.38, ease }}>
        Repeated questions. Subject-wise topics. Exam-ready priorities.
      </motion.p>
    </motion.section>
  );
}
