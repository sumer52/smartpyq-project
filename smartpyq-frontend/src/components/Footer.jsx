import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  HeartIcon,
  CheckCircleIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
// Social media icons - using simple SVG since Heroicons doesn't have branded icons
const FacebookIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
  </svg>
);
const TwitterIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
  </svg>
);
const InstagramIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M12.017 0C8.396 0 7.989.013 7.041.048 6.094.082 5.52.204 5.036.388a3.9 3.9 0 00-1.423.923A3.9 3.9 0 00.388 5.036c-.184.484-.306 1.058-.34 2.005C.013 7.989 0 8.396 0 12.017s.013 4.028.048 4.976c.034.947.156 1.521.34 2.005a3.9 3.9 0 00.923 1.423 3.9 3.9 0 001.423.923c.484.184 1.058.306 2.005.34.948.035 1.355.048 4.976.048s4.028-.013 4.976-.048c.947-.034 1.521-.156 2.005-.34a3.9 3.9 0 001.423-.923 3.9 3.9 0 00.923-1.423c.184-.484.306-1.058.34-2.005.035-.948.048-1.355.048-4.976s-.013-4.028-.048-4.976c-.034-.947-.156-1.521-.34-2.005a3.9 3.9 0 00-.923-1.423A3.9 3.9 0 0018.982.388c-.484-.184-1.058-.306-2.005-.34C16.029.013 15.622 0 12.017 0zm0 2.162c3.204 0 3.584.012 4.85.07.3.012.611.054.918.114.469.181.823.398 1.15.748.35.35.566.681.748 1.15.137.459.198.918.114.918.07 1.266.07 4.85 0 3.584-.012 4.85-.07.3-.012.611-.054.918-.114.469-.181.823-.398 1.15-.748.35-.35.566-.681.748-1.15.137-.459.198-.918.114-.918-.07-1.266-.07-4.85 0-3.584.012-4.85.07-.3.012-.611.054-.918.114-.469.181-.823.398-1.15.748-.35.35-.566.681-.748 1.15-.137.459-.198.918-.114.918.07 1.266.07 4.85 0 3.584-.012 4.85-.07zm-1.85 9.97a2.8 2.8 0 110-5.6 2.8 2.8 0 010 5.6zm0-7.425a4.625 4.625 0 100 9.25 4.625 4.625 0 000-9.25zm5.228-.267a1.08 1.08 0 11-2.16 0 1.08 1.08 0 012.16 0z" clipRule="evenodd" />
  </svg>
);
const LinkedInIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" clipRule="evenodd" />
  </svg>
);
const YouTubeIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M19.812 5.418c.861.23 1.538.907 1.768 1.768C21.998 8.746 22 12 22 12s0 3.255-.418 4.814a2.504 2.504 0 0 1-1.768 1.768c-1.56.419-7.814.419-7.814.419s-6.255 0-7.814-.419a2.505 2.505 0 0 1-1.768-1.768C2 15.255 2 12 2 12s0-3.255.417-4.814a2.507 2.507 0 0 1 1.768-1.768C5.744 5 11.998 5 11.998 5s6.255 0 7.814.418ZM15.194 12 10 15V9l5.194 3Z" clipRule="evenodd" />
  </svg>
);
const GitHubIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
  </svg>
);
const Footer = ({ className = "" }) => {
  const currentYear = new Date().getFullYear();
  const socialLinks = [
    {
      name: 'Facebook',
      icon: FacebookIcon,
      url: 'https://facebook.com/smartpyq',
      color: 'hover:text-blue-300'
    },
    {
      name: 'Twitter',
      icon: TwitterIcon,
      url: 'https://twitter.com/smartpyq',
      color: 'hover:text-blue-400'
    },
    {
      name: 'Instagram',
      icon: InstagramIcon,
      url: 'https://instagram.com/smartpyq',
      color: 'hover:text-pink-600'
    },
    {
      name: 'LinkedIn',
      icon: LinkedInIcon,
      url: 'https://linkedin.com/company/smartpyq',
      color: 'hover:text-blue-300'
    },
    {
      name: 'YouTube',
      icon: YouTubeIcon,
      url: 'https://youtube.com/@smartpyq',
      color: 'hover:text-red-600'
    },
    {
      name: 'GitHub',
      icon: GitHubIcon,
      url: 'https://github.com/smartpyq',
      color: 'hover:text-white'
    }
  ];
  const quickLinks = [
    { name: 'Upload Paper', to: '/upload' },
    { name: 'AI Assistant', to: '/ai' },
    { name: 'Search', to: '/search' },
    { name: 'PYQ Hub', to: '/pyq' },
    { name: 'Dashboard', to: '/dashboard' }
  ];
  const supportLinks = [
    { name: 'Contact Us', to: '/contact' },
    { name: 'FAQ', to: '/faq' },
    { name: 'Report Issue', to: '/report-issue' },
    { name: 'Privacy Policy', to: '/privacy' },
    { name: 'Terms of Service', to: '/terms' },
    { name: 'Cookie Policy', to: '/cookies' },
    { name: 'Accessibility', to: '/accessibility' },
    { name: 'Acceptable Use', to: '/acceptable-use' }
  ];
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };
  return (
    <footer className={`bg-black/30 backdrop-blur-xl border-t border-white/10 text-white ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <motion.div
          className="py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {/* PYQ Portal - Brand Column */}
          <motion.div variants={itemVariants} className="lg:col-span-1">
            <div className="mb-6">
              <Link to="/" className="flex items-center group">
                <img src="/logo.png" alt="SmartPYQ" className="h-12 sm:h-14 md:h-16 w-auto object-contain group-hover:scale-105 transition-transform"  />
              </Link>
            </div>
            <p className="text-gray-300 mb-6 leading-relaxed">
              Your intelligent companion for accessing previous year question papers.
              SmartPYQ identifies repeated questions, exam patterns, and important topics to help you prepare smarter.
            </p>
            {/* Social Links */}
            <div className="flex space-x-4">
              {socialLinks.map((social) => {
                const IconComponent = social.icon;
                return (
                  <motion.a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-gray-500 ${social.color} transition-colors p-2 rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-brand-500/30`}
                    aria-label={`Follow us on ${social.name}`}
                  >
                    <IconComponent className="h-5 w-5" />
                  </motion.a>
                );
              })}
            </div>
            {/* Contact Info */}
            <div className="mt-6 space-y-2 text-sm text-gray-500">
              <div className="flex items-center">
                <EnvelopeIcon className="h-4 w-4 mr-2" />
                <a href="mailto:smartpyq@gmail.com" className="hover:text-white transition-colors">
                  smartpyq@gmail.com
                </a>
              </div>

              <div className="flex items-start">
                <MapPinIcon className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                <span>Hyderabad, Telangana</span>
              </div>
            </div>
          </motion.div>
          {/* Quick Links */}
          <motion.div variants={itemVariants}>
            <h3 className="text-lg font-semibold mb-6 text-white/90">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.to}
                    className="text-gray-400 hover:text-white transition-colors flex items-center group"
                  >
                    <span className="group-hover:translate-x-1 transition-transform">
                      {link.name}
                    </span>
                    <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
          {/* Support */}
          <motion.div variants={itemVariants}>
            <h3 className="text-lg font-semibold mb-6 text-white/90">Support</h3>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.to}
                    className="text-gray-300 hover:text-white transition-colors flex items-center group"
                  >
                    <span className="group-hover:translate-x-1 transition-transform">
                      {link.name}
                    </span>
                    <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
            </ul>
            {/* Additional Support Info */}
            <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
              <h4 className="font-medium text-white mb-2">Need Help?</h4>
              <p className="text-sm text-gray-300 mb-3">
                Our team is here to help with any questions about SmartPYQ.
              </p>
              <Link
                to="/contact"
                className="inline-flex items-center text-sm text-brand-400 hover:text-brand-300 transition-colors"
              >
                Contact Support
                <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1" />
              </Link>
            </div>
          </motion.div>
          {/* Contact Info */}
          <motion.div variants={itemVariants}>
            <h3 className="text-lg font-semibold mb-6 text-white/90">Get in Touch</h3>
            <p className="text-gray-400 mb-4">
              Questions or feedback? We are here to support your exam preparation journey.
            </p>
            <div className="space-y-3">
              <div className="flex items-center">
                <ChatBubbleLeftRightIcon className="h-5 w-5 mr-3 text-brand-400" />
                <span className="text-gray-400">AI Study Assistant available for instant help</span>
              </div>
            </div>
            {/* Features */}
            <div className="mt-6 space-y-2 text-sm text-gray-400">
              <div className="flex items-center">
                <CheckCircleIcon className="h-4 w-4 mr-2 text-green-400" />
                <span>Free access to previous year question papers</span>
              </div>
              <div className="flex items-center">
                <CheckCircleIcon className="h-4 w-4 mr-2 text-green-400" />
                <span>AI-powered study guidance and concept explanations</span>
              </div>
              <div className="flex items-center">
                <CheckCircleIcon className="h-4 w-4 mr-2 text-green-400" />
                <span>Community-contributed question papers</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
        {/* Bottom section */}
        <motion.div
          className="border-t border-gray-800 py-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-center gap-y-4 md:gap-y-0">
            <div className="flex flex-col md:flex-row items-center w-full md:w-auto space-y-2 md:space-y-0 md:space-x-6 text-sm text-gray-500">
              <p className="text-center md:text-left">
                © {currentYear} SmartPYQ. All rights reserved.
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1">
                <Link to="/privacy" className="hover:text-white transition-colors">
                  Privacy
                </Link>
                <span>•</span>
                <Link to="/terms" className="hover:text-white transition-colors">
                  Terms
                </Link>
                <span>•</span>
                <Link to="/cookies" className="hover:text-white transition-colors">
                  Cookies
                </Link>
                <span>•</span>
                <Link to="/accessibility" className="hover:text-white transition-colors">
                  Accessibility
                </Link>
                <span>•</span>
                <Link to="/acceptable-use" className="hover:text-white transition-colors">
                  Acceptable Use
                </Link>
              </div>
            </div>
            <div className="flex items-center text-sm text-gray-400">
              <span className="text-gray-500">Made with</span>
              <motion.div
                className="mx-1"
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 3
                }}
              >
                <HeartIcon className="h-4 w-4 text-red-500" />
              </motion.div>
              <span className="text-gray-500">for students preparing for exams</span>
            </div>
          </div>
          {/* Additional Credits */}
          <div className="mt-4 pt-4 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-400">
              Built with ❤️ for Osmania University students • SmartPYQ 2024–2026
            </p>
          </div>
        </motion.div>
      </div>
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-brand-500/5 to-accent-500/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-accent-500/5 to-brand-500/5 rounded-full blur-3xl"></div>
      </div>
    </footer>
  );
};
export default memo(Footer);