import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Check for reduced motion preference
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Set CSS custom property for motion preference
if (prefersReducedMotion) {
  document.documentElement.style.setProperty('--motion-reduce', '1');
} else {
  document.documentElement.style.setProperty('--motion-reduce', '0');
}

// Add motion preference listener for dynamic changes
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
  document.documentElement.style.setProperty('--motion-reduce', e.matches ? '1' : '0');
});

// Disable the right-click context menu site-wide (product decision).
// Scope is deliberately narrow: only the context menu is suppressed —
// keyboard DevTools shortcuts (F12, Ctrl+Shift+I/J, Ctrl+U), text
// selection, and copying all keep working.
document.addEventListener('contextmenu', (e) => e.preventDefault());

// app:ready handshake — reveal the app over the static splash.
// Two rAFs: guarantee the first commit has painted before we flip
// [data-app-ready], so the splash never flickers away before content exists.
const revealApp = () => requestAnimationFrame(() => requestAnimationFrame(() => {
  document.documentElement.setAttribute('data-app-ready', '');
  document.getElementById('splash')?.remove();
}));

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} finally {
  // Always lift the splash, even when a page throws during the first render:
  // the route error boundary still renders a usable page underneath, and the
  // splash would otherwise stay on top of it at z-index 9999. (In development
  // React re-throws a caught render error out of render(), which used to skip
  // the reveal entirely.)
  revealApp();
}