import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  EyeIcon, EyeSlashIcon, EnvelopeIcon, LockClosedIcon, UserIcon,
  ExclamationCircleIcon, CheckCircleIcon, AcademicCapIcon, BookOpenIcon,
  CalendarIcon, KeyIcon, ArrowLeftIcon, ArrowRightIcon
} from '@heroicons/react/24/outline';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

const STREAMS = [
  { id: 'bsc', name: 'B.Sc', icon: '🎓', unlocked: true },
  { id: 'bcom', name: 'B.Com', icon: '💼', unlocked: true },
  { id: 'bca', name: 'BCA', icon: '💻', unlocked: true },
  { id: 'bba', name: 'BBA', icon: '📊', unlocked: true },
];

const SPECIALIZATIONS = {
  bsc: [
    { id: 'mscs', name: 'MSCS', fullName: 'Mathematics, Statistics & Computer Science', unlocked: true },
    { id: 'msds', name: 'MSDS', fullName: 'Mathematics, Statistics & Data Science', unlocked: true },
    { id: 'mpc', name: 'MPC', fullName: 'Mathematics, Physics & Chemistry', unlocked: true },
    { id: 'bipc', name: 'BiPC', fullName: 'Botany, Zoology & Chemistry', unlocked: true },
  ],
  bcom: [
    { id: 'general', name: 'General', fullName: 'General', unlocked: true },
    { id: 'compapps', name: 'Comp Apps', fullName: 'Computer Applications', unlocked: true },
    { id: 'honours', name: 'Honours', fullName: 'B.Com Honours', unlocked: true },
    { id: 'busanalytics', name: 'Business Analytics', fullName: 'Business Analytics', unlocked: true },
  ],
  bca: [{ id: 'general', name: 'General', fullName: 'General', unlocked: true },
    { id: 'datasci', name: 'Data Science', fullName: 'Data Science & Analytics', unlocked: true },
    { id: 'cloud', name: 'Cloud Computing', fullName: 'Cloud Computing & DevOps', unlocked: true },
    { id: 'cyber', name: 'Cyber Security', fullName: 'Cyber Security & Forensics', unlocked: true },
  ],
  bba: [{ id: 'general', name: 'General', fullName: 'General', unlocked: true },
    { id: 'finance', name: 'Finance', fullName: 'Finance & Banking', unlocked: true },
    { id: 'hrm', name: 'HRM', fullName: 'Human Resource Management', unlocked: true },
    { id: 'marketing', name: 'Marketing', fullName: 'Marketing Management', unlocked: true },
  ],
};

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const SEMS = [
  { id: 'sem1', name: 'Sem 1' }, { id: 'sem2', name: 'Sem 2' },
  { id: 'sem3', name: 'Sem 3' }, { id: 'sem4', name: 'Sem 4' },
  { id: 'sem5', name: 'Sem 5' }, { id: 'sem6', name: 'Sem 6' },
];

// Correct step order: email → year → stream → spec → semester+password → OTP
const STEPS = ['email', 'year', 'stream', 'spec', 'semester', 'otp'];

const RegisterPage = () => {
  const [step, setStep] = useState(0);
  const [fd, setFd] = useState({
    email: '', academic_year: '', stream: '', specialization: '',
    semester: '', otp: '', name: '', password: '', confirmPassword: '',
    tenant_access_code: 'SMARTPYQ2024',
  });
  const [errs, setErrs] = useState({});
  const [genErr, setGenErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [cd, setCd] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const { isAuthenticated } = useAuth();
  const nav = useNavigate();

  useEffect(() => { if (isAuthenticated) nav('/dashboard', { replace: true }); }, [isAuthenticated, nav]);
  useEffect(() => { if (cd > 0) { const t = setTimeout(() => setCd(p => p - 1), 1000); return () => clearTimeout(t); } }, [cd]);

  const set = (k, v) => { setFd(p => ({ ...p, [k]: v })); if (errs[k]) setErrs(p => ({ ...p, [k]: '' })); };
  const progress = ((step + 1) / STEPS.length) * 100;
  const ci = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.4, staggerChildren: 0.08 } } };
  const iv = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

  const validate = useCallback(() => {
    const e = {};
    const s = STEPS[step];
    if (s === 'email') {
      if (!fd.email.trim()) e.email = 'Email is required';
      else if (!/\S+@\S+\.\S+/.test(fd.email)) e.email = 'Enter a valid email';
    } else if (s === 'year') {
      if (!fd.academic_year) e.academic_year = 'Select your year';
    } else if (s === 'stream') {
      if (!fd.stream) e.stream = 'Select a course';
    } else if (s === 'spec') {
      if (!fd.specialization) e.specialization = 'Select a specialization';
    } else if (s === 'semester') {
      if (!fd.semester) e.semester = 'Select your semester';
      if (!fd.name.trim()) e.name = 'Name is required';
      if (!fd.password) e.password = 'Password is required';
      else if (fd.password.length < 8) e.password = 'Min 8 characters';
      if (fd.password !== fd.confirmPassword) e.confirmPassword = 'Passwords do not match';
    } else if (s === 'otp') {
      if (!fd.otp) e.otp = 'Enter the OTP';
      else if (fd.otp.length !== 6) e.otp = 'OTP must be 6 digits';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  }, [step, fd]);

  const next = async () => {
    setGenErr('');
    if (!validate()) return;
    const s = STEPS[step];

    // Email step: just validate, send OTP when moving to OTP step
    if (s === 'email') {
      setStep(p => p + 1);
      return;
    }

    // After all academic info collected, send OTP before showing OTP step
    if (s === 'semester') {
      setBusy(true);
      try {
        const r = await fetch(`${BACKEND_URL}/api/v1/auth/send-otp-simple`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fd.email, purpose: 'email_verification' }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || 'Failed to send OTP');
        }
        const d = await r.json().catch(() => ({}));
        // Backend returns the OTP inline only when email isn't configured
        // (dev fallback) so signup works before real SMTP is set up.
        setDevOtp(d.dev_otp || '');
        setOtpSent(true);
        setCd(60);
        setStep(p => p + 1);
      } catch (err) {
        setGenErr(err.message || 'Failed to send OTP. Check server console.');
      }
      setBusy(false);
      return;
    }

    // OTP step: call register-complete to create account
    if (s === 'otp') {
      setBusy(true);
      try {
        const r = await fetch(`${BACKEND_URL}/api/v1/auth/register-complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: fd.email,
            password: fd.password,
            name: fd.name,
            stream: fd.stream,
            specialization: fd.specialization,
            academic_year: fd.academic_year,
            semester: fd.semester,
            otp_code: fd.otp,
            tenant_access_code: fd.tenant_access_code,
          }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || 'Registration failed');
        }
        const data = await r.json();
        // Store tokens and user data
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('authToken', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        const userData = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role,
          tenant_id: data.user.tenant_id,
          course: data.user.course,
          specialization: data.user.specialization,
          academic_year: data.user.academic_year,
          semester: data.user.semester,
          onboarding_completed: data.user.onboarding_completed,
          stats: { papersDownloaded: 0, studyStreak: 0 }
        };
        localStorage.setItem('userData', JSON.stringify(userData));
        localStorage.setItem('user', JSON.stringify(userData));
        setCompleted(true);
      } catch (err) {
        setGenErr(err.message || 'Registration failed');
      }
      setBusy(false);
      return;
    }

    setStep(p => p + 1);
  };

  const back = () => { setGenErr(''); setErrs({}); setStep(p => Math.max(0, p - 1)); };

  // Success screen
  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <motion.div className="max-w-md w-full text-center space-y-8" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircleIcon className="h-12 w-12 text-green-400" />
          </div>
          <h2 className="text-3xl font-bold text-white">Account Created!</h2>
          <p className="text-gray-400">Welcome to SmartPYQ. Your academic profile has been set up.</p>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/15 p-6">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="text-white">{fd.email}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Course</span><span className="text-white">{STREAMS.find(s => s.id === fd.stream)?.name || fd.stream}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Specialization</span><span className="text-white">{SPECIALIZATIONS[fd.stream]?.find(s => s.id === fd.specialization)?.fullName || fd.specialization}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Year</span><span className="text-white">{fd.academic_year}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Semester</span><span className="text-white">{SEMS.find(s => s.id === fd.semester)?.name}</span></div>
            </div>
          </div>
          <button onClick={() => nav('/login', { replace: true })} className="w-full py-3 px-4 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-semibold transition-all hover:from-brand-600 hover:to-brand-700">
            Go to Login
          </button>
        </motion.div>
      </div>
    );
  }

  // OTP step component
  const OtpStep = () => (
    <div className="space-y-5 text-center">
      <div className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto">
        <KeyIcon className="h-8 w-8 text-brand-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white">Check your email</h3>
        <p className="text-sm text-gray-400 mt-1">We sent a 6-digit code to <span className="text-white">{fd.email}</span></p>
        {devOtp ? (
          <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
            <p className="text-xs text-yellow-400/80">Email sending isn't configured yet — use this dev code:</p>
            <p className="text-2xl font-mono font-bold text-yellow-300 tracking-[0.3em] mt-1">{devOtp}</p>
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Can't find it? Check your spam folder.</p>
        )}
      </div>
      <input
        type="text" inputMode="numeric" maxLength={6} value={fd.otp}
        onChange={e => set('otp', e.target.value.replace(/\D/g, ''))}
        className="block w-full py-3 bg-white/10 border border-white/20 rounded-xl text-white text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all"
        placeholder="000000"
        autoFocus
      />
      {errs.otp && <p className="text-sm text-red-300">{errs.otp}</p>}
      <button type="button" onClick={async () => {
        if (cd > 0) return;
        try {
          const rr = await fetch(`${BACKEND_URL}/api/v1/auth/send-otp-simple`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fd.email, purpose: 'email_verification' }),
          });
          const rd = await rr.json().catch(() => ({}));
          setDevOtp(rd.dev_otp || '');
          setCd(60);
        } catch (err) {
          console.error('Resend failed:', err);
        }
      }} disabled={cd > 0} className="text-sm text-brand-400 hover:text-brand-300 disabled:text-gray-600 disabled:cursor-not-allowed">
        {cd > 0 ? `Resend code in ${cd}s` : 'Resend code'}
      </button>
    </div>
  );

  // Stream step
  const StreamStep = () => (
    <div className="space-y-5">
      <label className="block text-sm font-medium text-white/80 mb-3">What is your stream/course?</label>
      <div className="grid grid-cols-2 gap-3">
        {STREAMS.map(st => (
          <button key={st.id} type="button" onClick={() => st.unlocked && set('stream', st.id)} disabled={!st.unlocked}
            className={`p-5 rounded-xl border text-center transition-all relative ${
              fd.stream === st.id ? 'bg-brand-500/20 border-brand-400 text-white'
              : st.unlocked ? 'bg-white/5 border-white/15 text-gray-300 hover:bg-white/10 hover:border-white/30 cursor-pointer'
              : 'bg-white/5 border-white/10 text-gray-600 cursor-not-allowed opacity-50'
            }`}>
            <span className="text-3xl mb-2 block">{st.icon}</span>
            <span className="font-semibold">{st.name}</span>
            {!st.unlocked && (
              <div className="absolute top-2 right-2 text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">🔒 Coming Soon</div>
            )}
          </button>
        ))}
      </div>
      {errs.stream && <p className="text-sm text-red-300">{errs.stream}</p>}
    </div>
  );

  // Specialization step
  const SpecStep = () => {
    const specs = SPECIALIZATIONS[fd.stream] || [];
    return (
      <div className="space-y-5">
        <label className="block text-sm font-medium text-white/80 mb-3">Choose your specialization</label>
        <div className="grid grid-cols-1 gap-3">
          {specs.map(s => (
            <button key={s.id} type="button" onClick={() => s.unlocked && set('specialization', s.id)} disabled={!s.unlocked}
              className={`p-5 rounded-xl border text-left transition-all relative flex items-center gap-4 ${
                fd.specialization === s.id ? 'bg-brand-500/20 border-brand-400 text-white'
                : s.unlocked ? 'bg-white/5 border-white/15 text-gray-300 hover:bg-white/10 hover:border-white/30 cursor-pointer'
                : 'bg-white/5 border-white/10 text-gray-600 cursor-not-allowed opacity-50'
              }`}>
              <AcademicCapIcon className="h-8 w-8 flex-shrink-0" />
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-sm text-gray-400">{s.fullName}</div>
              </div>
              {!s.unlocked && <div className="ml-auto text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">🔒</div>}
            </button>
          ))}
        </div>
        {errs.specialization && <p className="text-sm text-red-300">{errs.specialization}</p>}
      </div>
    );
  };

  // Semester + password step
  const SemesterStep = () => (
    <div className="space-y-5">
      <label className="block text-sm font-medium text-white/80 mb-3">Select your current semester</label>
      <div className="grid grid-cols-3 gap-3">
        {SEMS.map(sm => (
          <button key={sm.id} type="button" onClick={() => set('semester', sm.id)}
            className={`p-4 rounded-xl border text-center transition-all ${
              fd.semester === sm.id ? 'bg-brand-500/20 border-brand-400 text-white'
              : 'bg-white/5 border-white/15 text-gray-300 hover:bg-white/10 hover:border-white/30'
            }`}>
            <BookOpenIcon className="h-5 w-5 mx-auto mb-1" />
            <span className="font-medium text-sm">{sm.name}</span>
          </button>
        ))}
      </div>
      {errs.semester && <p className="text-sm text-red-300">{errs.semester}</p>}

      <hr className="border-white/10 my-4" />

      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">Your Name</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <UserIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input type="text" value={fd.name} onChange={e => set('name', e.target.value)}
            className={`block w-full pl-12 pr-4 py-3 bg-white/10 border backdrop-blur-sm rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errs.name ? 'border-red-400/50' : 'border-white/20'}`}
            placeholder="Enter your full name" />
        </div>
        {errs.name && <p className="mt-1 text-sm text-red-300">{errs.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">Create Password</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <LockClosedIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input type={showPw ? 'text' : 'password'} value={fd.password}
            onChange={e => set('password', e.target.value)}
            className={`block w-full pl-12 pr-12 py-3 bg-white/10 border backdrop-blur-sm rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errs.password ? 'border-red-400/50' : 'border-white/20'}`}
            placeholder="Min. 8 characters" />
          <button type="button" className="absolute inset-y-0 right-0 pr-4 flex items-center" onClick={() => setShowPw(!showPw)}>
            {showPw ? <EyeSlashIcon className="h-5 w-5 text-gray-400" /> : <EyeIcon className="h-5 w-5 text-gray-400" />}
          </button>
        </div>
        {errs.password && <p className="mt-1 text-sm text-red-300">{errs.password}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">Confirm Password</label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <LockClosedIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input type={showPw ? 'text' : 'password'} value={fd.confirmPassword}
            onChange={e => set('confirmPassword', e.target.value)}
            className={`block w-full pl-12 pr-4 py-3 bg-white/10 border backdrop-blur-sm rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errs.confirmPassword ? 'border-red-400/50' : 'border-white/20'}`}
            placeholder="Repeat your password" />
        </div>
        {errs.confirmPassword && <p className="mt-1 text-sm text-red-300">{errs.confirmPassword}</p>}
      </div>
    </div>
  );

  const renderStep = () => {
    switch (STEPS[step]) {
      case 'email': return (
        <div className="space-y-5">
          <label className="block text-sm font-medium text-white/80 mb-2">Email Address</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <EnvelopeIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input type="email" value={fd.email} onChange={e => set('email', e.target.value)}
              className={`block w-full pl-12 pr-4 py-3 bg-white/10 border backdrop-blur-sm rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-all ${errs.email ? 'border-red-400/50' : 'border-white/20 hover:border-white/30'}`}
              placeholder="you@example.com" autoComplete="email" />
          </div>
          {errs.email && <p className="mt-1 text-sm text-red-300 flex items-center space-x-1"><ExclamationCircleIcon className="h-4 w-4" /><span>{errs.email}</span></p>}
          <p className="text-xs text-gray-500">We'll send a verification code to confirm your email.</p>
        </div>
      );
      case 'year': return (
        <div className="space-y-5">
          <label className="block text-sm font-medium text-white/80 mb-3">What year are you currently studying in?</label>
          <div className="grid grid-cols-2 gap-3">
            {YEARS.map(y => (
              <button key={y} type="button" onClick={() => set('academic_year', y)}
                className={`p-4 rounded-xl border text-center transition-all ${
                  fd.academic_year === y ? 'bg-brand-500/20 border-brand-400 text-white'
                  : 'bg-white/5 border-white/15 text-gray-300 hover:bg-white/10 hover:border-white/30'
                }`}>
                <CalendarIcon className="h-6 w-6 mx-auto mb-2" />
                <span className="font-medium">{y}</span>
              </button>
            ))}
          </div>
          {errs.academic_year && <p className="text-sm text-red-300">{errs.academic_year}</p>}
        </div>
      );
      // Render step components as plain function calls: they are re-created on
      // every render, so rendering them as <XStep /> would remount the inputs on
      // each keystroke and drop focus (the "must tap repeatedly to type" bug).
      case 'stream': return StreamStep();
      case 'spec': return SpecStep();
      case 'semester': return SemesterStep();
      case 'otp': return OtpStep();
      default: return null;
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden" style={{paddingTop: "max(2rem, env(safe-area-inset-top))", paddingBottom: "max(2rem, env(safe-area-inset-bottom))"}}>
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-64 h-64 bg-gradient-to-r from-green-600/20 to-blue-600/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-48 h-48 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <motion.div className="relative z-10 max-w-lg w-full space-y-6" variants={ci} initial="hidden" animate="visible">
        <motion.div className="text-center" variants={iv}>
          <Link to="/" className="inline-block mb-4"><img src="/logo.png" alt="SmartPYQ" className="h-16 w-auto mx-auto" /></Link>
          <h2 className="text-2xl font-bold text-white mb-1">Create Your Account</h2>
          <p className="text-gray-400 text-sm">Set up your academic profile in a few steps</p>
        </motion.div>

        <motion.div variants={iv}>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>Step {step + 1} of {STEPS.length}</span><span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-brand-500 to-cyan-500 rounded-full"
              initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
          </div>
        </motion.div>

        <motion.div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/15 p-5 sm:p-8" variants={iv}>
          {genErr && (
            <motion.div className="bg-red-500/20 border border-red-400/30 rounded-xl p-3 mb-5 flex items-center space-x-2"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <ExclamationCircleIcon className="h-5 w-5 text-red-300 flex-shrink-0" />
              <span className="text-red-200 text-sm">{genErr}</span>
            </motion.div>
          )}
          {/* Step content. No exit animation: AnimatePresence mode="wait" would
              intermittently stall the async semester→OTP transition and leave the
              OTP step unmounted, so only the entering step animates. */}
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
            {renderStep()}
          </motion.div>
        </motion.div>

        <motion.div className="flex gap-3" variants={iv}>
          {step > 0 && (
            <button onClick={back} className="flex-1 py-3 px-4 bg-white/10 border border-white/15 rounded-xl text-white hover:bg-white/15 transition-all flex items-center justify-center gap-2">
              <ArrowLeftIcon className="h-4 w-4" /> Back
            </button>
          )}
          <button onClick={next} disabled={busy}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                <span>Processing...</span>
              </div>
            ) : (
              <>{step === 0 ? 'Get Started' : step === STEPS.length - 1 ? 'Verify & Create Account' : 'Continue'} <ArrowRightIcon className="h-4 w-4" /></>
            )}
          </button>
        </motion.div>

        <motion.div className="text-center" variants={iv}>
          <p className="text-gray-400 text-sm">Already have an account? <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Login here</Link></p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
