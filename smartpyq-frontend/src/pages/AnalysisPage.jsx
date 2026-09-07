import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';

const STAGES = [
  'Reading PDF',
  'Extracting text',
  'Detecting questions',
  'Identifying topics',
  'Classifying question types',
  'Comparing previous papers',
  'Detecting repeated questions',
  'Generating insights',
];

const card = 'bg-white/5 rounded-2xl border border-white/10 p-5';
const notDetected = <span className="text-gray-500 italic">Not detected</span>;

const Stat = ({ icon, label, value }) => (
  <div className={card}>
    <div className="text-2xl mb-1">{icon}</div>
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-gray-400 text-xs">{label}</div>
  </div>
);

const TopicBars = ({ topics }) => {
  if (!topics.length) return <p className="text-gray-400 text-sm">No topics detected in these papers.</p>;
  const max = topics[0].count;
  return (
    <div className="space-y-2">
      {topics.map(t => (
        <div key={t.topic}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-200">{t.topic}</span>
            <span className="text-gray-400">{t.count} ({t.share}%)</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-brand-500 to-accent-500 rounded-full"
              style={{ width: Math.max(4, (t.count / max) * 100) + '%' }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const AnalysisPage = () => {
  const [papers, setPapers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);
  const [insights, setInsights] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Lowercase enum value: the backend PaperStatus enum is 'approved' (PYQ Hub
    // uses the same value); 'APPROVED' fails validation and yields an empty list.
    api.getPapers({ paper_status: 'approved', per_page: 50 })
      .then(d => {
        const list = Array.isArray(d) ? d : d.papers || [];
        setPapers(list);
        // Preselect a paper passed from PYQ Hub's "Analyze Paper" button.
        const pre = Number(searchParams.get('paper'));
        if (pre && list.some(p => p.id === pre)) setSelected([pre]);
      })
      .catch(err => setLoadError(err?.message || 'Failed to load papers.'))
      .finally(() => setLoading(false));
  }, [searchParams]);

  // Advance the visible pipeline stages while the backend works.
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 700);
    return () => clearInterval(t);
  }, [analyzing]);

  const togglePaper = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const runAnalysis = async () => {
    if (selected.length === 0) return;
    setAnalyzing(true);
    setStageIdx(0);
    setError('');
    setInsights(null);
    try {
      const res = await api.startAnalysis(selected);
      if (res.status === 'failed') {
        setError(res.error_message || 'Analysis failed. The file may be unreadable.');
        return;
      }
      const data = await api.getAnalysisInsights(res.id);
      const qs = await api.getQuestions({ paper_id: selected[0], limit: 100 });
      // Questions for the remaining papers, appended in order.
      const rest = [];
      for (const pid of selected.slice(1)) {
        rest.push(...await api.getQuestions({ paper_id: pid, limit: 100 }));
      }
      setQuestions([...qs, ...rest]);
      setInsights(data);
    } catch (err) {
      setError(err?.data?.detail || err?.message || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const exportReport = () => {
    const blob = new Blob([JSON.stringify(insights, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'paper-analysis.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Paper Analysis</h1>
          <p className="text-gray-400">Select papers to extract questions, detect repeated patterns, and identify the most frequently tested topics.</p>
        </motion.div>

        {analyzing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={card + ' mb-6'}>
            <h2 className="text-lg font-semibold text-white mb-4">Analyzing {selected.length} paper(s)...</h2>
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

        {!analyzing && insights && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Stat icon="📄" label="Papers analyzed" value={insights.papers_analyzed} />
              <Stat icon="❓" label="Questions extracted" value={insights.total_questions} />
              <Stat icon="🔁" label="Repeated questions" value={insights.repeated_count} />
              <Stat icon="📚" label="Topics identified" value={insights.topics.length} />
              <div className={card + ' col-span-2 sm:col-span-1'}>
                <div className="text-2xl mb-1">⭐</div>
                <div className="text-sm font-semibold text-white truncate" title={insights.most_important_topic || ''}>
                  {insights.most_important_topic || '—'}
                </div>
                <div className="text-gray-400 text-xs">Most important topic</div>
              </div>
            </div>

            {insights.single_paper_note && (
              <div className="bg-brand-500/10 border border-brand-500/30 text-brand-200 rounded-xl p-4 text-sm">
                {insights.single_paper_note}
              </div>
            )}

            {/* Paper information */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white mb-4">Paper Information</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-white/10">
                      <th className="py-2 pr-4">Paper</th><th className="py-2 pr-4">Subject</th><th className="py-2 pr-4">Semester</th><th className="py-2 pr-4">Year</th><th className="py-2">Exam type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.paper_info.map(p => (
                      <tr key={p.paper_id} className="border-b border-white/5">
                        <td className="py-2 pr-4 text-white">{p.title}</td>
                        <td className="py-2 pr-4 text-gray-300">{p.subject || notDetected}</td>
                        <td className="py-2 pr-4 text-gray-300">{p.semester || notDetected}</td>
                        <td className="py-2 pr-4 text-gray-300">{p.year || notDetected}</td>
                        <td className="py-2 text-gray-300">{p.exam_type || notDetected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Topic frequency */}
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-4">Topic Frequency</h2>
                <TopicBars topics={insights.topics} />
              </div>

              {/* Question types + marks */}
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-4">Question Types</h2>
                {insights.question_types.length ? (
                  <div className="flex flex-wrap gap-2 mb-6">
                    {insights.question_types.map(t => (
                      <span key={t.type} className="px-3 py-1 rounded-full bg-white/10 text-gray-200 text-xs">
                        {t.type} · {t.count}
                      </span>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-sm mb-6">No questions extracted.</p>}
                <h3 className="text-sm font-semibold text-white mb-2">Marks Distribution</h3>
                {insights.marks_distribution.length ? (
                  <div className="flex flex-wrap gap-2">
                    {insights.marks_distribution.map(m => (
                      <span key={m.marks} className="px-3 py-1 rounded-full bg-white/10 text-gray-200 text-xs">
                        {m.marks} marks · {m.count}
                      </span>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-sm">Marks not detected on questions.</p>}
              </div>
            </div>

            {/* Repeated questions */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white mb-4">🔁 Frequently Repeated Questions</h2>
              {insights.repeated_questions.length === 0 ? (
                <p className="text-gray-400 text-sm">
                  {insights.multi_paper
                    ? 'No repeated questions found across these papers.'
                    : insights.single_paper_note}
                </p>
              ) : (
                <div className="space-y-3">
                  {insights.repeated_questions.map(r => (
                    <div key={r.group_id} className="bg-white/5 rounded-xl p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-xs font-medium">{r.similarity}</span>
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-gray-300 text-xs">
                          {r.papers_count} paper(s) · {r.importance}
                        </span>
                        <span className="text-gray-500 text-xs">confidence: {r.confidence}</span>
                      </div>
                      <p className="text-white text-sm font-medium mb-2">{r.representative_text}</p>
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

            {/* Predictions */}
            {insights.multi_paper && (
              <div className={card}>
                <h2 className="text-lg font-semibold text-white mb-2">🎯 High-Priority Topics to Prepare</h2>
                <p className="text-gray-500 text-xs mb-4">Based on previous question paper patterns, these topics have a higher probability of appearing. This is not a guarantee.</p>
                {insights.predictions.length ? (
                  <div className="space-y-3">
                    {insights.predictions.map(p => (
                      <div key={p.topic} className="bg-white/5 rounded-xl p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-white text-sm font-medium">{p.topic}</span>
                          <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-200 text-xs">{p.confidence} confidence</span>
                        </div>
                        <p className="text-gray-400 text-xs mt-1">
                          Appeared in {p.papers_count} of {insights.papers_analyzed} papers · {p.question_count} question(s)
                        </p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-gray-400 text-sm">Not enough overlapping topics yet — analyze more papers from the same subject.</p>}
              </div>
            )}

            {/* Year-wise */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white mb-4">Year-wise Breakdown</h2>
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

            {/* Question breakdown */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white mb-4">Question Breakdown</h2>
              {questions.length === 0 ? (
                <p className="text-gray-400 text-sm">No questions could be extracted from these PDFs. They may be scanned images — try a text-based PDF.</p>
              ) : (
                <div className="space-y-6">
                  {insights.year_wise.map(y => {
                    const qs = questions.filter(q => q.paper_id === y.paper_id);
                    if (!qs.length) return null;
                    const bySection = {};
                    for (const q of qs) {
                      const s = q.section || 'Unsectioned';
                      (bySection[s] = bySection[s] || []).push(q);
                    }
                    return (
                      <div key={y.paper_id}>
                        <h3 className="text-white text-sm font-medium mb-2">{y.title} {y.year ? `(${y.year})` : ''} — {qs.length} questions</h3>
                        {Object.entries(bySection).map(([sec, list]) => (
                          <div key={sec} className="mb-3">
                            <p className="text-brand-300 text-xs font-semibold uppercase tracking-wide mb-1">{sec}</p>
                            <ol className="space-y-1">
                              {list.map(q => (
                                <li key={q.id} className="text-gray-300 text-sm">
                                  <span className="text-gray-500">{q.question_number}.</span> {q.question_text}
                                  <span className="text-gray-500 text-xs ml-2">
                                    [{q.question_type}{q.marks ? ' · ' + q.marks + 'm' : ''}]
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={exportReport} className="btn btn-secondary px-6 py-2">Download Report (JSON)</button>
              <button onClick={() => navigate('/repeated-questions')} className="btn btn-secondary px-6 py-2">View Repeated Questions</button>
              <button onClick={() => { setInsights(null); setQuestions([]); setSelected([]); }} className="btn btn-primary px-6 py-2">Analyze More</button>
            </div>
          </motion.div>
        )}

        {!analyzing && !insights && (
          <>
            <div className={card + ' mb-6'}>
              <h2 className="text-lg font-semibold text-white mb-4">Select Papers for Analysis</h2>
              {loading ? (
                <p className="text-gray-400">Loading...</p>
              ) : loadError ? (
                <p className="text-red-300">{loadError}</p>
              ) : papers.length === 0 ? (
                <p className="text-gray-400">No papers available for analysis yet. Upload question papers and they will appear here.</p>
              ) : (
                <div className="space-y-2">
                  {papers.map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer min-h-[48px]">
                      <input type="checkbox" checked={selected.includes(p.id)}
                        onChange={() => togglePaper(p.id)} className="w-4 h-4 rounded" />
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{p.title || p.subject || 'Untitled'}</p>
                        <p className="text-gray-500 text-xs">{p.subject} - {p.year}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {error && <div className="bg-red-500/10 border border-red-400/30 text-red-300 rounded-xl p-3 mb-4 text-sm">{error}</div>}
            <button onClick={runAnalysis} disabled={selected.length === 0 || analyzing}
              className="btn btn-primary btn-block py-3">
              {analyzing ? 'Analyzing...' : 'Analyze ' + selected.length + ' Paper(s)'}
            </button>
          </>
        )}
      </main>
    </div>
  );
};
export default AnalysisPage;
