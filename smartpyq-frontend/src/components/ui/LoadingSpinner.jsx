import React from 'react';
import { motion } from 'framer-motion';

const LoadingSpinner = ({ size = 'md', text, fullScreen = false, className = '' }) => {
  const sizeClasses = { sm: 'h-6 w-6', md: 'h-10 w-10', lg: 'h-16 w-16', xl: 'h-24 w-24' };

  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div className="animate-spin rounded-full border-2 border-white/10 border-t-brand-500" style={{width: size === 'sm' ? 24 : size === 'lg' ? 64 : size === 'xl' ? 96 : 40, height: size === 'sm' ? 24 : size === 'lg' ? 64 : size === 'xl' ? 96 : 40}} role="status" aria-label="Loading" />
      {text && <motion.p className="text-gray-400 text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>{text}</motion.p>}
      <span className="sr-only">Loading...</span>
    </div>
  );

  if (fullScreen) return <div className="min-h-screen flex items-center justify-center">{spinner}</div>;
  return spinner;
};

export default LoadingSpinner;
