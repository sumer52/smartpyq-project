import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { HomeIcon, ArrowLeftIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
      </div>

      <motion.div
        className="relative z-10 max-w-lg w-full text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* 404 Number */}
        <motion.div
          className="mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1 className="text-[10rem] font-bold leading-none text-accent select-none">
            404
          </h1>
        </motion.div>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-2xl font-bold text-primary mb-3">Page Not Found</h2>
          <p className="text-secondary mb-8 leading-relaxed">
            The page you're looking for doesn't exist, has been moved, or is temporarily unavailable. 
            Let's get you back on track.
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Link to="/" className="btn btn-primary btn-lg font-semibold">
            <HomeIcon className="h-5 w-5 mr-2" />
            Go Home
          </Link>
          <Link to="/search" className="btn btn-secondary btn-lg font-semibold">
            <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
            Search Papers
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn btn-ghost btn-lg font-semibold"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Go Back
          </button>
        </motion.div>

        {/* Helpful links */}
        <motion.div
          className="mt-12 bg-white backdrop-blur-sm border border-line rounded-2xl p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Quick Links</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { to: '/dashboard', label: 'Dashboard' },
              { to: '/pyq', label: 'PYQ Hub' },
              { to: '/ai', label: 'AI Assistant' },
              { to: '/my-papers', label: 'Upload Paper' },
              { to: '/faq', label: 'FAQ' },
              { to: '/contact', label: 'Contact' },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm text-muted hover:text-primary transition-colors py-2 px-3 rounded-lg hover:bg-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default NotFoundPage;
