import React from 'react';
import { motion } from 'framer-motion';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { HomeIcon, ArrowLeftIcon, ExclamationTriangleIcon, ShieldExclamationIcon, ServerIcon } from '@heroicons/react/24/outline';

const errorConfig = {
  403: {
    icon: ShieldExclamationIcon,
    title: 'Access Denied',
    message: "You don't have permission to access this page. If you believe this is a mistake, please contact support.",
    gradient: 'from-yellow-400/20 to-orange-500/20',
    iconColor: 'text-yellow-400',
  },
  500: {
    icon: ServerIcon,
    title: 'Server Error',
    message: 'Something went wrong on our end. Please try again later or contact support if the problem persists.',
    gradient: 'from-red-400/20 to-pink-500/20',
    iconColor: 'text-red-400',
  },
  default: {
    icon: ExclamationTriangleIcon,
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again or return to the homepage.',
    gradient: 'from-brand-400/20 to-accent-500/20',
    iconColor: 'text-brand-400',
  },
};

const ErrorPage = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const errorCode = parseInt(code) || 0;
  const config = errorConfig[errorCode] || errorConfig.default;
  const IconComponent = config.icon;

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0">
        <div className={`absolute top-20 left-20 w-64 h-64 bg-gradient-to-r ${config.gradient} rounded-full mix-blend-multiply filter blur-xl animate-pulse`} />
        <div className={`absolute bottom-20 right-20 w-48 h-48 bg-gradient-to-r ${config.gradient} rounded-full mix-blend-multiply filter blur-xl animate-pulse`} style={{ animationDelay: '1s' }} />
      </div>

      <motion.div
        className="relative z-10 max-w-lg w-full text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Error Code */}
        <motion.div
          className="mb-8"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {errorCode ? (
            <h1 className="text-[10rem] font-bold leading-none bg-gradient-to-r from-brand-400 to-accent-500 bg-clip-text text-transparent select-none">
              {errorCode}
            </h1>
          ) : (
            <div className="mb-4">
              <IconComponent className={`h-20 w-20 ${config.iconColor} mx-auto`} />
            </div>
          )}
        </motion.div>

        {/* Message */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h2 className="text-2xl font-bold text-white mb-3">{config.title}</h2>
          <p className="text-gray-300 mb-8 leading-relaxed">{config.message}</p>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Link to="/" className="btn btn-primary px-8 py-3 font-semibold inline-flex items-center justify-center">
            <HomeIcon className="h-5 w-5 mr-2" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn btn-secondary px-8 py-3 font-semibold inline-flex items-center justify-center"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Go Back
          </button>
          <Link to="/contact" className="btn btn-ghost px-8 py-3 font-semibold inline-flex items-center justify-center">
            Contact Support
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ErrorPage;
