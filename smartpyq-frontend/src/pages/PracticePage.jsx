import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../lib/api';
import practiceQuestions from '../data/practiceQuestions.json';

const PracticePage = () => {
  const [questions, setQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [history, setHistory] = useState([]);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');

  useEffect(() => {
    // Load local practice questions from question bank
    const loadQuestions = async () => {
      try {
        // Try backend first
        const qs = await api.getQuestions({ limit: 200 });
        if (qs && qs.length > 0) {
          setAllQuestions(qs);
          setQuestions(qs);
        } else {
          throw new Error('No backend questions');
        }
      } catch (e) {
        // Fall back to local question bank
        const localQs = [];
        let qNum = 1;
        for (const [subject, topics] of Object.entries(practiceQuestions)) {
          for (const [topic, qs] of Object.entries(topics)) {
            for (const q of qs) {
              localQs.push({
                id: 'local_' + qNum,
                question_text: q.q,
                subject: subject,
                topic: topic,
                question_number: qNum,
                answer: q.a,
                marks: null,
                question_type: null,
                paper_id: null
              });
              qNum++;
            }
          }
        }
        setAllQuestions(localQs);
        setQuestions(localQs);
      }
      try {
        const hist = await api.getPracticeHistory();
        setHistory(hist || []);
      } catch (e) {
        setHistory([]);
      }
      setLoading(false);
    };
    loadQuestions();
  }, []);

  // Build filter options
  const subjects = [...new Set(allQuestions.map(q => q.subject).filter(Boolean))];

  // Get semester from paper mapping (questions have paper_id, papers have semester)
  const [semesterMap, setSemesterMap] = useState({});
  useEffect(() => {
    if (allQuestions.length === 0) return;
    const paperIds = [...new Set(allQuestions.map(q => q.paper_id).filter(Boolean))];
    // Extract semester info from question context or use a simple heuristic
    // Since questions don't have semester directly, we'll group by what we know
  }, [allQuestions]);

  const handleFilter = (subject) => {
    setSubjectFilter(subject);
    setCurrentIdx(0);
    setShowAnswer(false);
    setUserAnswer('');
    if (subject) {
      setQuestions(allQuestions.filter(q => q.subject === subject));
    } else {
      setQuestions(allQuestions);
    }
  };

  const current = questions[currentIdx];

  const handlePractice = async (status) => {
    if (!current) return;
    try {
      await api.startPractice(current.id);
      setHistory(prev => [...prev, { question_id: current.id, status, question_text: current.question_text, subject: current.subject }]);
      setShowAnswer(false);
      setUserAnswer('');
      if (currentIdx < questions.length - 1) {
        setCurrentIdx(currentIdx + 1);
      }
    } catch (err) { console.error(err); }
  };

  const stats = {
    total: allQuestions.length,
    reviewed: history.filter(h => h.status === 'reviewed').length,
    needsPractice: history.filter(h => h.status === 'attempted').length,
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Exam Practice Mode</h1>
          <p className="text-gray-400">Sharpen your preparation by practicing with real questions extracted from previous year examinations.</p>
        </motion.div>

        {allQuestions.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-gray-400 text-lg">No questions available for practice yet</p>
            <p className="text-gray-500 text-sm mt-2">Run a paper analysis first to extract questions that you can practice with here.</p>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 text-center">
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-gray-400">Total Questions</p>
              </div>
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 text-center">
                <p className="text-2xl font-bold text-green-400">{stats.reviewed}</p>
                <p className="text-xs text-gray-400">Reviewed</p>
              </div>
              <div className="bg-white/5 rounded-xl border border-white/10 p-4 text-center">
                <p className="text-2xl font-bold text-orange-400">{stats.needsPractice}</p>
                <p className="text-xs text-gray-400">Needs Practice</p>
              </div>
            </div>

            {/* Subject Filter */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button onClick={() => handleFilter('')}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${!subjectFilter ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                All ({allQuestions.length})
              </button>
              {subjects.map(s => {
                const count = allQuestions.filter(q => q.subject === s).length;
                return (
                  <button key={s} onClick={() => handleFilter(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${subjectFilter === s ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                    {s} ({count})
                  </button>
                );
              })}
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
                <p className="text-gray-400">No questions found for this subject.</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <span className="text-gray-400 text-sm">Question {currentIdx + 1} of {questions.length}</span>
                  <div className="w-full bg-white/10 rounded-full h-2 mt-2">
                    <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{width: ((currentIdx + 1) / questions.length * 100) + '%'}}></div>
                  </div>
                </div>

                {current && (
                  <motion.div key={current.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-1 rounded">Q{current.question_number || currentIdx + 1}</span>
                      <span className="bg-white/10 text-gray-400 text-xs px-2 py-1 rounded">{current.subject}</span>
                      {current.marks && <span className="bg-white/10 text-gray-400 text-xs px-2 py-1 rounded">{current.marks} marks</span>}
                      {current.question_type && <span className="bg-white/10 text-gray-400 text-xs px-2 py-1 rounded">{current.question_type}</span>}
                    </div>
                    <p className="text-white text-lg font-medium mb-6">{current.question_text}</p>

                    {showAnswer ? (
                      <div className="space-y-4">
                        {current.answer && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                            <p className="text-green-400 text-xs font-semibold mb-2">ANSWER</p>
                            <p className="text-white text-sm leading-relaxed">{current.answer}</p>
                          </div>
                        )}
                        <textarea value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)}
                          placeholder="Write your own answer here to test your understanding..."
                          className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none" />
                        <div className="flex flex-col sm:flex-row gap-3">
                          <button onClick={() => handlePractice('reviewed')}
                            className="btn btn-primary flex-1 py-2">I Knew This</button>
                          <button onClick={() => handlePractice('attempted')}
                            className="btn btn-primary flex-1 py-2 bg-orange-600 hover:bg-orange-700">Needs Practice</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowAnswer(true)}
                        className="btn btn-secondary btn-block py-3">
                        Show Answer
                      </button>
                    )}
                  </motion.div>
                )}

                <div className="flex gap-3 justify-center">
                  <button onClick={() => { if (currentIdx > 0) { setCurrentIdx(currentIdx - 1); setShowAnswer(false); } }}
                    disabled={currentIdx === 0}
                    className="btn btn-secondary px-6 py-2">Previous</button>
                  <button onClick={() => { if (currentIdx < questions.length - 1) { setCurrentIdx(currentIdx + 1); setShowAnswer(false); } }}
                    disabled={currentIdx >= questions.length - 1}
                    className="btn btn-secondary px-6 py-2">Next</button>
                </div>
              </>
            )}

            {history.length > 0 && (
              <div className="mt-12">
                <h2 className="text-xl font-bold text-white mb-4">Your Practice History</h2>
                <div className="space-y-2">
                  {history.slice(-10).reverse().map((h, i) => (
                    <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5 flex items-center gap-3">
                      <span className={"text-xs px-2 py-1 rounded " + (h.status === 'reviewed' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400')}>
                        {h.status}
                      </span>
                      <p className="text-white text-sm flex-1 min-w-0 truncate">{h.question_text}</p>
                      <span className="text-gray-500 text-xs">{h.subject}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
export default PracticePage;
