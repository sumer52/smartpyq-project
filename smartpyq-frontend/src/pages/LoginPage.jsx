import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon, EnvelopeIcon, LockClosedIcon, ExclamationCircleIcon, SparklesIcon, BookOpenIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import BorderBeam from '../components/ui/BorderBeam';
import SpotlightCard from '../components/ui/SpotlightCard';
import GlowEffect from '../components/ui/GlowEffect';
import CursorGlow from '../components/ui/CursorGlow';
import TextScramble from '../components/ui/TextScramble';
const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);
  const validateForm = () => {
    const newErrors = {};
    if (!formData.email) {
      newErrors.email = 'Please enter your email address';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Please enter your password';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Trim any accidental spaces from inputs
    const trimmedEmail = formData.email.trim();
    const trimmedPassword = formData.password.trim();
    setFormData({ email: trimmedEmail, password: trimmedPassword });
    // Re-validate with trimmed values
    const trimmedErrors = {};
    if (!trimmedEmail) trimmedErrors.email = 'Please enter your email address';
    else if (!/\S+@\S+\.\S+/.test(trimmedEmail)) trimmedErrors.email = 'Please enter a valid email';

    if (!trimmedPassword) trimmedErrors.password = 'Please enter your password';
    else if (trimmedPassword.length < 6) trimmedErrors.password = 'Password must be at least 6 characters long';
    if (Object.keys(trimmedErrors).length > 0) { setErrors(trimmedErrors); return; }
    setIsSubmitting(true);
    setErrors({});
    try {
      const result = await login(trimmedEmail, trimmedPassword);
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        // Map backend errors to user-friendly messages
        let message = result.error || 'Login failed. Please try again.';
        if (message.includes('User not found') || message.includes('not found')) {
          message = 'No account found with this email. Please check your email or sign up.';
        } else if (message.includes('Invalid password') || message.includes('password')) {
          message = 'Incorrect password. Please try again.';
        } else if (message.includes('inactive') || message.includes('locked')) {
          message = 'Your account has been locked or deactivated. Please contact support.';
        } else if (message.includes('fetch') || message.includes('network') || message.includes('Failed to fetch')) {
          message = 'Cannot connect to server. Please make sure the backend is running on port 8000.';
        }
        setErrors({ general: message });
      }
    } catch (err) {
      setErrors({ general: 'An unexpected error occurred. Please try again.' });
    }
    setIsSubmitting(false);
  };
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Trim leading/trailing spaces as user types (for paste scenarios)
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1
      }
    }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 }
    }
  };
  return (
    <div className="min-h-[100dvh] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden" style={{paddingTop: "max(2rem, env(safe-area-inset-top))", paddingBottom: "max(2rem, env(safe-area-inset-bottom))"}}>
      {/* Premium Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Deep gradient base */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0618] via-[#120d2e] to-[#0a0618]" />
        {/* Animated aurora blobs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-gradient-to-br from-purple-600/25 to-blue-600/15 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-gradient-to-br from-indigo-600/20 to-cyan-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-gradient-to-br from-pink-600/15 to-purple-600/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '4s' }} />
        <div className="absolute bottom-1/3 left-1/4 w-48 h-48 bg-gradient-to-br from-blue-500/15 to-indigo-500/10 rounded-full blur-[60px] animate-pulse" style={{ animationDelay: '1s' }} />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        {/* Radial vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(10,6,24,0.6)_100%)]" />
      </div>
      <motion.div
        className="relative z-10 max-w-md w-full space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header with GlowEffect */}
        <motion.div className="text-center" variants={itemVariants}>
          <GlowEffect className="inline-block" color="rgba(139,92,246,0.08)" size={200}>
            <Link to="/" className="inline-block">
              <motion.img 
                src="/logo.png" 
                alt="SmartPYQ" 
                className="h-16 sm:h-20 md:h-24 w-auto mx-auto object-contain"
                transition={{ type: "spring", stiffness: 300 }}
              />
            </Link>
          </GlowEffect>
          <h2 className="text-2xl font-bold text-white mb-2"><TextScramble text="Welcome Back!" delay={100} /></h2>
          <p className="text-gray-200">Login to access your study materials and continue learning 🎓</p>
        </motion.div>
        {/* Login Form */}
        <motion.div variants={itemVariants}>
        <BorderBeam className="rounded-2xl" colorFrom="rgba(108,78,246,0.3)" colorTo="rgba(147,51,234,0.2)">
        <div
          className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/15 p-5 sm:p-8"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Demo Credentials Info with CursorGlow */}
            <motion.div variants={itemVariants}>
            <CursorGlow className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-sm" glowColor="rgba(99,102,241,0.08)">
              <div className="flex items-start space-x-3">
                <div className="text-blue-300 text-xl">💡</div>
                <div>
                  <h4 className="text-sm font-semibold text-white/80 mb-1">Demo Credentials</h4>
                  <p className="text-xs text-gray-400 mb-2">Use these credentials to test the login:</p>
                  <div className="text-xs text-gray-300 space-y-1">
                    <div><strong>Email:</strong> sumer@edu.in</div>
                    <div><strong>Password:</strong> demo123</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ email: 'sumer@edu.in', password: 'demo123' });
                      setErrors({});
                    }}
                    className="mt-2 text-xs text-blue-300 hover:text-blue-200 underline transition-colors"
                  >
                    Click to fill demo credentials
                  </button>
                </div>
              </div>
            </CursorGlow>
            </motion.div>
            {/* General Error */}
            <AnimatePresence>
              {errors.general && (
                <motion.div
                  className="bg-red-500/30 border-2 border-red-400/50 rounded-xl p-4 flex items-center space-x-3 backdrop-blur-sm"
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  <ExclamationCircleIcon className="h-6 w-6 text-red-300 flex-shrink-0" />
                  <span className="text-red-100 text-sm font-medium">{errors.general}</span>
                </motion.div>
              )}
            </AnimatePresence>
            {/* Email Field */}
            <motion.div variants={itemVariants}>
              <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`block w-full pl-12 pr-4 py-3 bg-[#1a1535]/80 border border-white/10 backdrop-blur-sm rounded-xl shadow-sm placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all hover:border-white/20 ${
                    errors.email ? 'border-red-400/50 bg-red-500/10' : 'border-white/20 hover:border-white/30'
                  }`}
                  placeholder="you@college.edu.in"
                />
              </div>
              <AnimatePresence>
                {errors.email && (
                  <motion.p
                    className="mt-2 text-sm text-red-300 flex items-center space-x-1"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <ExclamationCircleIcon className="h-4 w-4" />
                    <span>{errors.email}</span>
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
            {/* Password Field */}
            <motion.div variants={itemVariants}>
              <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <LockClosedIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`block w-full pl-12 pr-12 py-3 bg-[#1a1535]/80 border border-white/10 backdrop-blur-sm rounded-xl shadow-sm placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-white/20 ${
                    errors.password ? 'border-red-400/50 bg-red-500/10' : 'border-white/20 hover:border-white/30'
                  }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center min-w-[44px] min-h-[44px] justify-center"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-300" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-300" />
                  )}
                </button>
              </div>
              <AnimatePresence>
                {errors.password && (
                  <motion.p
                    className="mt-2 text-sm text-red-300 flex items-center space-x-1"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <ExclamationCircleIcon className="h-4 w-4" />
                    <span>{errors.password}</span>
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
            {/* Remember Me & Forgot Password */}
            <motion.div className="flex items-center justify-between" variants={itemVariants}>
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-white/15 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-300">
                  Remember me
                </label>
              </div>
              <Link to="/forgot-password" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
                Forgot password?
              </Link>
            </motion.div>
            {/* Submit Button */}
            <motion.div variants={itemVariants}>
              <motion.button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary btn-block py-3"
              >
                {isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Logging in...</span>
                  </div>
                ) : (
                  <span className="flex items-center space-x-2">
                    <span>🚀</span>
                    <span>Login</span>
                  </span>
                )}
              </motion.button>
            </motion.div>
            {/* Feature Previews with SpotlightCard */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-4">
              <SpotlightCard className="bg-white/5 border border-white/10 rounded-xl p-4 text-center cursor-pointer" spotlightColor="rgba(99,102,241,0.15)">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                  <BookOpenIcon className="h-5 w-5 text-blue-400" />
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">PYQ Hub</h4>
                <p className="text-xs text-gray-400">Browse question papers by stream & year</p>
              </SpotlightCard>
              <SpotlightCard className="bg-white/5 border border-white/10 rounded-xl p-4 text-center cursor-pointer" spotlightColor="rgba(168,85,247,0.15)">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-2">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-purple-400" />
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">AI Assistant</h4>
                <p className="text-xs text-gray-400">Get instant study help & recommendations</p>
              </SpotlightCard>
            </div>
          </form>
        </div>
        </BorderBeam>
        </motion.div>

        {/* Create Account Link */}
        <motion.div className="text-center" variants={itemVariants}>
          <p className="text-gray-400 text-sm">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Sign up here
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};
export default LoginPage;