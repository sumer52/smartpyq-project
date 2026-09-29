import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const LINES = [
  {
    label: 'Welcome to SmartPYQ',
    duration: 650,
    segments: [
      { text: 'WELCOME TO ', tone: 'primary' },
      { text: 'SMARTPYQ', tone: 'violet' },
    ],
    support: 'AI-powered PYQ analysis for smarter exam preparation.',
  },
  {
    label: 'Analyze PYQ question papers',
    duration: 820,
    segments: [
      { text: 'ANALYZE ', tone: 'primary' },
      { text: 'PYQ QUESTION PAPERS.', tone: 'lavender' },
    ],
    support: 'Question papers become structured exam data.',
  },
  {
    label: 'Predict exam patterns',
    duration: 720,
    segments: [
      { text: 'PREDICT ', tone: 'primary' },
      { text: 'EXAM ', tone: 'lavender' },
      { text: 'PATTERNS.', tone: 'gradient-strong' },
    ],
    support: 'Turn past-paper evidence into clear preparation priorities.',
  },
];

function TypedSegments({ segments, count }) {
  let remaining = count;
  return segments.map((segment, index) => {
    const visible = segment.text.slice(0, Math.max(0, remaining));
    remaining -= segment.text.length;
    return (
      <span className={`sp-intro__typed-segment sp-intro__typed-segment--${segment.tone}`} key={`${segment.text}-${index}`}>
        {visible}
      </span>
    );
  });
}

export default function IntroTypingText({ step = 0, reducedMotion = false }) {
  const line = LINES[Math.min(step, LINES.length - 1)];
  const fullText = line.segments.map((segment) => segment.text).join('');
  const [typedCount, setTypedCount] = useState(reducedMotion ? fullText.length : 0);
  const [isTyping, setIsTyping] = useState(!reducedMotion);
  const frameRef = useRef(0);

  useEffect(() => {
    setTypedCount(reducedMotion ? fullText.length : 0);
    setIsTyping(!reducedMotion);
    if (reducedMotion) return undefined;

    // rAF fires at 60-120Hz, but a typing effect reads perfectly at ~24fps
    // (film standard). Re-rendering React at full rAF rate — with glowing
    // text-shadow repaints — janks low-end phones; this time-gate renders
    // the exact same visual timeline at a quarter of the React work.
    const FRAME_MS = 1000 / 24;
    const startedAt = performance.now();
    const total = line.duration;
    let alive = true;
    let lastPushed = -1;
    let lastPushTime = 0;
    const push = (progress, now) => {
      const nextCount = Math.floor(progress * fullText.length);
      if (nextCount === lastPushed) return;
      lastPushed = nextCount;
      lastPushTime = now;
      setTypedCount(nextCount);
      setIsTyping(progress < 1);
    };
    const tick = (now) => {
      if (!alive) return;
      const progress = Math.min(1, (now - startedAt) / total);
      if (progress >= 1) {
        push(1, now);
        return; // timeline complete — stop the loop entirely
      }
      if (lastPushed < 0 || now - lastPushTime >= FRAME_MS) {
        push(progress, now);
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [fullText, line.duration, reducedMotion, step]);

  return (
    <motion.section
      className={`sp-intro__typing-scene sp-intro__typing-scene--${step}`}
      aria-label={line.label}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: reducedMotion ? 0.18 : 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="sp-intro__system-label">SMARTPYQ ANALYSIS ENGINE</p>
      {step === 0 && (
        <motion.div
          className="sp-intro__hub-path"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0.2 : 0.55, ease: [0.22, 1, 0.36, 1] }}
          aria-label="PYQ Hub: Year, Stream, Subject, PYQ"
        >
          {['PYQ HUB', 'YEAR', 'STREAM', 'SUBJECT', 'PYQ'].map((item, index) => (
            <React.Fragment key={item}>
              {index > 0 && <i aria-hidden="true">→</i>}
              <span>{item}</span>
            </React.Fragment>
          ))}
        </motion.div>
      )}
      <div className="sp-intro__typing-line">
        <span className="sp-intro__typing-ghost" aria-hidden="true">{fullText}</span>
        <span className="sp-intro__typing-visible" aria-hidden="true">
          <TypedSegments segments={line.segments} count={typedCount} />
          {isTyping && <span className="sp-intro__caret" />}
        </span>
      </div>
      <motion.p
        className="sp-intro__typing-support"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: isTyping ? 0 : 1, y: isTyping ? 6 : 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {line.support}
      </motion.p>
      <div className="sp-intro__processing" aria-hidden="true">
        {['PYQ PAPER', 'SUBJECT', 'TOPIC', 'FREQUENCY', 'PATTERN'].map((item, index) => (
          <React.Fragment key={item}>
            {index > 0 && <i>→</i>}
            <span>{item}</span>
          </React.Fragment>
        ))}
      </div>
    </motion.section>
  );
}
