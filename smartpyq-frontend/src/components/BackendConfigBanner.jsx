import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExclamationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { isBackendConfigured, MISSING_BACKEND_URL_MESSAGE } from '../lib/backendUrl';

/**
 * Degraded-mode notice for a production build missing VITE_BACKEND_URL.
 * The homepage and other static content keep working; data features fail
 * fast with typed errors (see lib/api.js). This banner tells visitors and
 * the operator what is wrong instead of leaving a silently broken app.
 */
const BackendConfigBanner = () => {
  const [visible, setVisible] = React.useState(!isBackendConfigured);

  React.useEffect(() => {
    if (!isBackendConfigured) console.error('[app] ' + MISSING_BACKEND_URL_MESSAGE);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-lg w-[calc(100%-2rem)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          role="alert"
        >
          <div className="bg-amber-500/15 backdrop-blur-xl border border-amber-500/30 rounded-xl p-4 shadow-2xl flex items-start space-x-3">
            <ExclamationCircleIcon className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">Service partially unavailable</p>
              <p className="text-sm text-gray-300 mt-1">
                Some features are temporarily unavailable due to a deployment configuration issue.
                Browsing pages still works.
              </p>
              <p className="text-xs text-gray-500 mt-2 break-words">{MISSING_BACKEND_URL_MESSAGE}</p>
            </div>
            <button
              onClick={() => setVisible(false)}
              className="text-gray-400 hover:text-white transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BackendConfigBanner;
