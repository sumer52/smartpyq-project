import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  EnvelopeIcon,
  LockClosedIcon,
  KeyIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { BACKEND_URL } from '../lib/backendUrl';
const ForgotPasswordPage = () => {
  const [step, setStep] = useState('email'); // 'email' | 'otp' | 'reset' | 'success'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState('');

  const { logout } = useAuth();

  const validateEmail = () => {
    if (!email) return 'Please enter your email address';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Please enter a valid email';
    return '';
  };

  const validateOtp = () => {
    if (!otp) return 'Please enter the OTP code';
    if (otp.length !== 6) return 'OTP must be 6 digits';
    if (!/^\d{6}$/.test(otp)) return 'OTP must contain only numbers';
    return '';
  };

  const validatePassword = () => {
    if (!newPassword) return 'Please enter a new password';
    if (newPassword.length < 8) return 'Password must be at least 8 characters';
    if (newPassword !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setGeneralError('');
    const emailError = validateEmail();
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'password_reset' }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to send OTP. Please try again.');
      }

      setStep('otp');
    } catch (err) {
      setGeneralError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setGeneralError('');
    const otpError = validateOtp();
    if (otpError) {
      setErrors({ otp: otpError });
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: otp, purpose: 'password_reset' }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Invalid OTP. Please try again.');
      }

      setStep('reset');
    } catch (err) {
      setGeneralError(err.message || 'OTP verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setGeneralError('');
    const passwordError = validatePassword();
    if (passwordError) {
      setErrors({ password: passwordError });
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp_code: otp,
          new_password: newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Password reset failed. Please try again.');
      }

      setStep('success');
    } catch (err) {
      setGeneralError(err.message || 'Password reset failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.6, staggerChildren: 0.1 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 bg-gradient-to-r from-blue-600/40 to-indigo-600/40 rounded-full blur-xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-48 h-48 bg-gradient-to-r from-purple-600/40 to-indigo-600/40 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <motion.div
        className="relative z-10 max-w-md w-full space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div className="text-center" variants={itemVariants}>
          <Link to="/login" className="inline-block mb-4">
            <motion.img
              src="/logo.png"
              alt="SmartPYQ"
              className="h-16 sm:h-20 w-auto mx-auto object-contain"
            />
          </Link>
          <h2 className="text-2xl font-bold text-white mb-2">
            {step === 'email' && 'Reset Your Password'}
            {step === 'otp' && 'Verify Your Identity'}
            {step === 'reset' && 'Create New Password'}
            {step === 'success' && 'Password Reset Complete'}
          </h2>
          <p className="text-gray-200">
            {step === 'email' && "Enter your email and we'll send you a verification code."}
            {step === 'otp' && `We sent a 6-digit code to ${email}`}
            {step === 'reset' && 'Choose a strong password for your account.'}
            {step === 'success' && 'Your password has been updated successfully.'}
          </p>
        </motion.div>

        {/* Step Indicator */}
        {step !== 'success' && (
          <motion.div className="flex items-center justify-center space-x-2" variants={itemVariants}>
            {['email', 'otp', 'reset'].map((s, i) => (
              <React.Fragment key={s}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    step === s
                      ? 'bg-brand-500 text-white'
                      : ['email', 'otp', 'reset'].indexOf(step) > i
                      ? 'bg-green-500 text-white'
                      : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {['email', 'otp', 'reset'].indexOf(step) > i ? '✓' : i + 1}
                </div>
                {i < 2 && (
                  <div className={`w-12 h-0.5 ${['email', 'otp', 'reset'].indexOf(step) > i ? 'bg-green-500' : 'bg-white/10'}`} />
                )}
              </React.Fragment>
            ))}
          </motion.div>
        )}

        {/* Form Card */}
        <motion.div
          className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/15 p-8"
          variants={itemVariants}
        >
          {/* General Error */}
          <AnimatePresence>
            {generalError && (
              <motion.div
                className="bg-red-500/20 border border-red-400/30 rounded-xl p-4 flex items-center space-x-3 mb-6"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <ExclamationCircleIcon className="h-5 w-5 text-red-300 flex-shrink-0" />
                <span className="text-red-200 text-sm">{generalError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step 1: Email */}
          {step === 'email' && (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({}); }}
                    className={`block w-full pl-12 pr-4 py-3 bg-white/10 border backdrop-blur-sm rounded-xl shadow-sm placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all ${
                      errors.email ? 'border-red-400/50' : 'border-white/20 hover:border-white/30'
                    }`}
                    placeholder="Enter your registered email"
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="mt-2 text-sm text-red-300 flex items-center space-x-1">
                    <ExclamationCircleIcon className="h-4 w-4" />
                    <span>{errors.email}</span>
                  </p>
                )}
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-block py-3">
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    <span>Sending code...</span>
                  </div>
                ) : (
                  'Send Verification Code'
                )}
              </button>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-white/80 mb-2">
                  Verification Code
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <KeyIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); if (errors.otp) setErrors({}); }}
                    className={`block w-full pl-12 pr-4 py-3 bg-white/10 border backdrop-blur-sm rounded-xl shadow-sm placeholder-gray-400 text-white text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all ${
                      errors.otp ? 'border-red-400/50' : 'border-white/20 hover:border-white/30'
                    }`}
                    placeholder="000000"
                    autoComplete="one-time-code"
                  />
                </div>
                {errors.otp && (
                  <p className="mt-2 text-sm text-red-300 flex items-center space-x-1">
                    <ExclamationCircleIcon className="h-4 w-4" />
                    <span>{errors.otp}</span>
                  </p>
                )}
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-block py-3">
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    <span>Verifying...</span>
                  </div>
                ) : (
                  'Verify Code'
                )}
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setErrors({}); setGeneralError(''); }}
                className="btn btn-ghost btn-block"
              >
                Change email address
              </button>
            </form>
          )}

          {/* Step 3: New Password */}
          {step === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-white/80 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); if (errors.password) setErrors({}); }}
                    className={`block w-full pl-12 pr-4 py-3 bg-white/10 border backdrop-blur-sm rounded-xl shadow-sm placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all ${
                      errors.password ? 'border-red-400/50' : 'border-white/20 hover:border-white/30'
                    }`}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/80 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); if (errors.password) setErrors({}); }}
                    className={`block w-full pl-12 pr-4 py-3 bg-white/10 border backdrop-blur-sm rounded-xl shadow-sm placeholder-gray-400 text-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all ${
                      errors.password ? 'border-red-400/50' : 'border-white/20 hover:border-white/30'
                    }`}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                  />
                </div>
                {errors.password && (
                  <p className="mt-2 text-sm text-red-300 flex items-center space-x-1">
                    <ExclamationCircleIcon className="h-4 w-4" />
                    <span>{errors.password}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center">
                <input
                  id="show-password"
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-white/15 rounded"
                />
                <label htmlFor="show-password" className="ml-2 block text-sm text-gray-300">
                  Show passwords
                </label>
              </div>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-block py-3">
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    <span>Updating...</span>
                  </div>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircleIcon className="h-10 w-10 text-green-400" />
              </div>
              <p className="text-gray-300">
                Your password has been successfully reset. You can now log in with your new password.
              </p>
              <Link to="/login" className="btn btn-primary btn-block py-3 font-semibold">
                Go to Login
              </Link>
            </div>
          )}
        </motion.div>

        {/* Back to Login */}
        {step !== 'success' && (
          <motion.div className="text-center" variants={itemVariants}>
            <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors inline-flex items-center">
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back to Login
            </Link>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default ForgotPasswordPage;
