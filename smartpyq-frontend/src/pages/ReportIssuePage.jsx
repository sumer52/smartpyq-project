import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  BugAntIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  PhotoIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline';
const ReportIssuePage = () => {
  const [formData, setFormData] = useState({
    title: '',
    category: 'bug',
    priority: 'medium',
    description: '',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: '',
    browserInfo: '',
    deviceInfo: '',
    email: '',
    attachments: []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setFormData(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...files]
    }));
  };
  const removeAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Issue report submitted:', formData);
      setSubmitStatus('success');
      setFormData({
        title: '',
        category: 'bug',
        priority: 'medium',
        description: '',
        stepsToReproduce: '',
        expectedBehavior: '',
        actualBehavior: '',
        browserInfo: '',
        deviceInfo: '',
        email: '',
        attachments: []
      });
    } catch (error) {
      console.error('Error submitting issue report:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus(null), 5000);
    }
  };
  const categories = [
    { value: 'bug', label: 'Bug Report', icon: BugAntIcon, description: 'A feature or function is broken or behaving incorrectly' },
    { value: 'feature', label: 'Feature Request', icon: DocumentTextIcon, description: 'Propose something new or an improvement to existing features' },
    { value: 'performance', label: 'Performance Issue', icon: DevicePhoneMobileIcon, description: 'The site is loading slowly or performing poorly' },
    { value: 'ui', label: 'UI/UX Issue', icon: PhotoIcon, description: 'Something looks wrong or is confusing to use' },
    { value: 'content', label: 'Content Issue', icon: DocumentTextIcon, description: 'Issues with uploaded papers, extracted data, or content' },
    { value: 'other', label: 'Other', icon: ExclamationTriangleIcon, description: 'Anything else that needs our attention' }
  ];
  const priorities = [
    { value: 'low', label: 'Low', color: 'text-green-400', description: 'Minor issue, no rush' },
    { value: 'medium', label: 'Medium', color: 'text-yellow-400', description: 'Moderate impact' },
    { value: 'high', label: 'High', color: 'text-orange-400', description: 'Significant impact' },
    { value: 'critical', label: 'Critical', color: 'text-red-400', description: 'Blocking or severe issue' }
  ];
  // Auto-detect browser and device info
  React.useEffect(() => {
    const browserInfo = `${navigator.userAgent}`;
    const deviceInfo = `Screen: ${screen.width}x${screen.height}, Platform: ${navigator.platform}`;
    setFormData(prev => ({
      ...prev,
      browserInfo,
      deviceInfo
    }));
  }, []);
  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-dark via-slate-900 to-bg-dark">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <div className="w-16 h-16 bg-gradient-to-r from-brand-500 to-accent-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <ExclamationTriangleIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Report an <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-accent-500">Issue</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Help us make SmartPYQ better by reporting bugs, suggesting improvements, or letting us know about issues you encounter.
            </p>
          </motion.div>
          {/* Issue Categories */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-12"
          >
            <h2 className="text-2xl font-bold text-white mb-6 text-center">What kind of problem are you reporting?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => {
                const IconComponent = category.icon;
                return (
                  <motion.label
                    key={category.value}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.category === category.value
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={category.value}
                      checked={formData.category === category.value}
                      onChange={handleInputChange}
                      className="sr-only"
                    />
                    <div className="flex items-start space-x-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        formData.category === category.value
                          ? 'bg-gradient-to-r from-brand-500 to-accent-500'
                          : 'bg-slate-700'
                      }`}>
                        <IconComponent className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-white mb-1">{category.label}</h3>
                        <p className="text-sm text-gray-400">{category.description}</p>
                      </div>
                    </div>
                  </motion.label>
                );
              })}
            </div>
          </motion.div>
          {/* Report Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title and Priority */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-2">
                    Issue Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                    placeholder="Give your issue a short title"
                  />
                </div>
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-300 mb-2">
                    Priority *
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                  >
                    {priorities.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label} - {priority.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
                  Detailed Description *
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200 resize-vertical"
                  placeholder="What happened? How did you encounter this issue? Include any relevant details..."
                />
              </div>
              {/* Steps to Reproduce (for bugs) */}
              {formData.category === 'bug' && (
                <div>
                  <label htmlFor="stepsToReproduce" className="block text-sm font-medium text-gray-300 mb-2">
                    Steps to Reproduce
                  </label>
                  <textarea
                    id="stepsToReproduce"
                    name="stepsToReproduce"
                    value={formData.stepsToReproduce}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200 resize-vertical"
                    placeholder="1. Go to...\n2. Click on...\n3. See error..."
                  />
                </div>
              )}
              {/* Expected vs Actual Behavior (for bugs) */}
              {formData.category === 'bug' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="expectedBehavior" className="block text-sm font-medium text-gray-300 mb-2">
                      Expected Behavior
                    </label>
                    <textarea
                      id="expectedBehavior"
                      name="expectedBehavior"
                      value={formData.expectedBehavior}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200 resize-vertical"
                      placeholder="What did you expect the site to do?"
                    />
                  </div>
                  <div>
                    <label htmlFor="actualBehavior" className="block text-sm font-medium text-gray-300 mb-2">
                      Actual Behavior
                    </label>
                    <textarea
                      id="actualBehavior"
                      name="actualBehavior"
                      value={formData.actualBehavior}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200 resize-vertical"
                      placeholder="What did the site do instead?"
                    />
                  </div>
                </div>
              )}
              {/* System Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="browserInfo" className="block text-sm font-medium text-gray-300 mb-2">
                    Browser Information
                  </label>
                  <textarea
                    id="browserInfo"
                    name="browserInfo"
                    value={formData.browserInfo}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200 resize-vertical text-xs"
                    placeholder="Browser and version info (auto-detected)"
                  />
                </div>
                <div>
                  <label htmlFor="deviceInfo" className="block text-sm font-medium text-gray-300 mb-2">
                    Device Information
                  </label>
                  <textarea
                    id="deviceInfo"
                    name="deviceInfo"
                    value={formData.deviceInfo}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200 resize-vertical text-xs"
                    placeholder="Device and screen info (auto-detected)"
                  />
                </div>
              </div>
              {/* Contact Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Contact Email (Optional)
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                  placeholder="your@email.com (for follow-up only)"
                />
              </div>
              {/* File Attachments */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Attachments (Screenshots, logs, etc.)
                </label>
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-slate-500 transition-colors duration-200">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.txt,.log,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <PaperClipIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-400">Click to upload or drag files here</p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG, PDF, TXT, LOG files up to 10MB each</p>
                  </label>
                </div>
                {/* Attachment List */}
                {formData.attachments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {formData.attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-white">{file.name}</span>
                          <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Submit Status */}
              {submitStatus && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-lg text-center ${
                    submitStatus === 'success'
                      ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                      : 'bg-red-500/20 border border-red-500/50 text-red-400'
                  }`}
                >
                  {submitStatus === 'success'
                    ? '✅ Issue report submitted successfully! We\'ll investigate and get back to you.'
                    : '❌ Failed to submit report. Please try again or contact support directly.'}
                </motion.div>
              )}
              {/* Submit Button */}
              <motion.button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary btn-block py-4 text-lg font-semibold"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </div>
                ) : (
                  'Submit Report'
                )}
              </motion.button>
            </form>
          </motion.div>
          {/* Help Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8 text-center"
          >
            <p className="text-gray-400 text-sm">
              For urgent issues, please contact our support team directly at{' '}
              <a href="mailto:smartpyq@gmail.com" className="text-brand-400 hover:text-brand-300">
                smartpyq@gmail.com
              </a>
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
};
export default ReportIssuePage;