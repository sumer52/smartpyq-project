import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, BookOpen, Brain } from 'lucide-react';
import api from '../lib/api';
import SpotlightCard from '../components/ui/SpotlightCard';
import GlowEffect from '../components/ui/GlowEffect';
import MagneticButton from '../components/ui/MagneticButton';
import CursorGlow from '../components/ui/CursorGlow';
import TextScramble from '../components/ui/TextScramble';

const SEARCH_PLACEHOLDERS = [
  'Search normalization in DBMS...',
  'Search Data Structures algorithms...',
  'Search Semester 3 PYQ papers...',
  'Search 2025 Question Paper...',
  'Search SQL queries and joins...',
  'Search Computer Networks OSI model...',
  'Search Operating Systems deadlock...',
  'Search Software Engineering SDLC...',
];

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22,1,0.36,1] } } };
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const cardUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } };


const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderText, setPlaceholderText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const abortRef = useRef(null);

  // Rotating placeholder animation
  React.useEffect(() => {
    const currentWord = SEARCH_PLACEHOLDERS[placeholderIdx];
    let timeout;

    if (isTyping) {
      if (placeholderText.length < currentWord.length) {
        timeout = setTimeout(() => {
          setPlaceholderText(currentWord.substring(0, placeholderText.length + 1));
        }, 50);
      } else {
        timeout = setTimeout(() => setIsTyping(false), 2000);
      }
    } else {
      if (placeholderText.length > 0) {
        timeout = setTimeout(() => {
          setPlaceholderText(placeholderText.substring(0, placeholderText.length - 1));
        }, 30);
      } else {
        setPlaceholderIdx((prev) => (prev + 1) % SEARCH_PLACEHOLDERS.length);
        setIsTyping(true);
      }
    }
    return () => clearTimeout(timeout);
  }, [placeholderText, isTyping, placeholderIdx]);

  // Stop animation when user types
  const handleFocus = () => { setPlaceholderText(''); };
  const handleBlur = () => { if (!query) { setPlaceholderText(''); setIsTyping(true); } };

  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    // Cancel any stale request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchQuestions(query.trim());
      setResults(data || []);
    } catch (err) {
      if (err?.name !== 'AbortError') { console.error(err); setResults([]); }
    }
    finally { setLoading(false); }
  }, [query]);

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Search className="h-5 w-5 text-indigo-400" />
            </div>
            <h1 className="text-3xl font-bold text-white"><TextScramble text="Question Search" delay={100} /></h1>
          </div>
          <p className="text-gray-400 ml-13">Search through all extracted questions by keyword, subject, topic, or concept.</p>
        </motion.div>

        <GlowEffect className="mb-8" color="rgba(99,102,241,0.12)" size={400}>
          <form onSubmit={handleSearch}>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  onFocus={handleFocus} onBlur={handleBlur}
                  placeholder={!query ? placeholderText : ''}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 sm:py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50 min-h-[48px] transition-colors" />
              </div>
              <MagneticButton type="submit" disabled={loading}
                className="btn btn-primary px-6 py-3.5 sm:py-3 min-h-[48px] w-full sm:w-auto">
                {loading ? 'Searching...' : 'Search'}
              </MagneticButton>
            </div>
          </form>
        </GlowEffect>

        {/* Loading State */}
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 animate-pulse">
                <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
                <div className="flex gap-2">
                  <div className="h-5 bg-white/10 rounded w-20" />
                  <div className="h-5 bg-white/10 rounded w-16" />
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Results */}
        {searched && !loading && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-400 text-sm">
                <span className="text-white font-medium">{results.length}</span> result{results.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <AnimatePresence mode="wait">
              {results.length > 0 ? (
                <motion.div key="results" className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {results.map((q, i) => (
                    <CursorGlow key={q.id} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4" glowColor="rgba(99,102,241,0.1)">
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <FileText className="h-4 w-4 text-indigo-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm sm:text-base leading-relaxed">{q.question_text}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {q.subject && <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-1 rounded-full">{q.subject}</span>}
                              {q.marks && <span className="bg-white/10 text-gray-400 text-xs px-2 py-1 rounded-full">{q.marks} marks</span>}
                              {q.stream && <span className="bg-purple-500/15 text-purple-400 text-xs px-2 py-1 rounded-full">{q.stream}</span>}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </CursorGlow>
                  ))}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="h-8 w-8 text-gray-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">No questions found</h3>
                  <p className="text-gray-400 text-sm max-w-md mx-auto">Try different keywords, check your spelling, or search by subject name, topic, or concept.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Initial State - Not searched yet */}
        {!searched && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
              {[
                { icon: BookOpen, title: 'By Subject', desc: 'Search by course subject name', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { icon: Brain, title: 'By Topic', desc: 'Search by specific topic or concept', color: 'text-purple-400', bg: 'bg-purple-500/10' },
                { icon: FileText, title: 'By Keyword', desc: 'Search by any keyword in questions', color: 'text-green-400', bg: 'bg-green-500/10' },
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  className="p-4 bg-white/[0.03] rounded-xl border border-white/5">
                  <item.icon className={`h-6 w-6 ${item.color} mx-auto mb-2`} />
                  <h4 className="text-sm font-medium text-white mb-1">{item.title}</h4>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};
export default SearchPage;
