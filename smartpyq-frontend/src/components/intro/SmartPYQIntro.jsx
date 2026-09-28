import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import IntroParticles from './IntroParticles';
import IntroTypingText from './IntroTypingText';
import IntroAnalysisVisual from './IntroAnalysisVisual';
import IntroLogo from './IntroLogo';
import { ThumbnailCarousel } from '../ui/thumbnail-carousel';
import './intro.css';

const INTRO_SCENES = [
  { id: 'welcome', label: 'Welcome', tone: 'violet' },
  { id: 'analyze', label: 'Analyze', tone: 'blue' },
  { id: 'predict', label: 'Predict', tone: 'cyan' },
  { id: 'insights', label: 'Insights', tone: 'pink' },
  { id: 'smartpyq', label: 'SmartPYQ', tone: 'brand' },
];
const TOTAL_STEPS = INTRO_SCENES.length;

export default function SmartPYQIntro({ onComplete }) {
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef(0);
  const completedRef = useRef(false);
  const previousFocusRef = useRef(null);
  const skipRef = useRef(null);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    window.clearTimeout(exitTimerRef.current);
    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => onComplete?.(), reducedMotion ? 240 : 540);
  }, [onComplete, reducedMotion]);

  const goNext = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      finish();
      return;
    }
    setStep((current) => Math.min(TOTAL_STEPS - 1, current + 1));
  }, [finish, step]);

  const goBack = useCallback(() => {
    setStep((current) => Math.max(0, current - 1));
  }, []);

  const selectStep = useCallback((index) => {
    setStep(Math.min(TOTAL_STEPS - 1, Math.max(0, index)));
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus({ preventScroll: true });

    return () => {
      window.clearTimeout(exitTimerRef.current);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') finish();
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goBack();
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll('.sp-intro button:not([disabled])'));
        if (!controls.length) return;
        event.preventDefault();
        const currentIndex = controls.indexOf(document.activeElement);
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + direction + controls.length) % controls.length;
        controls[nextIndex].focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finish, goBack, goNext]);

  const showDocument = step === 1;
  const showNetwork = step === 2;

  return (
    <motion.section
      className={`sp-intro sp-intro--step-${step} ${exiting ? 'sp-intro--exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="SmartPYQ introduction"
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reducedMotion ? 0.2 : 0.52, ease: [0.22, 1, 0.36, 1] }}
      onClick={(event) => {
        if (event.target.closest('button')) return;
        goNext();
      }}
    >
      <img className="sp-intro__background" src="/intro-background.png" alt="" aria-hidden="true" />
      <div className="sp-intro__vignette" aria-hidden="true" />
      <div className="sp-intro__aurora sp-intro__aurora--left" aria-hidden="true" />
      <div className="sp-intro__aurora sp-intro__aurora--right" aria-hidden="true" />
      {!reducedMotion && (
        <div className="sp-intro__light-drops" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
        </div>
      )}
      <IntroParticles exiting={exiting} converging={step === 4} reducedMotion={reducedMotion} />

      {!reducedMotion && step < 4 && (
        <div className="sp-intro__academic" aria-hidden="true">
          <div className="sp-intro__paper sp-intro__paper--one"><b>PYQ</b><i /><i /><i /><span>✓</span></div>
          {showDocument && (
            <div className="sp-intro__question-document">
              <b>PYQ QUESTION PAPER</b>
              <span>Question 01</span><i />
              <span>Question 02</span><i />
              <span>Question 03</span><i />
              <span>Question 04</span><i />
              <u aria-hidden="true" />
            </div>
          )}
          <div className="sp-intro__paper sp-intro__paper--two"><b>01</b><i /><i /><span>?</span></div>
          <span className="sp-intro__symbol sp-intro__symbol--sum">∑</span>
          <span className="sp-intro__symbol sp-intro__symbol--function">ƒ(x)</span>
          {showNetwork && (
            <svg className="sp-intro__network" viewBox="0 0 900 540" fill="none">
              <g className="sp-intro__network-lines">
                <path d="M80 340L202 244L334 302L471 180L618 259L794 138" />
                <path d="M202 244L274 102L471 180L566 77" />
                <path d="M334 302L422 430L618 259L748 405" />
              </g>
              <g className="sp-intro__network-nodes">
                {[['80','340'],['202','244'],['334','302'],['471','180'],['618','259'],['794','138'],['274','102'],['566','77'],['422','430'],['748','405']].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index === 3 ? 5 : 3} />)}
              </g>
            </svg>
          )}
        </div>
      )}

      <p className="sp-intro__sr-only" aria-live="polite">
        Scene {step + 1} of {TOTAL_STEPS}: {INTRO_SCENES[step].label}
      </p>

      <AnimatePresence mode="wait">
        {step <= 2 && <IntroTypingText key={`typing-${step}`} step={step} reducedMotion={reducedMotion} />}
        {step === 3 && <IntroAnalysisVisual key="analysis" reducedMotion={reducedMotion} />}
        {step === 4 && <IntroLogo key="logo" reducedMotion={reducedMotion} onEnter={finish} />}
      </AnimatePresence>

      {step < 4 && (
        <nav className="sp-intro__navigation" aria-label="Intro scenes">
          <div className="sp-intro__navigation-actions">
            {step > 0 && <button type="button" className="sp-intro__back" onClick={goBack}>← Back</button>}
          </div>
          <ThumbnailCarousel
            items={INTRO_SCENES}
            activeIndex={step}
            onSelect={selectStep}
            ariaLabel="Choose an intro scene"
          />
          <p className="sp-intro__click-hint">Click anywhere to continue</p>
        </nav>
      )}

      <button ref={skipRef} className="sp-intro__skip" type="button" onClick={finish}>
        Skip Intro <span aria-hidden="true">→</span>
      </button>
    </motion.section>
  );
}
