import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WrenchIcon, XMarkIcon } from "@heroicons/react/24/outline";

const MAINTENANCE_KEY = "smartpyq_maintenance_dismissed";

const MaintenanceBanner = () => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const isMaintenance = import.meta.env.VITE_MAINTENANCE_MODE === "true";
    const msg = import.meta.env.VITE_MAINTENANCE_MESSAGE || "SmartPYQ is currently undergoing scheduled maintenance. Some features may be temporarily unavailable.";
    if (isMaintenance && !localStorage.getItem(MAINTENANCE_KEY)) {
      setVisible(true);
      setMessage(msg);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(MAINTENANCE_KEY, "true"); } catch(e) {}
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div className="bg-warning-50 border-b border-warning-500/30 px-4 py-3 relative z-50"
          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <WrenchIcon className="h-5 w-5 text-warning shrink-0" />
              <p className="text-sm text-warning">{message}</p>
            </div>
            <button onClick={dismiss} className="text-warning hover:text-warning-600 p-2 rounded-lg hover:bg-white transition-colors" aria-label="Dismiss maintenance notice">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MaintenanceBanner;
