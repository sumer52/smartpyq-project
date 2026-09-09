// Single source of truth for the backend origin.
// VITE_BACKEND_URL must be the Render origin ONLY — no /api/v1 suffix, no
// trailing slash (e.g. https://smartpyq-backend.onrender.com).
//
// Every API call, SSE URL, and file download in the app imports BACKEND_URL
// from this module instead of re-reading import.meta.env.

const raw = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');

export const IS_PRODUCTION = import.meta.env.PROD;

// Dev fallback: localhost backend. In a production build a missing
// VITE_BACKEND_URL is a deployment misconfiguration — surfaced loudly here
// and failed at build time by vite.config.js.
export const BACKEND_URL = raw || (IS_PRODUCTION ? '' : 'http://localhost:8000');

export function assertBackendConfigured() {
  if (IS_PRODUCTION && !raw) {
    // Throw instead of silently calling a same-origin path that will 404.
    throw new Error(
      'VITE_BACKEND_URL is not set. Add it in Vercel → Settings → Environment ' +
      'Variables (the Render origin, e.g. https://smartpyq-backend.onrender.com) ' +
      'and redeploy.'
    );
  }
}

// Dev-time console warning (only runs in the dev server).
if (import.meta.env.DEV && !raw) {
  console.warn('[backendUrl] VITE_BACKEND_URL not set — falling back to http://localhost:8000');
}
