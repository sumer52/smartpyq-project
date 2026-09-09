import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const RepeatedQuestionsPage = () => {
  const [tab, setTab] = useState('repeated'); // 'repeated' | 'history'
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [analyses, setAnalyses] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadGroups(); loadAnalyses(); }, []);

  const loadGroups = async (subject) => {
    try {
      setLoading(true);
      const data = await api.getRepeatedQuestions(subject || undefined, 2);
      setGroups(data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const loadAnalyses = async () => {
    try {
      setHistoryLoading(true);
      const data = await api.getAnalyses();
      setAnalyses(data || []);
    } catch (err) { console.error(err); }
    finally { setHistoryLoading(false); }
  };

  const loadDetail = async (groupId) => {
    try {
      setDetailLoading(true); setSelectedGroup(groupId);
      const data = await api.getRepeatedQuestionDetail(groupId);
      setDetail(data);
    } catch (err) { console.error(err); } finally { setDetailLoading(false); }
  };

  const handleSubjectFilter = (subject) => {
    setSubjectFilter(subject);
    setSelectedGroup(null); setDetail(null);
    loadGroups(subject);
  };

  const handleBookmark = async (questionId) => {
    try { await api.createBookmark(questionId, 'question'); alert('Bookmarked!'); } catch (err) { console.error(err); }
  };

  const handleDeleteAnalysis = async (id) => {
    if (!confirm('Delete this analysis?')) return;
    try {
      await api.deleteAnalysis(id);
      setAnalyses(analyses.filter(a => a.id !== id));
    } catch (err) { console.error(err); }
  };

  const subjects = [...new Set(groups.map(g => g.subject).filter(Boolean))];
  const statusColors = {
    completed: 'bg-green-500/20 text-green-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    extracting: 'bg-blue-500/20 text-blue-400',
    analyzing: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Question <span className="text-brand-gradient">Insights</span></h1>
          <p className="text-gray-400">Repeated questions across exams and your analysis history.</p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 border border-white/10 w-fit">
          <button onClick={() => setTab('repeated')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'repeated' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            Repeated Questions ({groups.length})
          </button>
          <button onClick={() => setTab('history')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'history' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            Analysis History ({analyses.length})
          </button>
        </div>

        {tab === 'repeated' ? (
          <>
            {/* Subject Filter */}
            {subjects.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                <button onClick={() => handleSubjectFilter('')}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${!subjectFilter ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                  All ({groups.length})
                </button>
                {subjects.map(s => {
                  const count = groups.filter(g => g.subject === s).length;
                  return (
                    <button key={s} onClick={() => handleSubjectFilter(s)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${subjectFilter === s ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                      {s} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-3">
                {loading ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"></div>Loading...
                  </div>
                ) : groups.length === 0 ? (
                  <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-gray-400">No repeated questions found yet.</p>
                    <button onClick={() => navigate('/analyze')} className="btn btn-primary px-5 py-2 mt-3 text-sm">Run Analysis</button>
                  </div>
                ) : groups.map((group, idx) => (
                  <motion.div key={group.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                    onClick={() => loadDetail(group.id)}
                    className={"cursor-pointer p-4 rounded-xl border transition-all " + (selectedGroup === group.id ? "bg-indigo-600/20 border-indigo-500/50 shadow-lg" : "bg-white/5 border-white/10 hover:bg-white/10")}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-1 rounded-full">{group.frequency}x</span>
                      <span className="text-gray-500 text-xs">{group.subject}</span>
                    </div>
                    <p className="text-white text-sm font-medium line-clamp-2">{group.representative_text}</p>
                  </motion.div>
                ))}
              </div>
              <div className="lg:col-span-2">
                {detailLoading ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                  </div>
                ) : detail ? (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded-full">Asked {detail.frequency}x</span>
                      <span className="bg-indigo-500/20 text-indigo-400 text-sm px-3 py-1 rounded-full">{detail.subject}</span>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-6">{detail.representative_text}</h2>
                    <h3 className="text-lg font-semibold text-white mb-4">Evidence Across Years</h3>
                    <div className="space-y-4">
                      {detail.evidence?.map((ev, idx) => (
                        <div key={idx} className="bg-white/5 rounded-xl p-4 border border-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-blue-500/20 text-blue-400 text-sm font-bold px-2 py-1 rounded">{ev.paper_year || 'N/A'}</span>
                              <span className="text-white text-sm">{ev.paper_title || 'Untitled'}</span>
                            </div>
                            <button onClick={() => handleBookmark(ev.question_id)} className="btn btn-icon btn-sm btn-ghost text-yellow-400" title="Bookmark">&#9825;</button>
                          </div>
                          <p className="text-gray-300 text-sm">{ev.question_text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <p className="text-gray-400 text-sm">Appeared in: {[...new Set(detail.years)].join(', ')}</p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-gray-400">Select a question from the list to see year-wise evidence and exam history.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Analysis History Tab */
          <>
            {historyLoading ? (
              <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div></div>
            ) : analyses.length === 0 ? (
              <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-gray-400 text-lg">No analyses yet</p>
                <button onClick={() => navigate('/analyze')} className="btn btn-primary px-6 py-2 mt-4">Start Your First Analysis</button>
              </div>
            ) : (
              <div className="space-y-4">
                {analyses.map((a, i) => (
                  <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 hover:bg-white/10 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-semibold">{a.subject || 'Analysis #' + a.id}</h3>
                          <span className={"text-xs px-2 py-1 rounded " + (statusColors[a.status] || 'bg-gray-500/20 text-gray-400')}>
                            {a.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400">
                          <span>{a.paper_count} papers</span>
                          <span>{a.questions_extracted} questions</span>
                          <span>{a.repeated_groups} repeated</span>
                        </div>
                        {a.created_at && (
                          <p className="text-gray-500 text-xs mt-2">{new Date(a.created_at).toLocaleDateString()}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {a.status === 'completed' && (
                          <button onClick={() => { setTab('repeated'); }}
                            className="text-indigo-400 hover:text-indigo-300 text-sm">View Questions</button>
                        )}
                        <button onClick={() => handleDeleteAnalysis(a.id)}
                          className="text-gray-500 hover:text-red-400 text-sm">Delete</button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
export default RepeatedQuestionsPage;
