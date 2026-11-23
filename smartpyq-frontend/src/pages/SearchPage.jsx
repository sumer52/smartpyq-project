import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, FileText, BookOpen, Flame, ExternalLink, ArrowRight, X } from 'lucide-react';
import api from '../lib/api';
import GlowEffect from '../components/ui/GlowEffect';
import MagneticButton from '../components/ui/MagneticButton';

const EXAMPLES = ['DBMS 2023', 'Data Structures', 'Computer Networks', 'Physics'];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Highlight the searched words inside a snippet. */
const Highlight = ({ text, terms }) => {
  const list = (terms || []).filter(Boolean);
  if (!list.length || !text) return text;
  const pattern = new RegExp(`(${list.map(escapeRegExp).join('|')})`, 'gi');
  const lowered = new Set(list.map((t) => t.toLowerCase()));
  return text.split(pattern).map((part, i) =>
    lowered.has(part.toLowerCase())
      ? <mark key={i} className="bg-brand-500/30 text-white rounded px-0.5">{part}</mark>
      : <React.Fragment key={i}>{part}</React.Fragment>,
  );
};

const prettySemester = (name) => {
  const match = /^sem(?:ester)?\s*(\d+)$/i.exec(name || '');
  return match ? `Sem ${match[1]}` : name || '';
};

const formatFileSize = (bytes) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';

  const [draft, setDraft] = useState(q);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  useEffect(() => { setDraft(q); }, [q]);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      setLoading(false);
      setError('');
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    setLoading(true);
    setError('');
    api.searchAll(q.trim())
      .then((data) => { if (!cancelled) setResults(data); })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        console.error('Search failed:', err);
        setResults(null);
        setError("Search isn't responding right now. Please try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; controller.abort(); };
  }, [q]);

  const submit = useCallback((e) => {
    e?.preventDefault();
    const next = draft.trim();
    if (!next) return;
    setSearchParams({ q: next });
  }, [draft, setSearchParams]);

  const clear = () => { setDraft(''); setSearchParams({}); };

  const terms = results?.terms || [];
  const papers = results?.papers || [];
  const questions = results?.questions || [];
  const totalShown = papers.length + questions.length;
  const nothingFound = !!results && totalShown === 0;

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
              <Search className="h-5 w-5 text-brand-400" />
            </div>
            <h1 className="text-3xl font-bold text-white">Search</h1>
          </div>
          <p className="text-gray-400 sm:ml-13">
            Find question papers and the questions inside them — by subject, course, topic, or year.
          </p>
        </motion.div>

        <GlowEffect className="mb-8" color="rgba(241,136,99,0.12)" size={400}>
          <form onSubmit={submit} role="search">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Try “DBMS 2023”, “Operating Systems”, “B.Sc”"
                  aria-label="Search papers and questions"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-11 py-3.5 sm:py-3 text-white placeholder-gray-500 focus:outline-hidden focus:border-brand-500/50 min-h-[48px] transition-colors"
                />
                {(draft || q) && (
                  <button
                    type="button"
                    onClick={clear}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1 rounded-md"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <MagneticButton type="submit" disabled={loading} className="btn btn-primary btn-lg w-full sm:w-auto">
                {loading ? 'Searching…' : 'Search'}
              </MagneticButton>
            </div>
          </form>
        </GlowEffect>

        {error && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <p className="text-yellow-400 text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 animate-pulse">
                <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
                <div className="h-3 bg-white/10 rounded w-1/2 mb-3" />
                <div className="flex gap-2">
                  <div className="h-5 bg-white/10 rounded w-20" />
                  <div className="h-5 bg-white/10 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && results && (
          <div className="space-y-8">
            <div className="flex items-center justify-between text-sm text-gray-400">
              <p>
                {totalShown > 0
                  ? <><span className="text-white font-medium">{totalShown}</span> result{totalShown === 1 ? '' : 's'} for <span className="text-white">“{results.query}”</span></>
                  : <>No results for <span className="text-white">“{results.query}”</span></>}
              </p>
              {typeof results.took_ms === 'number' && totalShown > 0 && (
                <span className="hidden sm:inline text-xs text-gray-500">{results.took_ms} ms</span>
              )}
            </div>

            {papers.length > 0 && (
              <section aria-labelledby="papers-heading">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-accent-400" aria-hidden="true" />
                  <h2 id="papers-heading" className="text-sm font-semibold uppercase tracking-wider text-gray-300">
                    Papers ({results.counts?.papers ?? papers.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {papers.map((paper) => {
                    const meta = [
                      paper.subject,
                      paper.stream,
                      paper.specialization,
                      prettySemester(paper.semester),
                      paper.year,
                      formatFileSize(paper.file_size),
                    ].filter(Boolean);
                    return (
                      <motion.div
                        key={paper.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:border-brand-500/30 transition-colors"
                      >
                        <h3 className="text-white font-semibold leading-snug mb-1">
                          <Highlight text={paper.title} terms={terms} />
                        </h3>
                        {paper.snippet && paper.snippet !== paper.title && (
                          <p className="text-sm text-gray-400 leading-relaxed mb-3 line-clamp-2">
                            <Highlight text={paper.snippet} terms={terms} />
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          {meta.map((item) => (
                            <span key={item} className="bg-white/10 text-gray-300 text-xs px-2 py-1 rounded-full">{item}</span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link to={paper.href} className="btn btn-sm btn-primary">
                            <ExternalLink className="h-4 w-4" aria-hidden="true" /> View paper
                          </Link>
                          <Link to={`/analyze?papers=${paper.id}`} className="btn btn-sm btn-secondary">
                            <Flame className="h-4 w-4" aria-hidden="true" /> Analyze
                          </Link>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {questions.length > 0 && (
              <section aria-labelledby="questions-heading">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-brand-400" aria-hidden="true" />
                  <h2 id="questions-heading" className="text-sm font-semibold uppercase tracking-wider text-gray-300">
                    Questions ({results.counts?.questions ?? questions.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {questions.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4"
                    >
                      <p className="text-white text-sm leading-relaxed mb-2">
                        <Highlight text={item.snippet} terms={terms} />
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        {item.subject && <span className="bg-brand-500/20 text-brand-400 text-xs px-2 py-1 rounded-full">{item.subject}</span>}
                        {item.marks && <span className="bg-white/10 text-gray-400 text-xs px-2 py-1 rounded-full">{item.marks} marks</span>}
                        {item.frequency > 1 && <span className="bg-orange-500/15 text-orange-300 text-xs px-2 py-1 rounded-full">asked {item.frequency}×</span>}
                        {item.has_answer && <span className="bg-emerald-500/15 text-emerald-300 text-xs px-2 py-1 rounded-full">answer available</span>}
                        {item.paper_year && <span className="bg-white/10 text-gray-400 text-xs px-2 py-1 rounded-full">{item.paper_year}</span>}
                      </div>
                      {item.paper_title && (
                        <p className="text-xs text-gray-500 mb-3">
                          From <span className="text-gray-300">{item.paper_title}</span>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Link to={item.href} className="btn btn-sm btn-secondary">
                          <ArrowRight className="h-4 w-4" aria-hidden="true" /> View paper
                        </Link>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Nothing found: point somewhere useful and say the gap was noted */}
            {nothingFound && (
              <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                  <Search className="h-8 w-8 text-gray-500" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">No papers or questions matched</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto mb-5">
                  Try fewer words, a subject name, or a year on its own — for example “Physics” or “2024”.
                  We&apos;ve recorded this search so the missing content can be added.
                </p>
                <Link to="/pyq" className="btn btn-secondary">Browse the PYQ Hub</Link>
              </div>
            )}
          </div>
        )}

        {/* Initial state */}
        {!loading && !results && !error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <p className="text-gray-400 text-sm mb-6">Search across every published paper and its extracted questions.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setSearchParams({ q: example })}
                  className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-gray-300 hover:text-white hover:border-brand-500/40 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-10">
              {[
                { icon: FileText, title: 'Papers', desc: 'Full papers with a link straight to them', color: 'text-accent-400', bg: 'bg-accent-500/10' },
                { icon: BookOpen, title: 'Questions', desc: 'Individual questions with the paper they came from', color: 'text-brand-400', bg: 'bg-brand-500/10' },
                { icon: Flame, title: 'Repeats', desc: 'Questions asked across several years are ranked higher', color: 'text-orange-400', bg: 'bg-orange-500/10' },
              ].map((item) => (
                <div key={item.title} className={`p-4 rounded-xl border border-white/5 ${item.bg}`}>
                  <item.icon className={`h-6 w-6 ${item.color} mx-auto mb-2`} aria-hidden="true" />
                  <h4 className="text-sm font-medium text-white mb-1">{item.title}</h4>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default SearchPage;
