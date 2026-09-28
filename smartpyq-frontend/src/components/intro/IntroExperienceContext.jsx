import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import SmartPYQIntro from './SmartPYQIntro';

const STORAGE_KEY = 'smartpyq_intro_seen';
const IntroExperienceContext = createContext(null);

class IntroErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const shouldShowFirstVisitIntro = () => {
  if (typeof window === 'undefined' || window.location.pathname !== '/') return false;
  try { return localStorage.getItem(STORAGE_KEY) !== 'true'; }
  catch { return false; }
};

export function IntroExperienceProvider({ children }) {
  const [showIntro, setShowIntro] = useState(shouldShowFirstVisitIntro);
  const [replayToken, setReplayToken] = useState(0);

  const completeIntro = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* storage may be unavailable */ }
    setShowIntro(false);
  }, []);

  const replayIntro = useCallback(() => {
    setReplayToken((value) => value + 1);
    setShowIntro(true);
  }, []);

  const value = useMemo(() => ({ replayIntro }), [replayIntro]);

  return (
    <IntroExperienceContext.Provider value={value}>
      {children}
      {showIntro && (
        <IntroErrorBoundary key={replayToken} onFailure={completeIntro}>
          <SmartPYQIntro onComplete={completeIntro} />
        </IntroErrorBoundary>
      )}
    </IntroExperienceContext.Provider>
  );
}

export function useSmartPYQIntro() {
  const context = useContext(IntroExperienceContext);
  if (!context) throw new Error('useSmartPYQIntro must be used within IntroExperienceProvider');
  return context;
}

/** Null-safe variant for components (e.g. the footer) that may render outside the provider. */
export function useSmartPYQIntroSafe() {
  return useContext(IntroExperienceContext) ?? null;
}
