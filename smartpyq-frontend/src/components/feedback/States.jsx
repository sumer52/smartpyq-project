import React from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';

/**
 * Shared async-state primitives.
 *
 * Every data page uses these so a failed or slow request can never leave an
 * endless skeleton on screen: LoadingState always renders visible text, and
 * ErrorState always renders "Something went wrong" plus a working Retry.
 */

/** Retry control — a real button with a 44px touch target. */
export const RetryButton = ({ onClick, busy = false, label = 'Try again', className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={busy}
    className={`btn btn-secondary ${className}`}
  >
    <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
    <span>{busy ? 'Retrying…' : label}</span>
  </button>
);

/**
 * Loading placeholder. `label` is announced to screen readers and shown on
 * screen, so users always know what is loading.
 */
export const LoadingState = ({
  label = 'Loading…',
  hint,
  rows = 0,
  className = '',
}) => (
  <div
    className={`w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 ${className}`}
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex items-center justify-center gap-3 py-2">
      <Loader2 className="h-5 w-5 animate-spin text-brand-400" aria-hidden="true" />
      <p className="text-sm text-gray-200">{label}</p>
    </div>
    {hint && <p className="mt-1 text-center text-xs text-gray-400">{hint}</p>}
    {rows > 0 && (
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-xl" aria-hidden="true" />
        ))}
      </div>
    )}
  </div>
);

/**
 * Failure state. Always says "Something went wrong" (unless a caller passes a
 * more specific title) and always offers a retry action.
 */
export const ErrorState = ({
  title = 'Something went wrong',
  message = 'We could not load this content. Please check your connection and try again.',
  onRetry,
  retryBusy = false,
  retryLabel = 'Try again',
  className = '',
}) => (
  <div
    className={`rounded-2xl border border-red-400/30 bg-red-500/[0.07] p-6 text-center ${className}`}
    role="alert"
  >
    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10">
      <AlertTriangle className="h-6 w-6 text-red-300" aria-hidden="true" />
    </div>
    <h2 className="text-lg font-semibold text-white">{title}</h2>
    <p className="mx-auto mt-2 max-w-prose text-sm text-gray-300">{message}</p>
    {onRetry && (
      <div className="mt-5 flex justify-center">
        <RetryButton onClick={onRetry} busy={retryBusy} label={retryLabel} />
      </div>
    )}
  </div>
);

/** Nothing-to-show state with an optional next action. */
export const EmptyState = ({
  title = 'Nothing here yet',
  message = '',
  icon: Icon = Inbox,
  action = null,
  className = '',
}) => (
  <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center ${className}`}>
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
      <Icon className="h-7 w-7 text-gray-300" aria-hidden="true" />
    </div>
    <h2 className="text-lg font-semibold text-white">{title}</h2>
    {message && <p className="mx-auto mt-2 max-w-prose text-sm text-gray-300">{message}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

export default LoadingState;
