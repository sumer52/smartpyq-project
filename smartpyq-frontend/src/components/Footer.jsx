import React from 'react';
import { Link } from 'react-router-dom';
import {
  EnvelopeIcon,
  MapPinIcon
} from '@heroicons/react/24/outline';

// Social media icons - simple inline SVG (Heroicons has no branded icons)
const LinkedInIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" clipRule="evenodd" />
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
      name: 'LinkedIn',
      icon: LinkedInIcon,
      url: 'https://www.linkedin.com/in/sumer2201'
    },
    {
      name: 'GitHub',
      icon: GitHubIcon,
      url: 'https://github.com/sumer52/smartpyq-project'
    }
  ];
  const quickLinks = [
    { name: 'Upload Paper', to: '/upload' },
    { name: 'My Uploaded Papers', to: '/my-papers' },
    { name: 'AI Assistant', to: '/ai' },
    { name: 'Search', to: '/search' },
    { name: 'PYQ Hub', to: '/pyq' },
    { name: 'Practice', to: '/practice' },
    { name: 'Admin Login', to: '/admin/login' }
  ];
  const supportLinks = [
    { name: 'Contact Us', to: '/contact' },
    { name: 'FAQ', to: '/faq' },
    { name: 'Report Issue', to: '/report-issue' },
    { name: 'Privacy Policy', to: '/privacy' },
    { name: 'Terms of Service', to: '/terms' },
    { name: 'Cookie Policy', to: '/cookies' }
  ];
  return (
    <footer className={`bg-muted-50 border-t border-line text-primary ${className}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <div className="py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <Link to="/" viewTransition className="site-header__wordmark mb-5" aria-label="SmartPYQ Home">
              <span className="site-header__mark" aria-hidden="true">S</span>
              <span>SmartPYQ</span>
            </Link>
            <p className="text-secondary mb-5 leading-relaxed text-sm">
              Previous year question papers for Osmania University, with analysis that
              shows repeated questions, exam patterns, and what to study first.
            </p>
            {/* Social Links */}
            <div className="flex space-x-2">
              {socialLinks.map((social) => {
                const IconComponent = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-primary transition-colors p-2.5 rounded-lg hover:bg-muted-100 focus:outline-hidden focus:ring-2 focus:ring-brand-500/30"
                    aria-label={`SmartPYQ on ${social.name}`}
                  >
                    <IconComponent className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
            {/* Contact Info */}
            <div className="mt-5 space-y-2 text-sm text-muted">
              <div className="flex items-center">
                <EnvelopeIcon className="h-4 w-4 mr-2" />
                <a href="mailto:smartpyq@gmail.com" className="relative inline-block hover:text-primary transition-colors after:content-[''] after:absolute after:inset-x-0 after:-inset-y-3">
                  smartpyq@gmail.com
                </a>
              </div>
              <div className="flex items-start">
                <MapPinIcon className="h-4 w-4 mr-2 mt-0.5 shrink-0" />
                <span>Hyderabad, Telangana</span>
              </div>
            </div>
          </div>
          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold mb-5 text-primary uppercase tracking-wide">Explore</h3>
            <ul className="space-y-1">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    viewTransition
                    to={link.to}
                    className="text-muted hover:text-primary transition-colors relative after:content-[''] after:absolute after:inset-x-0 after:-inset-y-2.5"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* Support */}
          <div>
            <h3 className="text-sm font-semibold mb-5 text-primary uppercase tracking-wide">Support</h3>
            <ul className="space-y-1">
              {supportLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    viewTransition
                    to={link.to}
                    className="text-muted hover:text-primary transition-colors relative after:content-[''] after:absolute after:inset-x-0 after:-inset-y-2.5"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {/* Get in touch */}
          <div>
            <h3 className="text-sm font-semibold mb-5 text-primary uppercase tracking-wide">About</h3>
            <p className="text-muted text-sm mb-4">
              Free, community-maintained, and student-run. Papers are reviewed by an
              admin before they appear in the hub.
            </p>
            <ul className="space-y-1.5 text-sm text-muted">
              <li>Free access to all papers</li>
              <li>AI analysis on uploaded papers</li>
              <li>Community contributions welcome</li>
            </ul>
          </div>
        </div>
        {/* Bottom section */}
        <div className="border-t border-line py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-y-3">
            <div className="flex flex-col md:flex-row items-center w-full md:w-auto space-y-2 md:space-y-0 md:space-x-6 text-sm text-faint">
              <p className="text-center md:text-left">
                © {currentYear} SmartPYQ
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1">
                <Link to="/privacy" viewTransition className="hover:text-primary transition-colors relative after:content-[''] after:absolute after:inset-x-0 after:-inset-y-2">
                  Privacy
                </Link>
                <Link to="/terms" viewTransition className="hover:text-primary transition-colors relative after:content-[''] after:absolute after:inset-x-0 after:-inset-y-2">
                  Terms
                </Link>
                <Link to="/cookies" viewTransition className="hover:text-primary transition-colors relative after:content-[''] after:absolute after:inset-x-0 after:-inset-y-2">
                  Cookies
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default React.memo(Footer);
