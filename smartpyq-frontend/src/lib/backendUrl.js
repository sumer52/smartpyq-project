// Single source of truth for the backend origin.
// VITE_BACKEND_URL must be the Render origin ONLY — no /api/v1 suffix, no
// trailing slash (e.g. https://smartpyq-backend.onrender.com).
//
// Every API call, SSE URL, and file download in the app imports BACKEND_URL
// from this module instead of re-reading import.meta.env.

const raw = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');

export const IS_PRODUCTION = import.meta.env.PROD;

// Dev fallback: localhost backend. In a production build a missing
// VITE_BACKEND_URL keeps an empty URL — API calls fail fast with a typed
// error (see api.js) and BackendConfigBanner explains the degraded state,
// instead of a module-level throw crashing the whole app on load.
export const BACKEND_URL = raw || (IS_PRODUCTION ? '' : 'http://localhost:8000');

// True when API calls can plausibly succeed: an origin is configured, or we
// are in dev with the localhost fallback. Production builds without an
// origin run in degraded mode (static pages work, data features fail fast).
export const isBackendConfigured = IS_PRODUCTION ? !!raw : true;

export const MISSING_BACKEND_URL_MESSAGE =
  'VITE_BACKEND_URL is not set. Add it in Vercel → Settings → Environment ' +
  'Variables (the Render origin, e.g. https://smartpyq-backend.onrender.com) ' +
  'and redeploy.';

// Dev-time console warning (only runs in the dev server).
if (import.meta.env.DEV && !raw) {
  console.warn('[backendUrl] VITE_BACKEND_URL not set — falling back to http://localhost:8000');
}
