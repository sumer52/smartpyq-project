import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  BookOpenIcon,
  UserIcon,
  ShieldCheckIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
const FAQPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [openItems, setOpenItems] = useState(new Set());
  const categories = [
    { id: 'all', name: 'All Questions', icon: QuestionMarkCircleIcon },
    { id: 'general', name: 'General', icon: BookOpenIcon },
    { id: 'account', name: 'Account', icon: UserIcon },
    { id: 'papers', name: 'Papers & Content', icon: BookOpenIcon },
    { id: 'ai', name: 'AI Assistant', icon: ChatBubbleLeftRightIcon },
    { id: 'privacy', name: 'Privacy & Security', icon: ShieldCheckIcon },
  ];
  const faqs = [
    {
      id: 1,
      category: 'general',
      question: 'What is SmartPYQ?',
      answer: 'SmartPYQ is an intelligent platform that provides students with access to previous year question papers (PYQs) from various universities and courses. Our AI-powered assistant helps you study more effectively by providing personalized recommendations and answering your questions about the papers.'
    },
    {
      id: 2,
      category: 'general',
      question: 'How do I get started with SmartPYQ?',
      answer: 'Getting started is easy! Simply sign up for a free account, browse our extensive collection of previous year papers, or use our AI assistant to get personalized study recommendations. You can also upload papers to contribute to our community.'
    },
    {
      id: 3,
      category: 'account',
      question: 'How do I create an account?',
      answer: 'Click the "Sign Up" button in the top navigation, fill in your details including name, email, and password. You\'ll receive a verification email to activate your account. You can also try our demo account with email: test@university.edu and password: TestPass123!.'
    },
    {
      id: 4,
      category: 'account',
      question: 'I forgot my password. How can I reset it?',
      answer: 'On the login page, click "Forgot Password?" and enter your email address. We\'ll send you a secure link to reset your password. Make sure to check your spam folder if you don\'t see the email within a few minutes.'
    },
    {
      id: 5,
      category: 'papers',
      question: 'How do I search for specific papers?',
      answer: 'Use our advanced search feature to filter papers by university, course, subject, year, and semester. You can also use keywords to find specific topics or question types. Our AI-powered search understands natural language queries.'
    },
    {
      id: 6,
      category: 'papers',
      question: 'Can I download papers for offline use?',
      answer: 'Yes! Registered users can download papers in PDF format for offline studying. Downloaded papers include a watermark with your account information for security purposes.'
    },
    {
      id: 7,
      category: 'papers',
      question: 'How do I upload a paper?',
      answer: 'Navigate to the Upload section, select your PDF file, and fill in the paper details including university, course, subject, and year. Our system will automatically scan the file for viruses and process it for inclusion in our database.'
    },
    {
      id: 8,
      category: 'ai',
      question: 'How does the AI assistant work?',
      answer: 'Our AI assistant, powered by advanced language models, can help you understand question patterns, provide study tips, explain concepts, and recommend relevant papers based on your study goals. Simply ask questions in natural language.'
    },
    {
      id: 9,
      category: 'ai',
      question: 'Is the AI assistant free to use?',
      answer: 'Yes! All AI assistant features are completely free for all registered users. You can access unlimited queries, detailed explanations, and personalized study assistance at no cost.'
    },
    {
      id: 11,
      category: 'privacy',
      question: 'How is my data protected?',
      answer: 'We use industry-standard encryption to protect your data. Your personal information is never shared with third parties without your consent. All uploaded papers are scanned for viruses and stored securely.'
    },
    {
      id: 12,
      category: 'privacy',
      question: 'Do you store my chat conversations with the AI?',
      answer: 'Chat conversations are stored temporarily to provide context for ongoing discussions. You can delete your chat history at any time from your account settings. We never use your conversations to train our models without explicit consent.'
    },
    {
      id: 13,
      category: 'general',
      question: 'Which universities and courses are supported?',
      answer: 'We support papers from major Telangana universities including Osmania University for undergraduate degrees.'
    },
    {
      id: 14,
      category: 'papers',
      question: 'How often is new content added?',
      answer: 'New papers are added regularly as they become available after each exam session. Our community also contributes by uploading papers, which are verified and added to our database after quality checks.'
    }
  ];
  const toggleItem = (id) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id);
    } else {
      newOpenItems.add(id);
    }
    setOpenItems(newOpenItems);
  };
  const filteredFAQs = faqs.filter(faq => {
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    const matchesSearch = searchTerm === '' || 
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });
  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-dark via-slate-900 to-bg-dark">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              Frequently Asked <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-accent-500">Questions</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Find answers to common questions about SmartPYQ. Can't find what you're looking for? Contact our support team.
            </p>
            {/* Search Bar */}
            <div className="max-w-2xl mx-auto relative">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>
          </motion.div>
          {/* Category Filter */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-wrap justify-center gap-3 mb-12"
          >
            {categories.map((category) => {
              const IconComponent = category.icon;
              return (
                <motion.button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    selectedCategory === category.id
                      ? 'btn btn-primary btn-sm'
                      : 'btn btn-ghost btn-sm'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                  <span>{category.name}</span>
                </motion.button>
              );
            })}
          </motion.div>
          {/* FAQ List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="max-w-4xl mx-auto"
          >
            {filteredFAQs.length === 0 ? (
              <div className="text-center py-12">
                <QuestionMarkCircleIcon className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-400 mb-2">No matching questions found</h3>
                <p className="text-gray-500">Try adjusting your search terms or browse a different category.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFAQs.map((faq, index) => (
                  <motion.div
                    key={faq.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleItem(faq.id)}
                      className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-700/30 transition-colors duration-200"
                    >
                      <h3 className="text-lg font-semibold text-white pr-4">
                        {faq.question}
                      </h3>
                      <motion.div
                        animate={{ rotate: openItems.has(faq.id) ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDownIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      </motion.div>
                    </button>
                    <AnimatePresence>
                      {openItems.has(faq.id) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-4 border-t border-slate-700">
                            <p className="text-gray-300 leading-relaxed pt-4">
                              {faq.answer}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
          {/* Contact CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-center mt-16"
          >
            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 max-w-2xl mx-auto">
              <h3 className="text-2xl font-bold text-white mb-4">
                Have another question?
              </h3>
              <p className="text-gray-300 mb-6">
                Can't find the answer you're looking for? Our support team is here to help.
              </p>
              <motion.button
                onClick={() => window.location.href = '/contact'}
                className="btn btn-primary px-8 py-3 font-semibold"
              >
                Contact Support
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};
export default FAQPage;