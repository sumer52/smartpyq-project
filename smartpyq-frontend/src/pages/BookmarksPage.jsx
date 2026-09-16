import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import localBookmarks from '../lib/localBookmarks';

/**
 * Saved Questions — fully public, client-side bookmarks.
 *
 * Anyone can save questions without an account; they persist in this
 * browser via localStorage and sync across tabs.
 */
const BookmarksPage = () => {
  const [bookmarks, setBookmarks] = useState([]);
  const [expandedSubject, setExpandedSubject] = useState(null);

  const refresh = useCallback(() => {
    const list = localBookmarks.list();
    setBookmarks(list);
    const subjects = [...new Set(list.map((b) => b.subject || 'Uncategorized'))];
    if (subjects.length > 0) setExpandedSubject((cur) => cur ?? subjects[0]);
  }, []);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => localBookmarks.subscribe(refresh), [refresh]);

  const handleRemove = (questionId) => localBookmarks.remove(questionId);

  // Group by subject
  const grouped = bookmarks.reduce((acc, bm) => {
    const subject = bm.subject || 'Uncategorized';
    if (!acc[subject]) acc[subject] = [];
    acc[subject].push(bm);
    return acc;
  }, {});

  const subjects = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Saved <span className="text-brand-gradient">Questions</span></h1>
          <p className="text-gray-400">Questions you bookmarked for quick access, organized by subject. Saved in this browser — no account needed.</p>
        </motion.div>

        {bookmarks.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-gray-400 text-lg">No saved questions yet</p>
            <p className="text-gray-500 text-sm mt-2">Browse Repeated Questions and tap the bookmark icon &#9825; to save important questions here.</p>
            <Link to="/pyq" className="inline-block mt-6 text-indigo-400 hover:text-indigo-300 text-sm font-medium">Browse the PYQ Hub →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {subjects.map(subject => (
              <div key={subject} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
                <button
                  onClick={() => setExpandedSubject(expandedSubject === subject ? null : subject)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">{subject}</span>
                    <span className="bg-indigo-500/20 text-indigo-400 text-xs font-medium px-2 py-0.5 rounded-full">
                      {grouped[subject].length} saved
                    </span>
                  </div>
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedSubject === subject ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSubject === subject && (
                  <div className="border-t border-white/10 p-4 space-y-3">
                    {grouped[subject].map((bm, idx) => (
                      <motion.div key={bm.question_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="flex items-start justify-between gap-4 p-3 bg-white/5 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm">{bm.question_text}</p>
                          <p className="text-gray-500 text-xs mt-1">Saved {new Date(bm.saved_at).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => handleRemove(bm.question_id)}
                          className="text-gray-500 hover:text-red-400 transition-colors text-xs whitespace-nowrap">Remove</button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default BookmarksPage;
