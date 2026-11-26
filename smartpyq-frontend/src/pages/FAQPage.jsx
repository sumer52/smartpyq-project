import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
      answer: 'No account is needed. Open the PYQ Hub to browse papers by course, semester and subject (or search by subject and year), use Exam Practice Mode to drill the extracted questions, and ask the AI assistant about anything you get stuck on. You can also upload a paper to contribute to the library — an admin reviews it before it is published.'
    },
    {
      id: 3,
      category: 'account',
      question: 'How do I create an account?',
      answer: 'You do not need an account to use SmartPYQ — browsing, searching, practice and uploads are all open to visitors. Only the content-management area (/admin) requires an administrator sign-in, and those credentials are issued by the site owner, never published here.'
    },
    {
      id: 4,
      category: 'account',
      question: 'I forgot my password. How can I reset it?',
      answer: 'Password resets apply to administrator accounts only. If you manage the site and are locked out, contact support from the address on our Contact page and we will help you regain access.'
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
      answer: 'Yes. Every published paper can be previewed in the browser or downloaded as a PDF, free and without signing in.'
    },
    {
      id: 7,
      category: 'papers',
      question: 'How do I upload a paper?',
      answer: 'Open the Upload page (or “My Papers”), choose a PDF or a photo of the paper, and confirm the details our analysis detects — course, subject, semester and year. Your upload is stored as pending and becomes visible to everyone once an admin approves it. You can follow its status on the same page.'
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
      answer: 'Yes. The AI assistant is free for everyone — no account required.'
    },
    {
      id: 11,
      category: 'privacy',
      question: 'How is my data protected?',
      answer: 'Traffic is encrypted in transit, and personal information is never sold or shared with third parties. Uploaded papers are checked before publication and stored on our own infrastructure. See the Privacy Policy and Cookie Policy for the full detail.'
    },
    {
      id: 12,
      category: 'privacy',
      question: 'Do you store my chat conversations with the AI?',
      answer: 'No. The AI assistant is stateless: each question is answered on its own and your conversation is not saved on our servers. Messages stay in your browser only while the chat widget is open, and “Clear chat” removes them immediately.'
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
    <div className="min-h-screen bg-linear-to-br from-bg-dark via-slate-900 to-bg-dark">
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
              Frequently Asked <span className="text-brand-300 ">Questions</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Find answers to common questions about SmartPYQ. Can't find what you're looking for? Contact our support team.
            </p>
            {/* Search Bar */}
            <div className="max-w-2xl mx-auto relative">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <label htmlFor="faq-search" className="sr-only">Search frequently asked questions</label>
                <input
                  id="faq-search"
                  type="search"
                  placeholder="Search questions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl text-white placeholder-gray-300 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all duration-200"
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
                  type="button"
                  onClick={() => setSelectedCategory(category.id)}
                  aria-pressed={selectedCategory === category.id}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                    selectedCategory === category.id
                      ? 'btn btn-primary btn-sm'
                      : 'btn btn-ghost btn-sm'
                  }`}
                >
                  <IconComponent className="w-4 h-4" aria-hidden="true" />
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
            {/* Screen-reader heading so the accordion questions (h3) never
                follow the h1 directly. */}
            <h2 className="sr-only">Frequently asked questions</h2>
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
                    <h3 className="m-0">
                      <button
                        type="button"
                        onClick={() => toggleItem(faq.id)}
                        aria-expanded={openItems.has(faq.id)}
                        aria-controls={`faq-panel-${faq.id}`}
                        className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-700/30 transition-colors duration-200"
                      >
                        <span className="text-lg font-semibold text-white pr-4">
                          {faq.question}
                        </span>
                        <motion.span
                          className="shrink-0"
                          animate={{ rotate: openItems.has(faq.id) ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDownIcon className="w-5 h-5 text-gray-300" aria-hidden="true" />
                        </motion.span>
                      </button>
                    </h3>
                    <AnimatePresence initial={false}>
                      {openItems.has(faq.id) && (
                        <motion.div
                          id={`faq-panel-${faq.id}`}
                          role="region"
                          aria-label={faq.question}
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
              <Link
                to="/contact"
                className="btn btn-primary btn-lg font-semibold"
              >
                Contact Support
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};
export default FAQPage;