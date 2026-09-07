import React from 'react';
import { motion } from 'framer-motion';

const EmptyState = ({ icon: Icon, title, description, action, actionLabel, actionIcon: ActionIcon, className = '' }) => {
  return (
    <motion.div
      className={`text-center py-16 px-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {Icon && (
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Icon className="h-8 w-8 text-gray-400" />
        </div>
      )}
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 max-w-md mx-auto mb-6 leading-relaxed">{description}</p>
      {action && actionLabel && (
        <button onClick={action} className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium transition-colors">
          {ActionIcon && <ActionIcon className="h-5 w-5" />}
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
};

export default EmptyState;
