// Demo login session helpers.
// The demo login itself is frontend-only and instant (zero backend dependency).
// When the real backend is reachable, these helpers silently attach a real demo
// account session so feature pages (PYQ Hub, Upload, Analysis, Practice) can
// load actual data instead of hitting the API unauthenticated.

export const DEMO_EMAIL = 'demo@smartpyq.com';
export const DEMO_PASSWORD = 'demo123';
export const DEMO_SESSION_KEY = 'demo_session';
export const DEMO_OFFLINE_KEY = 'demo_offline';

export const isDemoSessionActive = () => {
  try {
    const session = localStorage.getItem(DEMO_SESSION_KEY);
    if (!session) return false;
    const parsed = JSON.parse(session);
    return parsed && parsed.email === DEMO_EMAIL;
  } catch {
    return false;
  }
};

export const clearDemoSession = () => {
  try {
    localStorage.removeItem(DEMO_SESSION_KEY);
    localStorage.removeItem(DEMO_OFFLINE_KEY);
  } catch {}
};

let connecting = null;

// Log the demo account into the backend and store its tokens under the same
// keys the app already reads. Returns true when a backend session is active.
export const attachDemoBackendSession = () => {
  if (!isDemoSessionActive()) return Promise.resolve(false);
  if (localStorage.getItem('auth_token') || localStorage.getItem('authToken')) {
    return Promise.resolve(true);
  }
  if (connecting) return connecting;

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
  connecting = fetch(`${BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, remember_me: false }),
  })
    .then(async (res) => {
      if (!res.ok) {
        try { localStorage.setItem(DEMO_OFFLINE_KEY, '1'); } catch {}
        return false;
      }
      const data = await res.json();
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('authToken', data.access_token);
      if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
      if (data.user) {
        localStorage.setItem('userData', JSON.stringify(data.user));
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      try { localStorage.removeItem(DEMO_OFFLINE_KEY); } catch {}
      return true;
    })
    .catch(() => {
      try { localStorage.setItem(DEMO_OFFLINE_KEY, '1'); } catch {}
      return false;
    })
    .finally(() => { connecting = null; });

  return connecting;
};
