import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  UserCircleIcon,
  CameraIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  BellIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  MoonIcon,
  SunIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
const ProfilePage = () => {
  const { user, updateUser, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    course: user?.course || '',
    specialization: user?.specialization || '',
    academic_year: user?.academic_year || '',
    year: user?.year || '',
    semester: user?.semester || ''
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [settings, setSettings] = useState({
    notifications: true,
    emailUpdates: true,
    darkMode: false,
    publicProfile: false
  });
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const courses = [
    'B.Sc Computer Science',
    'B.Sc Data Science',
    'B.Sc Life Sciences',
    'B.Com General',
    'B.Com Computers',
    'B.Com Honours',
    'B.Com Business Analytics',
    'BBA General',
    'BBA Business Analytics',
    'BCA'
  ];
  const years = ['1st Year', '2nd Year', '3rd Year'];
  const semesters = ['Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6'];
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!editForm.name.trim()) {
      newErrors.name = 'Please enter your name';
    }
    if (!editForm.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(editForm.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Save academic info to backend
    try {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      await fetch(`${BACKEND_URL}/api/v1/auth/profile/academic`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          specialization: editForm.specialization,
          academic_year: editForm.academic_year,
          semester: editForm.semester
        })
      });
    } catch (e) {
      console.error('Failed to save academic profile:', e);
    }
    
    updateUser(editForm);
    setIsEditing(false);
    setSuccessMessage('Your profile has been updated successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };
  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!passwordForm.currentPassword) {
      newErrors.currentPassword = 'Please enter your current password';
    }
    if (!passwordForm.newPassword) {
      newErrors.newPassword = 'Please enter a new password';
    } else if (passwordForm.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters long';
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    // Simulate password change
    setShowPasswordChange(false);
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setSuccessMessage('Your password has been changed successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError('');

    if (!deletePassword) {
      setDeleteError('Please enter your password');
      return;
    }
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }

    setDeleteLoading(true);
    try {
      const result = await deleteAccount(deletePassword);
      if (result.success) {
        navigate('/login', { replace: true });
      } else {
        setDeleteError(result.error || 'Deletion failed. Please try again.');
      }
    } catch {
      setDeleteError('An unexpected error occurred.');
    } finally {
      setDeleteLoading(false);
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
    <div className="min-h-screen  py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">
              <span className="bg-gradient-to-r from-indigo-400 to-blue-400 bg-clip-text text-transparent">
                👤 Profile Settings
              </span>
            </h1>
            <p className="text-xl text-gray-400">Manage your personal information and account settings</p>
          </motion.div>
          {/* Success Message */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center space-x-3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                <span className="text-green-700">{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Profile Card */}
            <motion.div variants={itemVariants} className="lg:col-span-1">
              <div className="bg-white/5 rounded-2xl shadow-xl border border-white/10 p-8">
                <div className="text-center">
                  {/* Avatar */}
                  <div className="relative inline-block mb-6">
                    {user?.avatar ? (
                      <img
                        className="w-32 h-32 rounded-full object-cover border-4 border-indigo-200"
                        src={user.avatar}
                        alt={user?.name}
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-full border-4 border-indigo-200 bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <motion.button
                      className="absolute bottom-2 right-2 btn btn-icon btn-sm btn-primary"
                    >
                      <CameraIcon className="h-4 w-4" />
                    </motion.button>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">{user?.name}</h2>
                  <p className="text-gray-400 mb-1">{user?.course}</p>
                  <p className="text-gray-500 text-sm">{user?.academic_year || user?.year} • {user?.specialization?.toUpperCase() || user?.semester}</p>
                  {/* Stats */}
                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <div className=" rounded-xl p-4">
                      <div className="text-2xl font-bold text-indigo-600">{user?.stats?.papersDownloaded || 0}</div>
                      <div className="text-sm text-gray-400">Papers Viewed</div>
                    </div>
                    <div className=" rounded-xl p-4">
                      <div className="text-2xl font-bold text-brand-500">{user?.stats?.studyStreak || 0}</div>
                      <div className="text-sm text-gray-400">Day Streak</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
            {/* Main Content */}
            <motion.div variants={itemVariants} className="lg:col-span-2 space-y-8">
              {/* Personal Information */}
              <div className="bg-white/5 rounded-2xl shadow-xl border border-white/10 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold text-white flex items-center">
                    <UserCircleIcon className="h-6 w-6 mr-3 text-indigo-600" />
                    Personal Information
                  </h3>
                  {!isEditing ? (
                    <motion.button
                      onClick={() => setIsEditing(true)}
                      className="btn btn-primary px-4 py-2"
                    >
                      <PencilIcon className="h-4 w-4" />
                      <span>Edit</span>
                    </motion.button>
                  ) : (
                    <div className="flex space-x-2">
                      <motion.button
                        onClick={handleEditSubmit}
                        className="btn btn-primary px-4 py-2"
                      >
                        <CheckIcon className="h-4 w-4" />
                        <span>Save</span>
                      </motion.button>
                      <motion.button
                        onClick={() => {
                          setIsEditing(false);
                          setEditForm({
                            name: user?.name || '',
                            email: user?.email || '',
                            course: user?.course || '',
    specialization: user?.specialization || '',
    academic_year: user?.academic_year || '',
                            year: user?.year || '',
                            semester: user?.semester || ''
                          });
                          setErrors({});
                        }}
                        className="btn btn-secondary px-4 py-2"
                      >
                        <XMarkIcon className="h-4 w-4" />
                        <span>Cancel</span>
                      </motion.button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <form onSubmit={handleEditSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                            errors.name ? 'border-red-300 bg-red-50' : 'border-white/15'
                          }`}
                        />
                        {errors.name && (
                          <p className="mt-1 text-sm text-red-600 flex items-center">
                            <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                            {errors.name}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                            errors.email ? 'border-red-300 bg-red-50' : 'border-white/15'
                          }`}
                        />
                        {errors.email && (
                          <p className="mt-1 text-sm text-red-600 flex items-center">
                            <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                            {errors.email}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Course</label>
                        <select
                          value={editForm.course}
                          onChange={(e) => setEditForm({ ...editForm, course: e.target.value })}
                          className="w-full px-4 py-3 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        >
                          {courses.map((course) => (
                            <option key={course} value={course}>{course}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Year</label>
                        <select
                          value={editForm.year}
                          onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                          className="w-full px-4 py-3 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        >
                          {years.map((year) => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Semester</label>
                        <select
                          value={editForm.semester}
                          onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}
                          className="w-full px-4 py-3 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        >
                          {semesters.map((semester) => (
                            <option key={semester} value={semester}>{semester}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Full Name</label>
                      <p className="text-lg text-white">{user?.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
                      <p className="text-lg text-white">{user?.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Course</label>
                      <p className="text-lg text-white">{user?.course}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Academic Year</label>
                      <p className="text-lg text-white">{user?.year} • {user?.semester}</p>
                    </div>
                  </div>
                )}
              </div>
              {/* Security Settings */}
              <div className="bg-white/5 rounded-2xl shadow-xl border border-white/10 p-8">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <ShieldCheckIcon className="h-6 w-6 mr-3 text-indigo-600" />
                  Security Settings
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                    <div>
                      <h4 className="font-medium text-white">Password</h4>
                      <p className="text-sm text-gray-400">Keep your account secure with a strong password</p>
                    </div>
                    <motion.button
                      onClick={() => setShowPasswordChange(true)}
                      className="btn btn-primary px-4 py-2"
                    >
                      Update Password
                    </motion.button>
                  </div>
                </div>
              </div>
              {/* App Settings */}
              <div className="bg-white/5 rounded-2xl shadow-xl border border-white/10 p-8">
                <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <BellIcon className="h-6 w-6 mr-3 text-indigo-600" />
                  App Settings
                </h3>
                <div className="space-y-6">
                  {[
                    {
                      key: 'notifications',
                      title: 'Notifications',
                      description: 'Get notified when new papers are added to your subjects',
                      icon: BellIcon
                    },
                    {
                      key: 'emailUpdates',
                      title: 'Email Notifications',
                      description: 'Receive a weekly summary of new papers relevant to you',
                      icon: GlobeAltIcon
                    },
                    {
                      key: 'darkMode',
                      title: 'Dark Mode',
                      description: 'Enable dark theme for comfortable studying at night',
                      icon: settings.darkMode ? MoonIcon : SunIcon
                    },
                    {
                      key: 'publicProfile',
                      title: 'Public Profile',
                      description: 'Make your study progress visible to other students',
                      icon: UserCircleIcon
                    }
                  ].map((setting) => {
                    const IconComponent = setting.icon;
                    return (
                      <div key={setting.key} className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <IconComponent className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div>
                            <h4 className="font-medium text-white">{setting.title}</h4>
                            <p className="text-sm text-gray-400">{setting.description}</p>
                          </div>
                        </div>
                        <motion.button
                          onClick={() => setSettings({ ...settings, [setting.key]: !settings[setting.key] })}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            settings[setting.key] ? 'bg-indigo-600' : 'bg-white/20'
                          }`}
                        >
                          <motion.span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white/5 transition-transform ${
                              settings[setting.key] ? 'translate-x-6' : 'translate-x-1'
                            }`}
                            layout
                          />
                        </motion.button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-500/5 rounded-2xl shadow-xl border border-red-500/20 p-8">
                <h3 className="text-2xl font-bold text-red-400 mb-2 flex items-center">
                  <TrashIcon className="h-6 w-6 mr-3" />
                  Danger Zone
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                  Permanently delete your account and all associated data. This action cannot be undone.
                  Your data will be fully removed within 30 days.
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors"
                >
                  Delete My Account
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
      {/* Password Change Modal */}
      <AnimatePresence>
        {showPasswordChange && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPasswordChange(false)}
          >
            <motion.div
              className="bg-white/5 rounded-2xl shadow-2xl p-8 max-w-md w-full"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-6 text-center">
                🔐 Update Password
              </h3>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {[
                  { key: 'currentPassword', label: 'Current Password', type: 'current' },
                  { key: 'newPassword', label: 'New Password', type: 'new' },
                  { key: 'confirmPassword', label: 'Confirm New Password', type: 'confirm' }
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{field.label}</label>
                    <div className="relative">
                      <input
                        type={showPasswords[field.type] ? 'text' : 'password'}
                        value={passwordForm[field.key]}
                        onChange={(e) => setPasswordForm({ ...passwordForm, [field.key]: e.target.value })}
                        className={`w-full px-4 py-3 pr-12 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                          errors[field.key] ? 'border-red-300 bg-red-50' : 'border-white/15'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords({ ...showPasswords, [field.type]: !showPasswords[field.type] })}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-400"
                      >
                        {showPasswords[field.type] ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    {errors[field.key] && (
                      <p className="mt-1 text-sm text-red-600 flex items-center">
                        <ExclamationCircleIcon className="h-4 w-4 mr-1" />
                        {errors[field.key]}
                      </p>
                    )}
                  </div>
                ))}
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowPasswordChange(false)}
                    className="btn btn-ghost flex-1 px-4 py-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary flex-1 px-4 py-3"
                  >
                    Update Password
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); setDeletePassword(''); setDeleteConfirmText(''); }}
          >
            <motion.div
              className="bg-white/5 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-red-500/30"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TrashIcon className="h-8 w-8 text-red-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Delete Account</h3>
                <p className="text-gray-400 text-sm">
                  This will anonymize your account. Your data will be fully removed within 30 days.
                  This action cannot be undone.
                </p>
              </div>

              {deleteError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-red-400 text-sm flex items-center">
                    <ExclamationCircleIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    {deleteError}
                  </p>
                </div>
              )}

              <form onSubmit={handleDeleteAccount} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-4 py-3 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-white bg-white/5 placeholder-gray-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type <span className="text-red-400 font-bold">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full px-4 py-3 border border-white/15 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-white bg-white/5 placeholder-gray-500"
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); setDeletePassword(''); setDeleteConfirmText(''); }}
                    className="flex-1 px-4 py-3 border border-white/20 text-white rounded-xl hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleteLoading || deleteConfirmText !== 'DELETE'}
                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
                  >
                    {deleteLoading ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Deleting...
                      </span>
                    ) : 'Delete Account'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default ProfilePage;