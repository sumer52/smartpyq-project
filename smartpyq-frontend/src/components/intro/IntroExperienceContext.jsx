import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BACKEND_URL } from '../../lib/backendUrl';
import SmartPYQIntro from './SmartPYQIntro';

const STORAGE_KEY = 'smartpyq_intro_seen';
const IntroExperienceContext = createContext(null);

// Privacy-friendly analytics: anonymous aggregate counters only. The backend
// stores a daily (event_type, scene) count — no IDs, IPs, user agents, or
// cookies. Fire-and-forget: analytics must never delay or break the intro.
// Beacons MUST target the backend origin explicitly: sendBeacon cannot be
// relied on for CORS, and a relative path would hit the Vercel domain (which
// has no such route — 405/404) instead of the FastAPI backend.
const trackIntroEvent = (eventType, scene = 0) => {
  if (!BACKEND_URL) return; // degraded mode: no backend, no beacons
  try {
    const payload = JSON.stringify({ event_type: eventType, scene });
    const url = `${BACKEND_URL}/api/v1/intro-analytics/event`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => { /* analytics are best-effort */ });
    }
  } catch { /* analytics must never break the intro */ }
};

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
  // One analytics event per first-visit session; replays and double-fires
  // (finish racing an error-boundary crash) stay out of the stats.
  const countedSessionRef = useRef(0);

  const completeIntro = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* storage may be unavailable */ }
    setShowIntro(false);
  }, []);

  // Count 'viewed' once, on the first-visit display only.
  useEffect(() => {
    if (showIntro && replayToken === 0) trackIntroEvent('viewed');
  }, [showIntro, replayToken]);

  const handleIntroFinish = useCallback((reason, scene = 0) => {
    if (replayToken === 0 && countedSessionRef.current === 0) {
      countedSessionRef.current += 1;
      trackIntroEvent(reason, scene);
    }
    completeIntro();
  }, [completeIntro, replayToken]);

  const replayIntro = useCallback(() => {
    setReplayToken((value) => value + 1);
    setShowIntro(true);
  }, []);

  const value = useMemo(() => ({ replayIntro }), [replayIntro]);

  return (
    <IntroExperienceContext.Provider value={value}>
      {children}
      {showIntro && (
        <IntroErrorBoundary key={replayToken} onFailure={() => handleIntroFinish('skipped', 0)}>
          <SmartPYQIntro onFinish={handleIntroFinish} />
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
