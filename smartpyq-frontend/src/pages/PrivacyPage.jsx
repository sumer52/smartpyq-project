import React from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  EyeIcon,
  LockClosedIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
const PrivacyPage = () => {
  const sections = [
    {
      id: 'information-collection',
      title: 'Information We Collect',
      icon: DocumentTextIcon,
      content: [
        {
          subtitle: 'Personal Information',
          text: 'We collect the information you give us: your email address and password when you create an account (the password is stored only as an Argon2 hash), an optional display name, and anything you type into an upload, a support message or the contact form.'
        },
        {
          subtitle: 'Request and Usage Data',
          text: 'Our API records the requests needed to run the service (which endpoint was called and whether it succeeded) for rate limiting and error diagnosis, and keeps anonymous counts of how often the introduction is viewed, skipped or completed. We do not build a per-visitor browsing profile, and AI chat requests are answered without being stored.'
        },
        {
          subtitle: 'Technical Data',
          text: 'Like any website, our servers see the IP address and basic request headers of each request and may keep them in short-lived logs for abuse prevention and debugging. We do not use device fingerprinting, advertising identifiers or cross-site trackers.'
        }
      ]
    },
    {
      id: 'information-use',
      title: 'How We Use Your Information',
      icon: EyeIcon,
      content: [
        {
          subtitle: 'Service Provision',
          text: 'We use your information to provide, maintain, and improve our services, including personalizing your experience and providing relevant paper recommendations.'
        },
        {
          subtitle: 'Communication',
          text: 'We may use your email address to send you service-related notifications, updates about new features, and respond to your inquiries.'
        },
        {
          subtitle: 'Analytics and Improvement',
          text: 'We only look at aggregate, anonymous counters (for example, how many visitors finished the introduction) to see whether features work. We do not run third-party analytics, session recording or advertising measurement.'
        }
      ]
    },
    {
      id: 'information-sharing',
      title: 'Information Sharing',
      icon: UserGroupIcon,
      content: [
        {
          subtitle: 'No Sale of Personal Data',
          text: 'We do not sell, trade, or otherwise transfer your personal information to third parties for commercial purposes.'
        },
        {
          subtitle: 'Service Providers',
          text: 'We use providers to host the application, store the database and uploaded files, and generate AI answers. When you use the AI assistant, your prompt may be sent to Google Gemini or OpenAI. These providers process data on our behalf; we do not share it with analytics, advertising or data-broker services.'
        },
        {
          subtitle: 'Legal Requirements',
          text: 'We may disclose your information if required by law, court order, or government regulation, or to protect our rights and the safety of our users.'
        }
      ]
    },
    {
      id: 'data-security',
      title: 'Data Security',
      icon: LockClosedIcon,
      content: [
        {
          subtitle: 'Transport and Passwords',
          text: 'Traffic between your browser and SmartPYQ is served over HTTPS. Passwords are hashed with Argon2 and never stored in plain text. Authentication tokens are kept in your browser localStorage, which is described in the Cookie Policy along with the XSS trade-off that implies.'
        },
        {
          subtitle: 'Access Controls',
          text: 'We implement strict access controls to ensure that only authorized personnel can access your personal information, and only when necessary for service provision.'
        },
        {
          subtitle: 'What We Do Not Claim',
          text: 'We keep dependencies and access rules under review, but no independent security audit or certification has been carried out, so this policy does not claim one. Uploads are limited to PDF and image files with a size cap, and administrative actions require an authenticated admin account.',
        }
      ]
    },
    {
      id: 'user-rights',
      title: 'Your Rights and Choices',
      icon: ShieldCheckIcon,
      content: [
        {
          subtitle: 'Account Access',
          text: 'There is no self-service account settings screen yet. To review, correct or delete your account data, email us from the address on the account and we will handle the request manually.'
        },
        {
          subtitle: 'Data Portability',
          text: 'You can ask us for a copy of the account data we hold about you. We prepare it by hand, so allow a few working days for the reply.',
        },
        {
          subtitle: 'Communication Preferences',
          text: 'We do not currently send newsletters or marketing email. Service messages about your own requests are sent only in reply to you.',
        }
      ]
    },
    {
      id: 'cookies',
      title: 'Cookies and Tracking',
      icon: ExclamationTriangleIcon,
      content: [
        {
          subtitle: 'No Cookies, But Browser Storage',
          text: 'SmartPYQ does not set cookies. Once you sign in, the access and refresh tokens and a cached profile are kept in your browser localStorage so the app can stay signed in; they are sent to our API in an Authorization header. Clearing site data signs you out.',
        },
        {
          subtitle: 'No Analytics or Advertising Cookies',
          text: 'We do not use analytics, advertising, or third-party tracking cookies. This matches our Cookie Policy: only storage that is strictly necessary for the site to work is used, which is why there is no cookie consent banner.'
        },
        {
          subtitle: 'Browser Storage You Control',
          text: 'Your browser stores the sign-in tokens, plus a random token that lets you see papers you uploaded while signed out. Clearing site data in your browser removes all of it. Because tokens live in localStorage, a script injected into the page could read them, which is why we render all content as text rather than raw HTML.',
        }
      ]
    }
  ];
  const lastUpdated = 'November 26, 2026';
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
              <ShieldCheckIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Privacy <span className="text-brand-300 ">Policy</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-4">
              Your privacy is important to us. This policy explains how we collect, use, and protect your information when you use SmartPYQ.
            </p>
            <p className="text-sm text-gray-400">
              Last updated: {lastUpdated}
            </p>
          </motion.div>
          {/* Introduction */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mb-12"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Introduction</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              SmartPYQ ("we," "our," or "us") is committed to protecting your privacy and ensuring the security of your personal information. This Privacy Policy describes how we collect, use, disclose, and safeguard your information when you use our platform.
            </p>
            <p className="text-gray-300 leading-relaxed">
              By using SmartPYQ, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our service.
            </p>
          </motion.div>
          {/* Privacy Sections */}
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
                        <h3 className="text-lg font-semibold text-brand-400 mb-2">
                          {item.subtitle}
                        </h3>
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
          {/* Data Retention */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Data Retention</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              We keep account data for as long as the account exists. When you ask us to delete an account we remove or anonymise its personal data, except where a record must be retained for legal reasons or to investigate abuse. There is no automatic expiry, so a request to support is what triggers deletion.
            </p>
            <p className="text-gray-300 leading-relaxed">
              Uploaded papers and associated metadata may be retained longer to maintain the integrity of our database and provide continued service to other users, but will be disassociated from your personal information.
            </p>
          </motion.div>
          {/* International Transfers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">International Data Transfers</h2>
            <p className="text-gray-300 leading-relaxed">
              Our hosting, database, storage and AI providers may process data outside your country, including outside India. We have not completed a formal adequacy or transfer-safeguard assessment for those flows, so this policy does not claim one.
            </p>
          </motion.div>
          {/* Children's Privacy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Children's Privacy</h2>
            <p className="text-gray-300 leading-relaxed">
              SmartPYQ is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us so we can delete such information.
            </p>
          </motion.div>
          {/* Changes to Policy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.1 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Changes to This Privacy Policy</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
            </p>
            <p className="text-gray-300 leading-relaxed">
              We encourage you to review this Privacy Policy periodically to stay informed about how we are protecting your information.
            </p>
          </motion.div>
          {/* Contact Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="bg-linear-to-r from-brand-500/10 to-accent-500/10 border border-brand-500/20 rounded-2xl p-8 mt-8 text-center"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Questions About This Policy?</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              If you have any questions about this Privacy Policy or our data practices, please don't hesitate to contact us.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                onClick={() => window.location.href = '/contact'}
                className="btn btn-primary btn-lg font-semibold"
              >
                Contact Support
              </motion.button>
              <motion.a
                href="mailto:privacy@smartpyq.com"
                className="btn btn-secondary btn-lg font-semibold"
              >
                privacy@smartpyq.com
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};
export default PrivacyPage;