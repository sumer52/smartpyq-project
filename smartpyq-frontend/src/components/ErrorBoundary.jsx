import React from 'react';
import { Link } from 'react-router-dom';
import { ExclamationTriangleIcon, ArrowPathIcon, HomeIcon } from '@heroicons/react/24/outline';

/**
 * Catches render-time crashes in a single page so the rest of the shell
 * (header, footer, chat widget) keeps working instead of the whole app
 * unmounting to a white screen.
 *
 * A crashed page usually means one component threw — a bad prop, an
 * unexpected API shape, or a lazy chunk that no longer exists after a
 * deploy (ChunkLoadError). In all three cases a reload is the right first
 * move, so that is the primary action.
 *
 * Reset happens via `key` from the caller (see RouteBoundary in App.jsx):
 * navigating to another route mounts a fresh boundary with no error state.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.headingRef = React.createRef();
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the real failure visible to whoever is debugging: React only
    // passes the stack to this hook.
    console.error('[SmartPYQ] page crashed:', error, info?.componentStack);
  }

  componentDidMount() {
    this.focusHeading();
  }

  componentDidUpdate() {
    this.focusHeading();
  }

  // Move screen-reader focus to the message so the failure is announced
  // instead of leaving focus on a control that no longer exists.
  focusHeading() {
    if (this.state.error && this.headingRef.current) {
      this.headingRef.current.focus();
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
        <div
          role="alert"
          className="w-full max-w-lg text-center bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8"
        >
          <ExclamationTriangleIcon
            className="h-14 w-14 text-amber-400 mx-auto mb-6"
            aria-hidden="true"
          />
          <h1
            ref={this.headingRef}
            tabIndex={-1}
            className="text-2xl font-bold text-white mb-3 focus:outline-none"
          >
            This page hit a snag
          </h1>
          <p className="text-gray-300 leading-relaxed mb-8">
            Something on this page failed to load. The rest of SmartPYQ is still
            working — reload to try this page again, or head home and pick up
            from there.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="btn btn-primary btn-lg font-semibold"
            >
              <ArrowPathIcon className="h-5 w-5" aria-hidden="true" />
              Reload page
            </button>
            <Link to="/" className="btn btn-secondary btn-lg font-semibold">
              <HomeIcon className="h-5 w-5" aria-hidden="true" />
              Go home
            </Link>
          </div>

          {import.meta.env.DEV && (
            <pre className="mt-8 max-h-40 overflow-auto text-left text-xs text-red-300/80 bg-black/30 rounded-lg p-3 whitespace-pre-wrap">
              {String(error?.stack || error?.message || error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
