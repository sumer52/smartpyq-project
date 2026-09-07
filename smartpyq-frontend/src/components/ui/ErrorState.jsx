import React from 'react';
import { motion } from 'framer-motion';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const ErrorState = ({ title = 'Something went wrong', description, onRetry, retryLabel = 'Try Again', className = '' }) => {
  return (
    <motion.div
      className={`text-center py-16 px-6 bg-red-500/5 backdrop-blur-sm border border-red-500/20 rounded-2xl ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <ExclamationTriangleIcon className="h-8 w-8 text-red-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 max-w-md mx-auto mb-6 leading-relaxed">
        {description || 'An unexpected error occurred. Please try again or contact support.'}
      </p>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-2 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl font-medium transition-colors">
          <ArrowPathIcon className="h-5 w-5" />
          {retryLabel}
        </button>
      )}
    </motion.div>
  );
};

export default ErrorState;
