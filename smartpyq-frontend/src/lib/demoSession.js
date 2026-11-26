// Demo login session helpers.
import { BACKEND_URL } from './backendUrl';
// The demo login itself is frontend-only and instant (zero backend dependency).
// When the real backend is reachable, these helpers silently attach a real demo
// account session so feature pages (PYQ Hub, Upload, Analysis, Practice) can
// load actual data instead of hitting the API unauthenticated.

export const DEMO_EMAIL = 'demo@smartpyq.com';
export const DEMO_PASSWORD = 'demo123';
export const DEMO_SESSION_KEY = 'demo_session';
export const DEMO_OFFLINE_KEY = 'demo_offline';

// Show the demo-credentials panel by default (it's the product's guided
// demo). Hide it by setting VITE_ENABLE_DEMO=false at build time. The
// offline demo-login mechanism itself always works if invoked.
export const DEMO_UI_ENABLED = import.meta.env.VITE_ENABLE_DEMO !== 'false';

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

// ---------------------------------------------------------------------------
// Demo ADMIN session
//
// The admin login is frontend-only: these credentials create a local session
// and are never sent anywhere, so /admin/login works with no backend at all
// (API down, Render asleep, no network to the API). Admin data pages still call
// the API and will show their own error states when it is unreachable.
// The same pair is documented on the login card.
// ---------------------------------------------------------------------------

export const DEMO_ADMIN_ID = 'admin';
export const DEMO_ADMIN_EMAIL = 'admin@smartpyq.com';
export const DEMO_ADMIN_PASSWORD = 'smartpyq@admin';
export const DEMO_ADMIN_SESSION_KEY = 'demo_admin_session';

export const isDemoAdminSessionActive = () => {
  try {
    const session = localStorage.getItem(DEMO_ADMIN_SESSION_KEY);
    if (!session) return false;
    const parsed = JSON.parse(session);
    return !!parsed && typeof parsed.ts === 'number';
  } catch {
    return false;
  }
};

// True for the documented demo pair, whether typed as the bare ID or the email.
export const isDemoAdminCredentials = (id, password) => {
  const normalized = String(id || '').trim().toLowerCase();
  const matchesId = normalized === DEMO_ADMIN_ID || normalized === DEMO_ADMIN_EMAIL;
  return matchesId && password === DEMO_ADMIN_PASSWORD;
};

export const startDemoAdminSession = () => {
  try {
    localStorage.setItem(
      DEMO_ADMIN_SESSION_KEY,
      JSON.stringify({ id: DEMO_ADMIN_ID, ts: Date.now() })
    );
    return true;
  } catch {
    return false;
  }
};

export const clearDemoAdminSession = () => {
  try {
    localStorage.removeItem(DEMO_ADMIN_SESSION_KEY);
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
