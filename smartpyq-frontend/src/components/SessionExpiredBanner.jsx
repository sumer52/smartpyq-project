import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { ExclamationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Displays a banner when the user's session has expired.
 * Detects the ?session=expired query parameter and shows a notification.
 */
const SessionExpiredBanner = () => {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('session') === 'expired') {
      setVisible(true);
      // Clean URL without reload
      const url = new URL(window.location);
      url.searchParams.delete('session');
      window.history.replaceState({}, '', url);
    }
  }, [location]);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setVisible(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-lg w-[calc(100%-2rem)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="bg-amber-500/15 backdrop-blur-xl border border-amber-500/30 rounded-xl p-4 shadow-2xl flex items-start space-x-3">
            <ExclamationCircleIcon className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">Session Expired</p>
              <p className="text-sm text-gray-300 mt-1">
                Your session has expired. Please log in again to continue.
              </p>
              <div className="mt-3 flex items-center space-x-3">
                <Link
                  to="/login"
                  className="btn btn-primary btn-sm px-4 py-1.5 text-xs font-semibold"
                  onClick={() => setVisible(false)}
                >
                  Log In
                </Link>
                <button
                  onClick={() => setVisible(false)}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              onClick={() => setVisible(false)}
              className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
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

export default SessionExpiredBanner;
