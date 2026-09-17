import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

// Demo credentials shown ONLY in development. The production build never
// ships them (import.meta.env.PROD is inlined at build time).
const SHOW_DEMO_CREDS = import.meta.env.DEV;
const DEMO_ADMIN_ID = 'admin';
const DEMO_ADMIN_PASSWORD = 'smartpyq@admin';

/**
 * Separate admin authentication page — /admin/login.
 *
 * POSTs to /api/v1/auth/admin-login which REFUSES to issue a token to any
 * non-admin role (403), so a student password can never unlock this area.
 * Demo credentials are intentionally not honored here.
 */
const AdminLoginPage = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { adminLogin, isAuthenticated, isLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/admin';

  useEffect(() => {
    // Already signed in as an admin? Straight to the dashboard.
    if (!isLoading && isAuthenticated && isAdmin) {
      navigate(from, { replace: true });
    }
  }, [isLoading, isAuthenticated, isAdmin, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.email.trim() || !formData.password) {
      setError('Please enter both email and password.');
      return;
    }
    setIsSubmitting(true);
    const result = await adminLogin(formData.email.trim(), formData.password);
    setIsSubmitting(false);

    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.error || 'Admin login failed.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Accent bar */}
          <div className="h-1.5 bg-linear-to-r from-emerald-500 via-teal-500 to-cyan-500" />

          <div className="p-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <ShieldCheckIcon className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white leading-tight">Admin Access</h1>
                <p className="text-sm text-gray-400">SmartPYQ content management</p>
              </div>
            </div>

            <p className="text-sm text-gray-400 mb-6">
              Restricted area. Only accounts with an administrator role can sign in here.
            </p>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                role="alert"
              >
                <ExclamationCircleIcon className="h-5 w-5 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="admin-email" className="block text-sm font-medium text-gray-300 mb-1.5">
                  Admin email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-gray-500 outline-hidden focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="admin@smartpyq.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-sm font-medium text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 pr-11 text-white placeholder-gray-500 outline-hidden focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-linear-to-r from-emerald-500 to-teal-600 px-4 py-2.5 font-semibold text-white shadow-lg transition hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Verifying…' : 'Sign in to Admin'}
              </button>
            </form>

            {/* Dev-only demo credentials (never present in production bundles) */}
            {SHOW_DEMO_CREDS && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
              >
                <p className="text-xs font-semibold text-emerald-300 mb-1.5 tracking-wide">DEMO ADMIN LOGIN</p>
                <div className="text-xs text-gray-300 space-y-0.5 font-mono">
                  <p>Admin ID: <span className="text-emerald-300">{DEMO_ADMIN_ID}</span></p>
                  <p>Password: <span className="text-emerald-300">{DEMO_ADMIN_PASSWORD}</span></p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ email: DEMO_ADMIN_ID, password: DEMO_ADMIN_PASSWORD })}
                  className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 underline"
                >
                  Fill demo credentials
                </button>
              </motion.div>
            )}

            <div className="mt-6 text-center">
              <Link to="/" className="text-sm text-gray-400 hover:text-gray-200">
                ← Back to SmartPYQ
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminLoginPage;
