import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22,1,0.36,1] } } };
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const cardUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22,1,0.36,1] } } };


const AnalysisHistoryPage = () => {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadAnalyses(); }, []);

  const loadAnalyses = async () => {
    try {
      const data = await api.getAnalyses();
      setAnalyses(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this analysis?')) return;
    try {
      await api.deleteAnalysis(id);
      setAnalyses(analyses.filter(a => a.id !== id));
    } catch (err) { console.error(err); }
  };

  const statusColors = {
    completed: 'bg-green-500/20 text-green-400',
    pending: 'bg-yellow-500/20 text-yellow-400',
    extracting: 'bg-blue-500/20 text-blue-400',
    analyzing: 'bg-blue-500/20 text-blue-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Your Analysis History</h1>
          <p className="text-gray-400">Browse past analyses to review extracted questions, repeated patterns, and exam insights.</p>
        </motion.div>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div></div>
        ) : analyses.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-gray-400 text-lg">No analyses yet</p>
            <button onClick={() => navigate('/analyze')}
              className="btn btn-primary px-6 py-2 mt-4">Start Your First Analysis</button>
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
                      <button onClick={() => navigate('/repeated-questions')}
                        className="text-indigo-400 hover:text-indigo-300 text-sm">View</button>
                    )}
                    <button onClick={() => handleDelete(a.id)}
                      className="text-gray-500 hover:text-red-400 text-sm">Delete</button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
export default AnalysisHistoryPage;
