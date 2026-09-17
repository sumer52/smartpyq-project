import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { stagger, cardUp, EASE } from '../lib/motion';

const STAGES = [
  'Reading question papers',
  'Extracting questions',
  'Identifying topics',
  'Comparing questions across years',
  'Detecting repeated questions',
  'Calculating topic frequency',
  'Generating exam priorities',
];

const card = 'bg-white/5 rounded-2xl border border-white/10 p-5';
const notDetected = <span className="text-gray-500 italic">Not detected</span>;

const PRIORITY_STYLE = {
  A: 'bg-red-500/20 text-red-300 border-red-400/30',
  B: 'bg-orange-500/20 text-orange-300 border-orange-400/30',
  C: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30',
  D: 'bg-white/10 text-gray-400 border-white/20',
};
const PRIORITY_EMOJI = { A: '🔥', B: '🟠', C: '🟡', D: '⚪' };
const TIER_META = {
  very_high: { icon: '🔥', label: 'Very High Priority', cls: 'text-red-300' },
  high: { icon: '🟠', label: 'High Priority', cls: 'text-orange-300' },
  medium: { icon: '🟡', label: 'Medium Priority', cls: 'text-yellow-300' },
};

const Stat = ({ icon, label, value }) => (
  <motion.div variants={cardUp} className={card}>
    <div className="text-2xl mb-1">{icon}</div>
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-gray-400 text-xs">{label}</div>
  </motion.div>
);

const PriorityBadge = ({ p, label }) => {
  if (!p) return null;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${PRIORITY_STYLE[p] || PRIORITY_STYLE.D}`}>
      {PRIORITY_EMOJI[p]} {p} · {label || ''}
    </span>
  );
};

const TopicBars = ({ topics }) => {
  if (!topics.length) return <p className="text-gray-400 text-sm">No topics detected in these papers.</p>;
  const max = topics[0].count;
  return (
    <div className="space-y-2">
      {topics.map((t, i) => (
        <div key={t.topic}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-200">{t.topic}</span>
            <span className="text-gray-400">{t.count} ({t.share}%)</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: Math.max(0.04, t.count / max) }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.07 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const AnalysisPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // papers=1,2,3 in the URL is the single source of truth for "what is being
  // analyzed" — refresh-safe and shareable. No papers = selection state.
  const paperIds = useMemo(
    () => (searchParams.get('papers') || '')
      .split(',').map(x => parseInt(x, 10)).filter(x => !Number.isNaN(x)),
    [searchParams],
  );

  const [insights, setInsights] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [reused, setReused] = useState(false);
  const [error, setError] = useState('');
  const [context] = useState(() => {
    const c = searchParams.get('ctx');
    try { return c ? JSON.parse(c) : null; } catch { return null; }
  });

  // Pipeline stage display (honest: no percentages, stages advance while the
  // single synchronous request runs; final stage shows when done).
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 700);
    return () => clearInterval(t);
  }, [analyzing]);

  // Guards against React 18 StrictMode's double-invoked effects in dev —
  // two concurrent POSTs would race on the server (SQLite lock errors).
  const inFlight = useRef(false);
  const runAnalysis = useCallback(async (ids) => {
    if (!ids.length || inFlight.current) return;
    inFlight.current = true;
    setAnalyzing(true);
    setStageIdx(0);
    setError('');
    setInsights(null);
    setQuestions([]);
    try {
      const res = await api.analyzePapersPublic(ids);
      if (res.status === 'failed') {
        setError(res.error_message || 'Analysis failed. The files may be unreadable.');
        return;
      }
      setReused(!!res.reused);
      setInsights(res.insights);
      const qs = await api.getQuestions({ paper_ids: ids.join(','), limit: 300 });
      setQuestions(qs || []);
      setStageIdx(STAGES.length - 1);
    } catch (err) {
      const detail = err?.data?.detail || err?.detail || err?.message || 'Analysis failed.';
      setError(typeof detail === 'string' ? detail : 'Analysis failed.');
    } finally {
      inFlight.current = false;
      setAnalyzing(false);
    }
  }, []);

  // Kick off automatically when navigating in with ?papers= and no result yet.
  useEffect(() => {
    if (paperIds.length && !insights && !analyzing && !error) runAnalysis(paperIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperIds.join(',')]);

  const changePapers = () => {
    setInsights(null); setQuestions([]); setError(''); setReused(false);
    searchParams.delete('papers'); searchParams.delete('ctx');
    setSearchParams({}, { replace: true });
    navigate('/pyq');
  };

  // ---- Question explorer state -------------------------------------------
  const [explorerFilter, setExplorerFilter] = useState('all');
  const [explorerYear, setExplorerYear] = useState('');
  const [explorerTopic, setExplorerTopic] = useState('');
  const [explorerType, setExplorerType] = useState('');
  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerSearchInput, setExplorerSearchInput] = useState('');
  const [detailQ, setDetailQ] = useState(null);

  const topics = useMemo(() => (insights?.topics || []).map(t => t.topic), [insights]);
  const years = useMemo(
    () => [...new Set(questions.map(q => insights?.paper_info?.find(p => p.paper_id === q.paper_id)?.year).filter(Boolean))],
    [questions, insights],
  );
  const questionTypes = useMemo(() => (insights?.question_types || []).map(t => t.type), [insights]);

  const filteredQuestions = useMemo(() => {
    let list = questions;
    if (explorerFilter === 'repeated') list = list.filter(q => (q.frequency || 1) > 1 || q.group_id);
    else if (['A', 'B', 'C', 'D'].includes(explorerFilter)) list = list.filter(q => q.priority === explorerFilter);
    if (explorerYear) list = list.filter(q => q.years_asked?.includes(Number(explorerYear)));
    if (explorerTopic) list = list.filter(q => q.topic === explorerTopic);
    if (explorerType) list = list.filter(q => q.question_type === explorerType);
    if (explorerSearch) {
      const s = explorerSearch.toLowerCase();
      list = list.filter(q => (q.question_text || '').toLowerCase().includes(s));
    }
    return list;
  }, [questions, explorerFilter, explorerYear, explorerTopic, explorerType, explorerSearch]);

  const openDetail = async (qid) => {
    try {
      const d = await api.getQuestionDetail(qid, paperIds);
      setDetailQ(d);
    } catch (e) {
      // Fallback: show what the explorer row already knows.
      const local = questions.find(q => q.id === qid);
      if (local) setDetailQ(local);
    }
  };

  const practiceUrl = `/practice?papers=${paperIds.join(',')}`;

  const breadcrumb = context
    ? [context.stream, context.spec, context.semester, context.subject].filter(Boolean).join(' → ')
    : null;
  const analyzedYears = insights?.paper_info?.map(p => p.year).filter(Boolean) || context?.years || [];

  // ---- Render: selection (no ?papers=) -----------------------------------
  if (!paperIds.length && !insights) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">PYQ <span className="text-brand-gradient">Analysis</span></h1>
            <p className="text-gray-400">Select papers from the <button onClick={() => navigate('/pyq')} className="text-brand-300 underline">PYQ Hub</button> — pick the years you want, then analyze them together.</p>
          </motion.div>
          <div className={card}>
            <p className="text-gray-400">
              No papers selected. Go to the PYQ Hub, choose a subject, tick the years you want analyzed
              (large checkboxes on each year card), and press <span className="text-white font-medium">Analyze Selected Papers</span>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">PYQ <span className="text-brand-gradient">Analysis Dashboard</span></h1>
              {breadcrumb && <p className="text-gray-400 text-sm">{breadcrumb}</p>}
              {insights && (
                <p className="text-gray-300 mt-1">
                  Analysis based on <span className="text-white font-semibold">{insights.papers_analyzed} selected paper{insights.papers_analyzed > 1 ? 's' : ''}</span>
                  {analyzedYears.length > 0 && <span className="text-gray-400"> · {analyzedYears.join(' • ')}</span>}
                  {reused && <span className="ml-2 text-xs text-green-400">(cached result)</span>}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigate('/pyq')} className="btn btn-secondary">Back to PYQs</button>
              <button onClick={changePapers} className="btn btn-secondary">Change Papers</button>
              <button onClick={() => navigate(practiceUrl)} disabled={!paperIds.length}
                className="btn btn-primary disabled:opacity-40">Practice These Questions</button>
            </div>
          </div>
        </motion.div>

        {/* Loading stages */}
        {analyzing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={card + ' mb-6'}>
            <h2 className="text-lg font-semibold text-white mb-4">Analyzing your selected PYQs...</h2>
            <ul className="space-y-2">
              {STAGES.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm">
                  <span className={i < stageIdx ? 'text-green-400' : i === stageIdx ? 'text-brand-400' : 'text-gray-600'}>
                    {i < stageIdx ? '✓' : i === stageIdx ? '●' : '○'}
                  </span>
                  <span className={i <= stageIdx ? 'text-gray-200' : 'text-gray-600'}>{s}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-400/30 text-red-300 rounded-xl p-4 mb-6 text-sm">
            {error}
            <div className="mt-3 flex gap-2">
              <button onClick={() => runAnalysis(paperIds)} className="btn btn-sm btn-secondary">Retry</button>
              <button onClick={changePapers} className="btn btn-sm btn-secondary">Choose different papers</button>
            </div>
          </div>
        )}

        {!analyzing && insights && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {insights.single_paper_note && (
              <div className="bg-brand-500/10 border border-brand-500/30 text-brand-200 rounded-xl p-4 text-sm">{insights.single_paper_note}</div>
            )}

            {/* Overview cards (spec section 6) — all real counts */}
            <motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" variants={stagger(0.06)} initial="hidden" animate="visible">
              <Stat icon="📄" label="Questions Analyzed" value={insights.total_questions} />
              <Stat icon="✨" label="Unique Questions" value={insights.unique_questions ?? '—'} />
              <Stat icon="🔁" label="Repeated Questions" value={insights.repeated_count} />
              <Stat icon="📚" label="Important Topics" value={(insights.topic_tiers || []).filter(t => t.tier).length} />
              <Stat icon="⭐" label="High-Priority Questions" value={insights.high_priority_count ?? '—'} />
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Repeated questions (spec section 7) */}
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-4">🔥 Frequently Repeated</h2>
                {insights.repeated_questions.length === 0 ? (
                  <p className="text-gray-400 text-sm">
                    {insights.multi_paper ? 'No repeated questions found across these papers.' : insights.single_paper_note}
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
                    {insights.repeated_questions.map(r => (
                      <div key={r.group_id} className="bg-white/5 rounded-xl p-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {r.priority && <PriorityBadge p={r.priority} label={r.priority_label} />}
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-gray-300 text-xs">
                            {r.similarity === 'Exactly repeated' ? 'Exactly repeated' : 'Conceptually repeated'}
                          </span>
                          <span className="text-gray-400 text-xs">Frequency: {r.frequency}×</span>
                        </div>
                        <p className="text-white text-sm font-medium mb-2">{r.representative_text}</p>
                        <p className="text-gray-500 text-xs mb-2">Appeared in: {r.occurrences.map(o => o.year || o.paper_title || 'Paper').join(' • ')}</p>
                        <ul className="space-y-1">
                          {r.occurrences.map((o, i) => (
                            <li key={i} className="text-gray-400 text-xs">
                              <span className="text-gray-300 font-medium">{o.year || o.paper_title || 'Paper'}:</span> {o.question_text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Frequency table (spec section 8) */}
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-4">Question Frequency</h2>
                {(insights.frequency_table || []).length === 0 ? (
                  <p className="text-gray-400 text-sm">No questions extracted.</p>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-400 border-b border-white/10">
                            <th className="py-2 pr-4">Question</th>
                            <th className="py-2 pr-4 text-right">Frequency</th>
                            <th className="py-2 pr-4">Years</th>
                            <th className="py-2">Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {insights.frequency_table.slice(0, 12).map((r, i) => (
                            <tr key={i} className="border-b border-white/5">
                              <td className="py-2 pr-4 text-gray-200 max-w-[22rem] truncate" title={r.question}>{r.question}</td>
                              <td className="py-2 pr-4 text-right text-white font-medium">{r.frequency}</td>
                              <td className="py-2 pr-4 text-gray-400 text-xs">{r.years?.join(', ') || notDetected}</td>
                              <td className="py-2"><PriorityBadge p={r.priority} label={r.priority_label} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile cards */}
                    <div className="md:hidden space-y-2">
                      {insights.frequency_table.slice(0, 12).map((r, i) => (
                        <div key={i} className="bg-white/5 rounded-xl p-3">
                          <p className="text-gray-200 text-sm mb-1">{r.question}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span className="text-white font-medium">{r.frequency}×</span>
                            <span>{r.years?.join(', ') || '—'}</span>
                            <PriorityBadge p={r.priority} label={r.priority_label} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Important topics by tier (spec section 9) */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white mb-4">Important Topics</h2>
              {(insights.topic_tiers || []).filter(t => t.tier).length === 0 ? (
                <p className="text-gray-400 text-sm">Not enough topic evidence yet — analyze more papers from this subject.</p>
              ) : (
                <div className="grid md:grid-cols-3 gap-4">
                  {['very_high', 'high', 'medium'].map(tier => {
                    const meta = TIER_META[tier];
                    const items = insights.topic_tiers.filter(t => t.tier === tier);
                    if (!items.length) return null;
                    return (
                      <div key={tier} className="bg-white/5 rounded-xl p-4">
                        <h3 className={`text-sm font-semibold mb-3 ${meta.cls}`}>{meta.icon} {meta.label}</h3>
                        <ul className="space-y-2">
                          {items.map(t => (
                            <li key={t.topic} className="text-sm">
                              <span className="text-gray-200">{t.topic}</span>
                              <p className="text-gray-500 text-xs">
                                {t.papers_count} of {insights.papers_analyzed} papers · {t.count} question{t.count > 1 ? 's' : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Topic frequency bars (spec section 10) */}
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-4">Topic Frequency</h2>
                <TopicBars topics={insights.topics} />
              </div>

              {/* Question types (spec section 12) */}
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-4">Question Pattern</h2>
                {insights.question_types.length ? (
                  <div className="space-y-2">
                    {insights.question_types.map(t => (
                      <div key={t.type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-200 capitalize">{(t.type || '').replace('_', ' ')}</span>
                          <span className="text-gray-400">{t.count} ({Math.round(100 * t.count / Math.max(1, insights.total_questions))}%)</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
                            style={{ width: Math.round(100 * t.count / Math.max(1, insights.total_questions)) + '%' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-sm">No questions extracted.</p>}
              </div>
            </div>

            {/* Marks / weightage (spec section 13) — only when marks exist */}
            {(insights.marks_weightage || []).length > 0 && (
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-4">High-Weight Topics</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {insights.marks_weightage.slice(0, 6).map(m => (
                    <div key={m.topic} className="bg-white/5 rounded-xl p-4">
                      <p className="text-white text-sm font-medium mb-1">{m.topic}</p>
                      <p className="text-gray-400 text-xs">Average marks: <span className="text-white font-semibold">{m.average_marks}</span></p>
                      <p className="text-gray-500 text-xs">{m.appearances} appearances · total {m.total_marks} · max {m.max_marks}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Year-wise pattern (spec section 11) */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white mb-4">Year-wise Pattern</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {insights.year_wise.map(y => (
                  <div key={y.paper_id} className="bg-white/5 rounded-xl p-4">
                    <p className="text-white text-sm font-medium">{y.year || notDetected}</p>
                    <p className="text-gray-500 text-xs mb-2 truncate">{y.title}</p>
                    <p className="text-gray-300 text-xs mb-1">{y.question_count} questions</p>
                    <ul className="text-gray-400 text-xs space-y-0.5">
                      {y.major_topics.map(t => <li key={t.topic}>{t.topic}: {t.count}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Exam focus areas (spec section 15) */}
            {insights.multi_paper && (
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-1">🎯 Exam Focus Areas</h2>
                <p className="text-gray-500 text-xs mb-4">High priority based on historical PYQ recurrence — this is not a guaranteed prediction.</p>
                {insights.predictions.length ? (
                  <div className="space-y-2">
                    {insights.predictions.map(p => (
                      <div key={p.topic} className="bg-white/5 rounded-xl p-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-white text-sm font-medium">{p.topic}</span>
                          <p className="text-gray-400 text-xs mt-0.5">
                            {p.tier === 'very_high' ? 'High historical recurrence' : p.tier === 'high' ? 'Strong historical pattern' : 'Frequently asked'}
                            {' · '}appeared in {p.papers_count} of {insights.papers_analyzed} analyzed papers
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-200 text-xs">worth prioritizing</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-sm">Not enough overlapping topics yet — analyze more papers from the same subject.</p>}
              </div>
            )}

            {/* Question explorer (spec section 16) */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white mb-4">Question Explorer</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  ['all', 'All'], ['repeated', 'Repeated'], ['A', '🔥 Priority A'], ['B', '🟠 Priority B'],
                  ['C', '🟡 Priority C'], ['D', '⚪ Priority D'],
                ].map(([key, label]) => (
                  <button key={key} onClick={() => setExplorerFilter(key)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${explorerFilter === key ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <select value={explorerYear} onChange={e => setExplorerYear(e.target.value)}
                  className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300">
                  <option value="">All years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={explorerTopic} onChange={e => setExplorerTopic(e.target.value)}
                  className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300">
                  <option value="">All topics</option>
                  {topics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={explorerType} onChange={e => setExplorerType(e.target.value)}
                  className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-gray-300">
                  <option value="">All types</option>
                  {questionTypes.map(t => <option key={t} value={t}>{(t || '').replace('_', ' ')}</option>)}
                </select>
                <form className="relative" onSubmit={e => { e.preventDefault(); setExplorerSearch(explorerSearchInput); }}>
                  <input value={explorerSearchInput} onChange={e => setExplorerSearchInput(e.target.value)}
                    placeholder="Search questions..."
                    className="text-xs bg-white/5 border border-white/10 rounded-lg pl-3 pr-8 py-1.5 text-gray-200 placeholder-gray-500 w-44" />
                  {explorerSearch && (
                    <button type="button" onClick={() => { setExplorerSearch(''); setExplorerSearchInput(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs">✕</button>
                  )}
                </form>
              </div>
              {filteredQuestions.length === 0 ? (
                <p className="text-gray-400 text-sm">No questions match these filters.</p>
              ) : (
                <div className="space-y-2 max-h-[30rem] overflow-y-auto pr-1">
                  {filteredQuestions.map(q => (
                    <button key={q.id} onClick={() => openDetail(q.id)}
                      className="w-full text-left bg-white/5 rounded-xl p-3 hover:bg-white/10 transition-colors">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {q.topic && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">{q.topic}</span>}
                        {q.priority && <PriorityBadge p={q.priority} label="" />}
                        {q.frequency > 1 && <span className="text-[10px] text-orange-300">appeared {q.frequency}×</span>}
                      </div>
                      <p className="text-gray-200 text-sm">{q.question_text}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => {
                const blob = new Blob([JSON.stringify(insights, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'pyq-analysis.json';
                a.click();
                URL.revokeObjectURL(a.href);
              }} className="btn btn-secondary">Download Report (JSON)</button>
              <button onClick={() => navigate('/repeated-questions')} className="btn btn-secondary">View Repeated Questions</button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Question detail modal (spec section 17) */}
      {detailQ && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setDetailQ(null)}>
          <div className="relative bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-white/20 shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-gray-900 z-10">
              <h3 className="text-white font-semibold">Question Detail</h3>
              <button onClick={() => setDetailQ(null)} className="text-gray-400 hover:text-white text-2xl leading-none px-2" aria-label="Close">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Question</p>
                <p className="text-white">{detailQ.question_text}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Topic</p>
                  <p className="text-gray-200">{detailQ.topic || notDetected}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Frequency</p>
                  <p className="text-gray-200">{detailQ.frequency} time{(detailQ.frequency || 1) > 1 ? 's' : ''}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Asked In</p>
                  <p className="text-gray-200">{(detailQ.years_asked?.length ? detailQ.years_asked : [detailQ.paper_year]).filter(Boolean).join(' • ') || notDetected}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Historical Priority</p>
                  {detailQ.priority
                    ? <PriorityBadge p={detailQ.priority} label={detailQ.priority_label} />
                    : <span className="text-gray-400">Single occurrence — low historical priority</span>}
                </div>
              </div>
              {(detailQ.marks || detailQ.question_type) && (
                <div className="flex gap-2">
                  {detailQ.marks && <span className="bg-white/10 text-gray-300 text-xs px-2 py-1 rounded">{detailQ.marks} marks</span>}
                  {detailQ.question_type && <span className="bg-white/10 text-gray-300 text-xs px-2 py-1 rounded capitalize">{detailQ.question_type.replace('_', ' ')}</span>}
                </div>
              )}
              {(detailQ.related?.length || 0) > 1 && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wide mb-2">Related Questions (same concept)</p>
                  <ul className="space-y-2">
                    {detailQ.related.filter(r => r.question_id !== detailQ.id).map(r => (
                      <li key={r.question_id} className="bg-white/5 rounded-lg p-3 text-sm">
                        <p className="text-gray-200">{r.question_text}</p>
                        <p className="text-gray-500 text-xs mt-1">
                          {r.year || r.paper_title || 'Paper'}{r.is_exact_match === false ? ' · conceptually repeated' : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button onClick={() => { setDetailQ(null); navigate(`/practice?papers=${paperIds.join(',')}&q=${detailQ.id}`); }}
                className="btn btn-primary btn-block">Practice This Question</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisPage;
