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
          text: 'We collect information you provide directly to us, such as when you create an account, upload papers, or contact us for support. This includes your name, email address, educational institution, and course details.'
        },
        {
          subtitle: 'Usage Information',
          text: 'We automatically collect information about how you use our service, including pages visited, papers downloaded, search queries, and interaction with our AI assistant.'
        },
        {
          subtitle: 'Device Information',
          text: 'We collect information about the device you use to access SmartPYQ, including IP address, browser type, operating system, and device identifiers.'
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
          text: 'We analyze usage patterns to understand how our service is used and to improve functionality, user experience, and content quality.'
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
          text: 'We may share information with trusted service providers who assist us in operating our platform, such as cloud storage providers and analytics services, under strict confidentiality agreements.'
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
          subtitle: 'Encryption',
          text: 'All data transmission is encrypted using industry-standard SSL/TLS protocols. Your passwords are hashed using secure algorithms and never stored in plain text.'
        },
        {
          subtitle: 'Access Controls',
          text: 'We implement strict access controls to ensure that only authorized personnel can access your personal information, and only when necessary for service provision.'
        },
        {
          subtitle: 'Regular Security Audits',
          text: 'We conduct regular security assessments and updates to protect against unauthorized access, alteration, disclosure, or destruction of your information.'
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
          text: 'You can access, update, or delete your account information at any time through your account settings or by contacting our support team.'
        },
        {
          subtitle: 'Data Portability',
          text: 'You have the right to request a copy of your personal data in a structured, machine-readable format.'
        },
        {
          subtitle: 'Communication Preferences',
          text: 'You can opt out of non-essential communications at any time by updating your preferences in your account settings.'
        }
      ]
    },
    {
      id: 'cookies',
      title: 'Cookies and Tracking',
      icon: ExclamationTriangleIcon,
      content: [
        {
          subtitle: 'Essential Cookies',
          text: 'We use essential cookies to provide basic functionality, such as maintaining your login session and remembering your preferences.'
        },
        {
          subtitle: 'Analytics Cookies',
          text: 'We use analytics cookies to understand how users interact with our platform and to improve our services. You can disable these through your browser settings.'
        },
        {
          subtitle: 'Third-Party Services',
          text: 'Some features may use third-party services (like Google Analytics) that may set their own cookies. Please refer to their privacy policies for more information.'
        }
      ]
    }
  ];
  const lastUpdated = 'January 15, 2024';
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
              <ShieldCheckIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Privacy <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-accent-500">Policy</span>
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
                    <div className="w-12 h-12 bg-gradient-to-r from-brand-500 to-accent-500 rounded-lg flex items-center justify-center">
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
              We retain your personal information only for as long as necessary to provide our services and fulfill the purposes outlined in this privacy policy. When you delete your account, we will delete or anonymize your personal information within 30 days, except where we are required to retain certain information for legal or regulatory purposes.
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
              Your information may be transferred to and processed in countries other than your own. We ensure that such transfers comply with applicable data protection laws and that appropriate safeguards are in place to protect your information.
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
            className="bg-gradient-to-r from-brand-500/10 to-accent-500/10 border border-brand-500/20 rounded-2xl p-8 mt-8 text-center"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Questions About This Policy?</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              If you have any questions about this Privacy Policy or our data practices, please don't hesitate to contact us.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                onClick={() => window.location.href = '/contact'}
                className="btn btn-primary px-6 py-3 font-semibold"
              >
                Contact Support
              </motion.button>
              <motion.a
                href="mailto:privacy@smartpyq.com"
                className="btn btn-secondary px-6 py-3 font-semibold"
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