import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ShieldCheckIcon,
  CogIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

const CookiePolicyPage = () => {
  const sections = [
    {
      id: 'what-are-cookies',
      title: 'What Are Cookies',
      icon: InformationCircleIcon,
      content: [
        {
          text: 'Cookies are small text files that are stored on your device when you visit a website. They help the website remember your actions and preferences over a period of time, so you don\'t have to re-enter them whenever you come back to the site or browse from one page to another.'
        },
      ],
    },
    {
      id: 'cookies-we-use',
      title: 'Cookies We Use',
      icon: CogIcon,
      content: [
        {
          subtitle: 'Essential Cookies',
          text: 'These cookies are necessary for the website to function properly. They enable core functionality such as authentication, security, and session management. You cannot opt out of these cookies as the website would not work properly without them.',
        },
        {
          subtitle: 'Authentication Tokens',
          text: 'SmartPYQ uses browser localStorage to store JWT authentication tokens (access_token, refresh_token) and user data (userData). These are essential for maintaining your login session. They are stored only after you log in and are removed when you log out.',
        },
        {
          subtitle: 'Session Cookies',
          text: 'We use session-based cookies to maintain your authenticated state and prevent cross-site request forgery (CSRF) attacks. These cookies are temporary and expire when you close your browser.',
        },
      ],
    },
    {
      id: 'cookies-we-dont-use',
      title: 'Cookies We Do NOT Use',
      icon: ExclamationTriangleIcon,
      content: [
        {
          subtitle: 'No Analytics Cookies',
          text: 'SmartPYQ does not currently use Google Analytics, Mixpanel, Amplitude, or any other third-party analytics tracking cookies.',
        },
        {
          subtitle: 'No Advertising Cookies',
          text: 'We do not use any advertising, remarketing, or behavioral targeting cookies. We do not serve ads on our platform.',
        },
        {
          subtitle: 'No Social Media Cookies',
          text: 'We do not embed social media widgets that set tracking cookies. Social media links in our footer are direct links and do not set cookies until you navigate to those platforms.',
        },
      ],
    },
    {
      id: 'local-storage',
      title: 'Local Storage and Browser Data',
      icon: ChartBarIcon,
      content: [
        {
          subtitle: 'What We Store',
          text: 'We use browser localStorage to store: authentication tokens (auth_token, authToken, refresh_token), user profile data (userData, user), and UI preferences. This data never leaves your device and is not transmitted to third parties.',
        },
        {
          subtitle: 'How to Clear',
          text: 'You can clear all SmartPYQ data by logging out, or by clearing your browser\'s localStorage for this site. This will sign you out and remove saved preferences.',
        },
      ],
    },
    {
      id: 'third-party',
      title: 'Third-Party Services',
      icon: ShieldCheckIcon,
      content: [
        {
          text: 'Our backend integrates with Google Gemini AI and OpenAI for the AI study assistant feature. These services do not set cookies on your browser — they are server-side API calls. No third-party JavaScript trackers are loaded on our pages.'
        },
      ],
    },
    {
      id: 'managing-cookies',
      title: 'Managing Cookies',
      icon: CogIcon,
      content: [
        {
          text: 'Since we only use essential cookies and localStorage, there is no cookie consent banner required. However, you can control cookies through your browser settings. Most browsers allow you to block or delete cookies. Note that blocking essential cookies may prevent the website from functioning properly.'
        },
        {
          subtitle: 'Browser Settings',
          text: 'You can configure your browser to block all cookies, accept all cookies, or notify you when a cookie is set. Refer to your browser\'s help documentation for instructions on managing cookie settings.'
        },
      ],
    },
  ];

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
              <CogIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Cookie <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-accent-500">Policy</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-4">
              This policy explains how SmartPYQ uses cookies and similar technologies when you visit our platform.
            </p>
            <p className="text-sm text-gray-400">
              Last updated: January 15, 2024
            </p>
          </motion.div>

          {/* Introduction */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mb-12"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Our Cookie Commitment</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              SmartPYQ takes a privacy-first approach to cookies. We only use cookies and browser storage that are strictly necessary for the website to function. We do <strong className="text-white">not</strong> use analytics, advertising, or third-party tracking cookies.
            </p>
            <p className="text-gray-300 leading-relaxed">
              Because we only use essential cookies, we do not display a cookie consent banner. By using SmartPYQ, you consent to the use of essential cookies described in this policy.
            </p>
          </motion.div>

          {/* Sections */}
          <div className="space-y-8">
            {sections.map((section, index) => {
              const IconComponent = section.icon;
              return (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
                  className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8"
                >
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="w-12 h-12 bg-gradient-to-r from-brand-500 to-accent-500 rounded-lg flex items-center justify-center">
                      <IconComponent className="w-6 h-6 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">{section.title}</h2>
                  </div>
                  <div className="space-y-6">
                    {section.content.map((item, itemIndex) => (
                      <div key={itemIndex}>
                        {item.subtitle && (
                          <h3 className="text-lg font-semibold text-brand-400 mb-2">
                            {item.subtitle}
                          </h3>
                        )}
                        <p className="text-gray-300 leading-relaxed">
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="bg-gradient-to-r from-brand-500/10 to-accent-500/10 border border-brand-500/20 rounded-2xl p-8 mt-8 text-center"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Questions About Cookies?</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              If you have any questions about our use of cookies, please contact us.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/contact" className="btn btn-primary px-6 py-3 font-semibold">
                Contact Support
              </Link>
              <a href="mailto:privacy@smartpyq.com" className="btn btn-secondary px-6 py-3 font-semibold">
                privacy@smartpyq.com
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default CookiePolicyPage;
