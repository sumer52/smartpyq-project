import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

const SuccessState = ({ title, description, action, actionLabel, className = '' }) => {
  return (
    <motion.div
      className={`text-center py-16 px-6 bg-green-500/5 backdrop-blur-sm border border-green-500/20 rounded-2xl ${className}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, type: 'spring' }}
    >
      <motion.div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}>
        <CheckCircleIcon className="h-8 w-8 text-green-400" />
      </motion.div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      {description && <p className="text-gray-400 max-w-md mx-auto mb-6 leading-relaxed">{description}</p>}
      {action && actionLabel && (
        <button onClick={action} className="inline-flex items-center gap-2 px-6 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-300 border border-green-500/30 rounded-xl font-medium transition-colors">
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
};

export default SuccessState;
