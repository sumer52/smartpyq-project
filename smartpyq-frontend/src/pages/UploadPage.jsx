import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import UploadStepper from '../components/UploadStepper';
import {
  ArrowUpTrayIcon, SparklesIcon, ShieldCheckIcon, StarIcon,
  QuestionMarkCircleIcon, ChevronDownIcon, ChevronUpIcon
} from '@heroicons/react/24/outline';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};
const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};
const UploadPage = () => {
  const { isAuthenticated } = useAuth();
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);

  const handleUploadComplete = () => {
    setUploadSuccess(true);
    setTimeout(() => setUploadSuccess(false), 4000);
  };

  const faqs = [
    { q: 'What file formats are accepted?', a: 'We accept PDF, JPG, JPEG, PNG, and WEBP files. Clear, readable documents work best. For images, make sure the text is legible and the photo is well-lit.' },
    { q: 'What happens after I upload?', a: 'Our system automatically analyzes your uploaded file and extracts key information like subject, semester, and questions. You\'ll see a review screen where you can verify and correct any auto-detected details before confirming the upload.' },
    { q: 'Can I upload answer keys?', a: 'No, we only accept original question papers. Answer keys, solutions, and study materials are not accepted at this time.' },
    { q: 'Is there a file size limit?', a: 'You can upload files up to 50MB in size. Most question papers are well under this limit.' },
    { q: 'Do I need an account to upload?', a: 'Yes, you need to be logged in. This helps us track uploads and ensure the quality of papers in the database.' }
  ];
  return (
    <motion.div className="min-h-screen bg-white/[0.02]" variants={stagger} initial="hidden" animate="visible">
      <motion.div variants={fadeUp} className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-transparent" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-10 text-center">
          <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium mb-6" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <ArrowUpTrayIcon className="h-4 w-4" />
            Community Upload
          </motion.div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">Share a Question Paper</h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">Upload your previous year question paper and help thousands of students prepare smarter. Every paper you contribute makes SmartPYQ better for everyone.</p>

        </div>
      </motion.div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div className="lg:col-span-2" variants={fadeUp}>
            <AnimatePresence>
              {uploadSuccess && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                  className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center gap-3">
                  <SparklesIcon className="h-5 w-5 text-green-400 flex-shrink-0" />
                  <div><p className="text-green-300 font-medium text-sm">Upload successful!</p>
                  <p className="text-green-400/70 text-xs mt-0.5">Your paper is now available in the PYQ Hub.</p></div>
                </motion.div>
              )}
            </AnimatePresence>
            {!isAuthenticated ? (
              <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-6">
                  <ShieldCheckIcon className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Login to Upload</h3>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">You need an account to contribute question papers. Logging in takes just a moment and helps us maintain quality.</p>
                <div className="flex items-center justify-center gap-3">
                  <a href="/login" className="btn btn-primary px-6 py-3">Login</a>
                  <a href="/login" className="btn btn-secondary px-6 py-3">Create Account</a>
                </div>
              </div>
            ) : (
              <UploadStepper onUploadComplete={handleUploadComplete} />
            )}
          </motion.div>
          <motion.div className="space-y-6" variants={fadeUp}>
            <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-purple-400" /> How It Works
              </h3>
              <div className="space-y-4">
                {[
                  { step: 1, title: 'Upload your file', desc: 'Drag or select your question paper (PDF or image)' },
                  { step: 2, title: 'Review & edit', desc: 'Verify auto-detected details and questions' },
                  { step: 3, title: 'Instant access', desc: 'Paper appears in the PYQ Hub immediately' }
                ].map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-300 text-xs font-bold">{item.step}</div>
                    <div><p className="text-white text-sm font-medium">{item.title}</p><p className="text-gray-500 text-xs mt-0.5">{item.desc}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6">
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <ShieldCheckIcon className="h-5 w-5 text-green-400" /> Upload Guidelines
              </h3>
              <div className="space-y-3">
                {[
                  { ok: true, text: 'PDF, JPG, JPEG, PNG, or WEBP files' },
                  { ok: true, text: 'Maximum file size: 50MB' },
                  { ok: true, text: 'Auto-detected details can be edited before submit' },
                  { ok: true, text: 'Original question papers only' },
                  { ok: true, text: 'Clear, legible text for best auto-detection' },
                  { ok: false, text: 'No answer keys or solutions' }
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className={item.ok ? 'text-green-500 mt-0.5 text-xs' : 'text-red-400 mt-0.5 text-xs'}>&#x25CF;</span>
                    <span className={'text-sm ' + (item.ok ? 'text-gray-400' : 'text-gray-500')}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-2xl border border-purple-500/15 p-6">
              <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                <StarIcon className="h-5 w-5 text-yellow-400" /> Why Contribute?
              </h3>
              <div className="space-y-3">
                {[
                  { text: 'Help thousands of students access study material' },
                  { text: 'Make repeated question detection more accurate' },
                  { text: 'Build the largest PYQ database for Osmania University' },
                  { text: 'Earn recognition as a community contributor' }
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5 text-xs">&#x2713;</span>
                    <span className="text-gray-300 text-sm">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.section className="mt-16 max-w-3xl mx-auto" variants={fadeUp}>
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white mb-2 flex items-center justify-center gap-2">
              <QuestionMarkCircleIcon className="h-6 w-6 text-purple-400" />
              Frequently Asked Questions
            </h2>
            <p className="text-gray-400">Everything you need to know about uploading papers</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <motion.div key={index} className="bg-white/[0.03] rounded-xl border border-white/10 overflow-hidden"
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.05, duration: 0.4 }}>
                <button className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}>
                  <span className="text-white font-medium text-sm pr-4">{faq.q}</span>
                  {expandedFaq === index ? <ChevronUpIcon className="h-5 w-5 text-gray-400 flex-shrink-0" /> : <ChevronDownIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />}
                </button>
                <AnimatePresence>
                  {expandedFaq === index && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div className="px-6 pb-4 text-gray-400 text-sm leading-relaxed border-t border-white/5 pt-3">{faq.a}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
          <div className="text-center mt-8">
            <a href="/support" className="btn btn-secondary px-6 py-2.5 text-sm">Need more help? Contact Support</a>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
};

export default UploadPage;
