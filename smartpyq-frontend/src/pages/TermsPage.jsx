import React from 'react';
import { motion } from 'framer-motion';
import {
  DocumentTextIcon,
  UserIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  ScaleIcon,
  CogIcon,
} from '@heroicons/react/24/outline';
const TermsPage = () => {
  const sections = [
    {
      id: 'acceptance',
      title: 'Acceptance of Terms',
      icon: DocumentTextIcon,
      content: [
        {
          text: 'By accessing and using SmartPYQ, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.'
        },
        {
          text: 'These Terms of Service constitute a legally binding agreement between you and SmartPYQ. Your use of the service is also governed by our Privacy Policy.'
        }
      ]
    },
    {
      id: 'description',
      title: 'Service Description',
      icon: CogIcon,
      content: [
        {
          text: 'SmartPYQ is an online platform that provides students with access to previous year question papers, study materials, and AI-powered study assistance.'
        },
        {
          text: 'Our service includes features such as paper search and download, AI chat assistance, content upload capabilities, and personalized study recommendations.'
        },
        {
          text: 'We reserve the right to modify, suspend, or discontinue any aspect of the service at any time with or without notice.'
        }
      ]
    },
    {
      id: 'user-accounts',
      title: 'User Accounts and Registration',
      icon: UserIcon,
      content: [
        {
          subtitle: 'Account Creation',
          text: 'To access certain features, you must create an account by providing accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials.'
        },
        {
          subtitle: 'Account Responsibility',
          text: 'You are responsible for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.'
        },
        {
          subtitle: 'Account Termination',
          text: 'We reserve the right to terminate or suspend your account at any time for violation of these terms or for any other reason at our sole discretion.'
        }
      ]
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable Use Policy',
      icon: ShieldExclamationIcon,
      content: [
        {
          subtitle: 'Permitted Uses',
          text: 'You may use SmartPYQ for lawful educational purposes, including studying, research, and academic preparation.'
        },
        {
          subtitle: 'Prohibited Activities',
          text: 'You may not: (a) upload malicious content or viruses, (b) violate any applicable laws, (c) infringe on intellectual property rights, (d) attempt to gain unauthorized access to our systems, (e) use the service for commercial purposes without permission.'
        },
        {
          subtitle: 'Content Guidelines',
          text: 'When uploading content, you must ensure it is accurate, relevant, and does not violate copyright or other intellectual property rights.'
        }
      ]
    },
    {
      id: 'intellectual-property',
      title: 'Intellectual Property Rights',
      icon: ScaleIcon,
      content: [
        {
          subtitle: 'Our Content',
          text: 'SmartPYQ and its original content, features, and functionality are owned by us and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.'
        },
        {
          subtitle: 'User Content',
          text: 'By uploading content to SmartPYQ, you grant us a non-exclusive, worldwide, royalty-free license to use, reproduce, modify, and distribute your content for the purpose of providing our services.'
        },
        {
          subtitle: 'Third-Party Content',
          text: 'Question papers and study materials may be subject to third-party copyrights. Users are responsible for ensuring their use complies with applicable copyright laws.'
        }
      ]
    },
    {
      id: 'disclaimers',
      title: 'Disclaimers and Limitations',
      icon: ExclamationTriangleIcon,
      content: [
        {
          subtitle: 'Service Availability',
          text: 'We strive to maintain service availability but do not guarantee uninterrupted access. The service is provided "as is" without warranties of any kind.'
        },
        {
          subtitle: 'Content Accuracy',
          text: 'While we make efforts to ensure content accuracy, we do not guarantee the correctness, completeness, or reliability of any information on the platform.'
        },
        {
          subtitle: 'AI Assistant Limitations',
          text: 'Our AI assistant provides general information and study guidance. It should not be considered as professional academic advice or a substitute for proper study methods.'
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
              <DocumentTextIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Terms of <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-accent-500">Service</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-4">
              Please read these Terms of Service carefully before using SmartPYQ. These terms govern your use of our platform and services.
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
            <h2 className="text-2xl font-bold text-white mb-4">Welcome to SmartPYQ</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              These Terms of Service ("Terms") govern your use of the SmartPYQ platform and services operated by SmartPYQ ("we," "us," or "our"). These Terms apply to all visitors, users, and others who access or use our service.
            </p>
            <p className="text-gray-300 leading-relaxed">
              By accessing or using our service, you agree to be bound by these Terms. If you disagree with any part of these terms, then you may not access the service.
            </p>
          </motion.div>
          {/* Terms Sections */}
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
          {/* Payment Terms */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Payment Terms</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              SmartPYQ is a free educational platform. There are no subscription fees, paywalls, or premium tiers for accessing previous year question papers or using the AI study assistant.
            </p>
            <p className="text-gray-300 leading-relaxed">
              We reserve the right to introduce paid features in the future. If we do, existing free features will remain free, and any new pricing will be communicated in advance.
            </p>
          </motion.div>
          {/* Privacy and Data */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Privacy and Data Protection</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              Your privacy is important to us. Our collection and use of personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference.
            </p>
            <p className="text-gray-300 leading-relaxed">
              By using our service, you consent to the collection and use of your information as described in our Privacy Policy.
            </p>
          </motion.div>
          {/* Limitation of Liability */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              In no event shall SmartPYQ, its directors, employees, partners, agents, suppliers, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the service.
            </p>
            <p className="text-gray-300 leading-relaxed">
              As a  educational platform, our total liability to you for all claims arising from or relating to the service shall not exceed ₹1,000.
            </p>
          </motion.div>
          {/* Governing Law */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.1 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Governing Law and Jurisdiction</h2>
            <p className="text-gray-300 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising from these Terms or your use of the service shall be subject to the exclusive jurisdiction of the courts in Bangalore, India.
            </p>
          </motion.div>
          {/* Changes to Terms */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 mt-8"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Changes to Terms</h2>
            <p className="text-gray-300 leading-relaxed mb-4">
              We reserve the right to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.
            </p>
            <p className="text-gray-300 leading-relaxed">
              Your continued use of the service after any such changes constitutes your acceptance of the new Terms.
            </p>
          </motion.div>
          {/* Contact Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.3 }}
            className="bg-gradient-to-r from-brand-500/10 to-accent-500/10 border border-brand-500/20 rounded-2xl p-8 mt-8 text-center"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Questions About These Terms?</h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              If you have any questions about these Terms of Service, please contact us. We're here to help clarify any concerns you may have.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                onClick={() => window.location.href = '/contact'}
                className="btn btn-primary px-6 py-3 font-semibold"
              >
                Contact Support
              </motion.button>
              <motion.a
                href="mailto:legal@smartpyq.com"
                className="btn btn-secondary px-6 py-3 font-semibold"
              >
                legal@smartpyq.com
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};
export default TermsPage;