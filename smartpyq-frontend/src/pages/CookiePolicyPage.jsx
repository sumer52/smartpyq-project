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
      title: 'Cookies and Browser Storage We Use',
      icon: CogIcon,
      content: [
        {
          subtitle: 'No Cookies Are Set By SmartPYQ',
          text: 'SmartPYQ does not set cookies of its own. The application and its API never write a cookie: sign-in state is kept in browser localStorage instead (described below). Because there are no cookies, there is nothing to opt out of on this site.',
        },
        {
          subtitle: 'Authentication Tokens (localStorage)',
          text: 'After you sign in, the access and refresh tokens are stored in browser localStorage under the keys auth_token, authToken and refresh_token, together with a cached copy of your profile (userData and user). The app reads those values and sends the access token to the SmartPYQ API in an Authorization header. They are removed when you sign out or clear site data, and the refresh token expires on its own.',
        },
        {
          subtitle: 'Guest Upload Token',
          text: 'If you upload a paper without signing in, this browser keeps a random lookup token (smartpyq_anon_upload_token) so you can see the papers submitted from this device. It is only an identifier for your own submissions, not a login credential.',
        },
        {
          subtitle: 'Security Trade-off You Should Know About',
          text: 'Tokens kept in localStorage can be read by any script that manages to run on this site, so a cross-site scripting (XSS) flaw would expose them. The app does not inject raw HTML (React escapes rendered values) and all AI and service API keys stay on the server, but localStorage cannot remove that risk completely. Prefer not to sign in on a shared or public computer.',
        },
      ],
    },
    {
      id: 'cookies-we-dont-use',
      title: 'Cookies We Do NOT Use',
      icon: ExclamationTriangleIcon,
      content: [
        {
          subtitle: 'No Third-Party Analytics',
          text: 'We do not use Google Analytics, Mixpanel, Amplitude, or any other third-party analytics or tracking cookies. One thing we do keep: anonymous, cookieless counts of how often the introduction is shown, skipped or finished, recorded by our own API. They carry no identifier, no cookie and no cross-site tracking.',
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
          text: 'Browser localStorage holds: authentication tokens (auth_token, authToken, refresh_token), a cached profile (userData, user), the guest upload token above, and two interface flags (one records that you have seen the introduction, one that you dismissed the maintenance notice).',
        },
        {
          subtitle: 'What Is Sent to Our Servers',
          text: 'The access token is sent to the SmartPYQ API in an Authorization header so the server can identify your session, and the guest upload token is sent when you open your submissions. Paper details you submit (course, semester, subject, year, file) are stored server-side with the paper. Nothing else in browser storage is uploaded, and none of it is shared with third parties.',
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
          text: 'The AI assistant runs on our backend. Depending on how it is configured, your prompt may be sent to Google Gemini or OpenAI to generate the answer; the API keys stay on the server and neither service sets a cookie in your browser. Our hosting, database and file-storage providers process data on our behalf. No third-party JavaScript trackers are loaded on our pages.'
        },
      ],
    },
    {
      id: 'managing-cookies',
      title: 'Managing Cookies',
      icon: CogIcon,
      content: [
        {
          text: 'We do not set tracking cookies, so we do not show a cookie consent banner. You can still block or delete cookies and site data in your browser; clearing site storage will sign you out and remove the guest upload token, so previously submitted papers will not be listed on this device.'
        },
        {
          subtitle: 'Browser Settings',
          text: 'You can configure your browser to block all cookies, accept all cookies, or notify you when a cookie is set. Refer to your browser\'s help documentation for instructions on managing cookie settings.'
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-dark via-slate-900 to-bg-dark">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <div className="w-16 h-16 bg-linear-to-r from-brand-500 to-accent-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CogIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Cookie <span className="text-brand-300 ">Policy</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-4">
              This policy explains how SmartPYQ uses cookies and similar technologies when you visit our platform.
            </p>
            <p className="text-sm text-gray-400">
              Last updated: November 26, 2026
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
              SmartPYQ does not set cookies. Sign-in state and preferences are kept in your browser's own localStorage, which is described in detail below. We do <strong className="text-white">not</strong> use advertising or third-party tracking cookies, and the only usage data we record is anonymous and cookieless.
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
                    <div className="w-12 h-12 bg-linear-to-r from-brand-500 to-accent-500 rounded-lg flex items-center justify-center">
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
            className="bg-linear-to-r from-brand-500/10 to-accent-500/10 border border-brand-500/20 rounded-2xl p-8 mt-8 text-center"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Questions About Cookies?</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              If you have any questions about our use of cookies, please contact us.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/contact" className="btn btn-primary btn-lg font-semibold">
                Contact Support
              </Link>
              <a href="mailto:privacy@smartpyq.com" className="btn btn-secondary btn-lg font-semibold">
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
