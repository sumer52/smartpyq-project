import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiIcon } from '@heroicons/react/24/outline';

const OfflineBanner = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial state
    if (!navigator.onLine) {
      setShowBanner(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          className="fixed top-0 left-0 right-0 z-[100] bg-warning-500 backdrop-blur-sm border-b border-warning-500/30"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-center space-x-3">
            <WifiIcon className="h-5 w-5 text-warning shrink-0" />
            <span className="text-sm font-medium text-warning">
              You're currently offline. Some features may not be available.
            </span>
            <button
              onClick={() => window.location.reload()}
              className="text-xs font-semibold text-warning underline hover:text-primary transition-colors"
            >
              Retry
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineBanner;
