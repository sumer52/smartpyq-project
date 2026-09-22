import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import practiceQuestions from '../data/practiceQuestions.json';
import { Counter } from '../components/ui/Loaders';
import { Button } from '@/components/ui/button';
import AnswerView from '../components/AnswerView';
import { stagger, cardUp, EASE } from '../lib/motion';

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
  // Teacher answer (Exam Practice Mode): fetched from the question detail API
  // when the answer is revealed. Local fallback questions keep their built-in
  // answer string; backend questions render via <AnswerView> in the teacher's
  // original format (text / image / pdf).
  const [answerDetail, setAnswerDetail] = useState(null);
  const [answerLoading, setAnswerLoading] = useState(false);

  // PYQ Analysis Dashboard integration: ?papers=1,2,3 restricts practice to
  // the analyzed papers (most-repeated first); &q=<id> deep-links a question.
  const [searchParams] = useSearchParams();
  const papersParam = searchParams.get('papers');
  const focusQuestionId = searchParams.get('q') ? Number(searchParams.get('q')) : null;

  useEffect(() => {
    // Load local practice questions from question bank
    const loadQuestions = async () => {
      let loadedFromPapers = false;
      if (papersParam) {
        try {
          const qs = await api.getQuestions({ paper_ids: papersParam, limit: 300 });
          if (qs && qs.length > 0) {
            const sorted = [...qs].sort((a, b) => (b.frequency || 1) - (a.frequency || 1));
            setAllQuestions(sorted);
            setQuestions(sorted);
            if (focusQuestionId) {
              const idx = sorted.findIndex(q => q.id === focusQuestionId);
              if (idx >= 0) setCurrentIdx(idx);
            }
            loadedFromPapers = true;
          }
        } catch (e) { /* fall through to the general question bank */ }
      }
      if (!loadedFromPapers) {
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
  }, [papersParam, focusQuestionId]);

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
  const currentId = current ? current.id : null;

  // The id of the question on screen as of the latest committed render. Async
  // answer callbacks compare against this to detect that their question has
  // navigated away. The effect also resets all answer state per question —
  // a slow fetch must never display question X's answer under question Y.
  const answerReqRef = useRef(null);
  const currentIdRef = useRef(null);
  useEffect(() => {
    currentIdRef.current = currentId;
    answerReqRef.current = null;
    setAnswerDetail(null);
    setAnswerLoading(false);
  }, [currentId]);

  const handleRevealAnswer = async () => {
    // AnimatePresence keeps the previous question's card mounted during its
    // exit animation — its handlers still fire on click. Ignore any reveal
    // from a card whose question is no longer the one on screen.
    if (currentIdRef.current !== current?.id) return;
    setShowAnswer(true);
    if (typeof current.id === 'number' && !current.answer && !answerDetail) {
      const qid = current.id;
      answerReqRef.current = qid;
      setAnswerLoading(true);
      try {
        const detail = await api.request(`/api/v1/analysis/questions/${qid}/detail`);
        if (currentIdRef.current === qid) setAnswerDetail(detail || null);
      } catch (e) {
        if (currentIdRef.current === qid) setAnswerDetail(null);
      } finally {
        if (currentIdRef.current === qid) setAnswerLoading(false);
      }
    }
  };

  const handlePractice = async (status) => {
    if (!current) return;
    // Record the attempt locally first so anonymous visitors keep full
    // practice functionality; the server sync is best-effort (guests get 401).
    setHistory(prev => [...prev, { question_id: current.id, status, question_text: current.question_text, subject: current.subject }]);
    setShowAnswer(false);
    setUserAnswer('');
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
    try {
      await api.startPractice(current.id);
    } catch (err) { /* anonymous users have no server-side history — fine */ }
  };

  const stats = {
    total: allQuestions.length,
    reviewed: history.filter(h => h.status === 'reviewed').length,
    needsPractice: history.filter(h => h.status === 'attempted').length,
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading questions">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Exam Practice Mode</h1>
          <p className="text-muted">Sharpen your preparation by practicing with real questions extracted from previous year examinations.</p>
        </motion.div>

        {papersParam && (
          <div className="bg-brand-500/10 border border-brand-500/30 text-brand-200 rounded-xl p-4 text-sm mb-6">
            Practicing questions from your {papersParam.split(',').length} analyzed paper{papersParam.split(',').length > 1 ? 's' : ''}, most repeated questions first.
          </div>
        )}

        {allQuestions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-line">
            <p className="text-muted text-lg">No questions available for practice yet</p>
            <p className="text-muted text-sm mt-2">Run a paper analysis first to extract questions that you can practice with here.</p>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <motion.div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6" variants={stagger(0.06)} initial="hidden" animate="visible">
              {[ 
                { val: stats.total, label: 'Total Questions', color: 'text-primary' },
                { val: stats.reviewed, label: 'Reviewed', color: 'text-success' },
                { val: stats.needsPractice, label: 'Needs Practice', color: 'text-warning' },
              ].map((s, i) => (
                <motion.div key={i} variants={cardUp} className="bg-white rounded-xl border border-line p-4 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-muted mt-1">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Subject Filter */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button onClick={() => handleFilter('')}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${!subjectFilter ? 'bg-brand-500 text-primary border-brand-500' : 'bg-white text-muted border-line hover:bg-muted-100'}`}>
                All ({allQuestions.length})
              </button>
              {subjects.map(s => {
                const count = allQuestions.filter(q => q.subject === s).length;
                return (
                  <button key={s} onClick={() => handleFilter(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${subjectFilter === s ? 'bg-brand-500 text-primary border-brand-500' : 'bg-white text-muted border-line hover:bg-muted-100'}`}>
                    {s} ({count})
                  </button>
                );
              })}
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-line">
                <p className="text-muted">No questions found for this subject.</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <span className="text-muted text-sm">Question {currentIdx + 1} of {questions.length}</span>
                  <div className="w-full bg-muted-100 rounded-full h-2 mt-2">
                    <div className="bg-brand-500 h-2 rounded-full transition-all" style={{width: ((currentIdx + 1) / questions.length * 100) + '%'}}></div>
                  </div>
                </div>

                {current && (
                  <AnimatePresence mode="popLayout">
                  <motion.div key={current.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE }}
                    className="bg-white backdrop-blur-xl rounded-2xl border border-line p-8 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="bg-brand-500/20 text-accent text-xs px-2 py-1 rounded">Q{current.question_number || currentIdx + 1}</span>
                      <span className="bg-muted-100 text-muted text-xs px-2 py-1 rounded">{current.subject}</span>
                      {current.marks && <span className="bg-muted-100 text-muted text-xs px-2 py-1 rounded">{current.marks} marks</span>}
                      {current.question_type && <span className="bg-muted-100 text-muted text-xs px-2 py-1 rounded">{current.question_type}</span>}
                      {current.frequency > 1 && <span className="bg-orange-500/20 text-warning text-xs px-2 py-1 rounded">repeated {current.frequency}×</span>}
                    </div>
                    <p className="text-primary text-lg font-medium mb-6">{current.question_text}</p>

                    {showAnswer ? (
                      <div className="space-y-4">
                        {current.answer ? (
                          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                            <p className="text-success text-xs font-semibold mb-2">ANSWER</p>
                            <p className="text-primary text-sm leading-relaxed">{current.answer}</p>
                          </div>
                        ) : typeof current.id === 'number' ? (
                          answerLoading ? (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
                              <p className="text-success text-sm">Loading answer…</p>
                            </div>
                          ) : (
                            <AnswerView answer={answerDetail} answerUrl={api.answerFileUrl(current.id)} />
                          )
                        ) : null}
                        <textarea value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)}
                          placeholder="Write your own answer here to test your understanding..."
                          className="w-full h-32 bg-white border border-line rounded-xl p-4 text-primary placeholder:text-faint focus:outline-hidden focus:border-brand-500 resize-none" />
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Button onClick={() => handlePractice('reviewed')} size="sm"
                            className="flex-1">I Knew This</Button>
                          <Button onClick={() => handlePractice('attempted')} size="sm"
                            className="flex-1 bg-linear-to-b from-orange-600 to-orange-700 shadow-none hover:from-orange-500 hover:to-orange-600">Needs Practice</Button>
                        </div>
                      </div>
                    ) : (
                      <Button onClick={handleRevealAnswer} variant="secondary" className="w-full">
                        Show Answer
                      </Button>
                    )}
                  </motion.div>
                  </AnimatePresence>
                )}

                <div className="flex gap-3 justify-center">
                  <Button onClick={() => { if (currentIdx > 0) { setCurrentIdx(currentIdx - 1); setShowAnswer(false); } }}
                    disabled={currentIdx === 0}
                    variant="secondary">Previous</Button>
                  <Button onClick={() => { if (currentIdx < questions.length - 1) { setCurrentIdx(currentIdx + 1); setShowAnswer(false); } }}
                    disabled={currentIdx >= questions.length - 1}
                    variant="secondary">Next</Button>
                </div>
              </>
            )}

            {history.length > 0 && (
              <div className="mt-12">
                <h2 className="text-xl font-bold text-primary mb-4">Your Practice History</h2>
                <div className="space-y-2">
                  {history.slice(-10).reverse().map((h, i) => (
                    <div key={i} className="bg-white rounded-xl p-3 border border-line flex items-center gap-3">
                      <span className={"text-xs px-2 py-1 rounded " + (h.status === 'reviewed' ? 'bg-green-500/20 text-success' : 'bg-orange-500/20 text-warning')}>
                        {h.status}
                      </span>
                      <p className="text-primary text-sm flex-1 min-w-0 truncate">{h.question_text}</p>
                      <span className="text-muted text-xs">{h.subject}</span>
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
