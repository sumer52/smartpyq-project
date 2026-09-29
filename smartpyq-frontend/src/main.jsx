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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)