import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { BookOpenIcon, CloudArrowUpIcon, FireIcon, HeartIcon } from '@heroicons/react/24/outline';

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22,1,0.36,1] } } };
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const cardUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } };


const DashboardPage = () => {
  const { user } = useAuth();
  const [dashData, setDashData] = useState(null);
  useEffect(() => { api.getDashboard().then(d => setDashData(d)).catch(() => {}); }, []);

  const quickActions = [
    { title: 'Browse PYQs', description: 'Explore previous year papers across courses and subjects', icon: BookOpenIcon, href: '/pyq' },
    { title: 'Upload Paper', description: 'Contribute to the growing SmartPYQ collection', icon: CloudArrowUpIcon, href: '/upload' },
    { title: 'Analyze Papers', description: 'Extract questions and discover exam patterns', icon: FireIcon, href: '/analyze' },
    { title: 'Repeated Questions', description: 'Repeated patterns and analysis history', icon: FireIcon, href: '/repeated-questions' },
    { title: 'Search Questions', description: 'Search across all extracted questions by keyword', icon: BookOpenIcon, href: '/search' },
    { title: 'Practice Mode', description: 'Test your understanding with real exam questions', icon: BookOpenIcon, href: '/practice' },
    { title: 'Saved Questions', description: 'Questions you saved for quick review', icon: HeartIcon, href: '/bookmarks' },
  ];

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Your Dashboard</h1>
          <p className="text-gray-400">Welcome back, {user?.name?.split(' ')[0] || 'Student'}. Ready to prepare smarter?</p>
        </motion.div>

        {/* Academic Profile Card */}
        {user?.specialization && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-brand-600/20 to-cyan-600/20 border border-brand-400/20 rounded-2xl p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">📚 Your Academic Profile</h3>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="bg-white/10 text-white px-3 py-1 rounded-full">🎓 {user.course || 'B.Sc'}</span>
                  <span className="bg-white/10 text-white px-3 py-1 rounded-full">📋 {user.specialization?.toUpperCase() || 'MSCS'}</span>
                  <span className="bg-white/10 text-white px-3 py-1 rounded-full">📅 {user.academic_year || '2nd Year'}</span>
                  <span className="bg-white/10 text-white px-3 py-1 rounded-full">📖 {user.semester?.replace('sem', 'Semester ') || 'Semester 3'}</span>
                </div>
              </div>
              <Link to="/profile" className="text-sm text-brand-400 hover:text-brand-300 whitespace-nowrap">
                Update Profile →
              </Link>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[ 
            { label: 'Papers Analyzed', val: dashData?.papers_analyzed || 0 },
            { label: 'Questions Found', val: dashData?.questions_extracted || 0 },
            { label: 'Repeat Patterns', val: dashData?.repeated_groups || 0 },
            { label: 'Top Subject', val: dashData?.most_repeated?.[0]?.subject || '-' },
          ].map((s, i) => (
            <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center border border-white/10">
              <div className="text-2xl font-bold text-white">{s.val}</div>
              <div className="text-xs text-gray-300">{s.label}</div>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {quickActions.map((a) => (
            <Link key={a.title} to={a.href}>
              <div className="card-nav p-5">
                <h3 className="font-semibold mb-1">{a.title}</h3>
                <p className="text-sm text-gray-400">{a.description}</p>
              </div>
            </Link>
          ))}
        </div>

        {dashData?.most_repeated?.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">High-Frequency Questions</h2>
            <div className="space-y-3">
              {dashData.most_repeated.map((q) => (
                <Link to='/repeated-questions' key={q.id}>
                  <div className="card-nav p-4 flex items-center gap-4">
                    <span className="bg-orange-500/20 text-orange-400 text-sm font-bold px-3 py-1 rounded-full">{q.frequency}x</span>
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{q.text}</p>
                      <p className="text-gray-500 text-xs">{q.subject}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
export default DashboardPage;