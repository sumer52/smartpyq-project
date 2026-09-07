import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Search, BookOpen, Calendar, GraduationCap, FileText, Download, Eye, Heart, Flame } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStreams, getSpecializations, getSemesters, getSubjects, getPyqYears, getSemesterOptions } from '../data/pyqData';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import SpotlightCard from './ui/SpotlightCard';
import MagneticButton from './ui/MagneticButton';

const PYQNavigator = () => {
  const [currentLevel, setCurrentLevel] = useState('streams');
  const [selectedStream, setSelectedStream] = useState(null);
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [selectedSem, setSelectedSem] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedPyqYear, setSelectedPyqYear] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [papers, setPapers] = useState([]);
  const [isLoadingPapers, setIsLoadingPapers] = useState(false);
  const [paperError, setPaperError] = useState(null);
  const [previewPaper, setPreviewPaper] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [bookmarkedPapers, setBookmarkedPapers] = useState(new Set());
  const { user, isDemoUser } = useAuth();
  const navigate = useNavigate();
  
  const isUnlocked = (streamId, specId) => {
    // Demo users see everything unlocked
    if (isDemoUser) return true;
    // Admins see everything
    if (user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'tenant_admin') return true;
    // Check if user matches this stream/spec
    const userStream = user?.course?.toLowerCase()?.includes('bsc') ? 'bsc' : user?.course?.toLowerCase()?.includes('bcom') ? 'bcom' : user?.course?.toLowerCase()?.includes('bca') ? 'bca' : user?.course?.toLowerCase()?.includes('bba') ? 'bba' : '';
    if (streamId === userStream && (!specId || specId === user?.specialization)) return true;
    return false;
  };

  useEffect(() => {
    const fetchPapers = async () => {
      if (!selectedSubject || !selectedPyqYear || !selectedStream) return;
      setIsLoadingPapers(true); setPaperError(null);
      try {
        const r = await apiClient.getPapers({ subject: selectedSubject, stream: selectedStream.id, year: selectedPyqYear, semester: selectedSem?.id, paper_status: 'approved', per_page: 50 });
        setPapers(r.papers || []);
      } catch (e) { setPaperError('No papers available yet. Be the first to upload!'); setPapers([]); }
      finally { setIsLoadingPapers(false); }
    };
    fetchPapers();
  }, [selectedSubject, selectedPyqYear, selectedStream, selectedSem]);

  const handleStreamSelect = (k, s) => { setSelectedStream({...s, key: k}); setCurrentLevel('specializations'); };
  const handleSpecSelect = (k, s) => { setSelectedSpec({...s, key: k}); setCurrentLevel('semesters'); };
  const handleSemSelect = (s) => { setSelectedSem(s); setCurrentLevel('subjects'); };
  const handleSubjectSelect = (s) => { setSelectedSubject(s); setCurrentLevel('pyqYears'); };
  const handleYearSelect = (y) => { setSelectedPyqYear(y); setCurrentLevel('papers'); };
  const handleBack = () => {
    if (currentLevel === 'specializations') { setCurrentLevel('streams'); setSelectedStream(null); }
    else if (currentLevel === 'semesters') { setCurrentLevel('specializations'); setSelectedSpec(null); }
    else if (currentLevel === 'subjects') { setCurrentLevel('semesters'); setSelectedSem(null); }
    else if (currentLevel === 'pyqYears') { setCurrentLevel('subjects'); setSelectedSubject(null); }
    else if (currentLevel === 'papers') { setCurrentLevel('pyqYears'); setSelectedPyqYear(null); setPapers([]); }
  };
  const handleReset = () => { setCurrentLevel('streams'); setSelectedStream(null); setSelectedSpec(null); setSelectedSem(null); setSelectedSubject(null); setSelectedPyqYear(null); setSearchTerm(''); setPapers([]); };
  const handleDownload = async (p) => { try { await apiClient.authorizePaperDownload(p.id); } catch(e) { console.error('Download failed:', e); alert('Download failed. Please try again.'); } };
  const formatFileSize = (b) => { if (!b) return ''; return (b / 1048576).toFixed(1) + ' MB'; };
  const getBreadcrumb = () => { const c = ['PYQ Hub']; if (selectedStream) c.push(selectedStream.displayName); if (selectedSpec) c.push(selectedSpec.displayName); if (selectedSem) c.push(selectedSem.displayName); if (selectedSubject) c.push(selectedSubject); if (selectedPyqYear) c.push(String(selectedPyqYear)); return c; };
  const getTitle = () => {
    if (currentLevel === 'streams') return 'Choose Your Stream';
    if (currentLevel === 'specializations') return 'Choose Specialization';
    if (currentLevel === 'semesters') return 'Choose Semester';
    if (currentLevel === 'subjects') return 'Choose Subject';
    if (currentLevel === 'pyqYears') return 'Select PYQ Year';
    if (currentLevel === 'papers') return 'Papers';
    return 'PYQ Hub';
  };

  const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const card = { hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }, exit: { opacity: 0, y: -20, scale: 0.95 } };

  useEffect(() => {
    if (!previewPaper) { if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } return; }
    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const url = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000') + '/api/v1/papers/' + previewPaper.id + '/download';
        const headers = {};
        const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const resp = await fetch(url, { headers });
        if (!resp.ok) throw new Error('Failed to load preview');
        const blob = await resp.blob();
        if (!cancelled) setPreviewUrl(URL.createObjectURL(blob));
      } catch (e) { console.error('Preview fetch failed:', e); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [previewPaper]);

  const handleToggleBookmark = async (paperId) => {
    const isCurrentlyBookmarked = bookmarkedPapers.has(paperId);
    setBookmarkedPapers(prev => {
      const next = new Set(prev);
      if (isCurrentlyBookmarked) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
    try {
      await apiClient.toggleBookmark(paperId);
    } catch (e) {
      // Revert on error
      setBookmarkedPapers(prev => {
        const next = new Set(prev);
        if (isCurrentlyBookmarked) next.add(paperId);
        else next.delete(paperId);
        return next;
      });
    }
  };

  const renderStreams = () => {
    const s = getStreams();
    return (<motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" variants={container} initial="hidden" animate="visible" exit="exit">
      {Object.entries(s).map(([k, v]) => { const unlocked = isUnlocked(k); return (<motion.div key={k} variants={card} className={"card-nav p-8 cursor-pointer text-center " + (!unlocked ? "opacity-40" : "")} onClick={() => unlocked && handleStreamSelect(k, v)}>
        <div className="text-5xl mb-4">{v.icon}</div>
        <h3 className="text-2xl font-bold text-white mb-2">{v.displayName}</h3>
        <p className="text-gray-400 text-sm">{Object.keys(v.specializations).length} specialization{Object.keys(v.specializations).length > 1 ? 's' : ''}</p>{!isUnlocked(k) && <div className="mt-2 text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full inline-block">🔒 Coming Soon</div>}</motion.div>);})}
    </motion.div>);
  };
  const renderSpecializations = () => {
    const specs = getSpecializations(selectedStream.key);
    return (<motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" variants={container} initial="hidden" animate="visible" exit="exit">
      {Object.entries(specs).map(([k, v]) => (<motion.div key={k} variants={card} className="card-nav p-8 cursor-pointer text-center" onClick={() => handleSpecSelect(k, v)}>
        <div className="w-16 h-16 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><GraduationCap className="w-8 h-8 text-white" /></div>
        <h3 className="text-xl font-bold text-white mb-2">{v.displayName}</h3>
        <p className="text-gray-400 text-sm">{v.name}</p>
      </motion.div>))}
    </motion.div>);
  };
  const renderSemesters = () => {
    const sems = getSemesters(selectedStream.key, selectedSpec.key);
    const opts = getSemesterOptions();
    return (<motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4" variants={container} initial="hidden" animate="visible" exit="exit">
      {opts.map((s) => { const has = sems[s.id] && sems[s.id].length > 0; return (
        <motion.div key={s.id} variants={card} className={`card-nav p-6 cursor-pointer text-center ${!has ? 'opacity-40' : ''}`} onClick={() => has && handleSemSelect(s)}>
          <div className="w-14 h-14 bg-gradient-to-r from-green-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-3"><BookOpen className="w-7 h-7 text-white" /></div>
          <h3 className="text-xl font-bold text-white mb-1">{s.displayName}</h3>
          <p className="text-gray-400 text-xs">{has ? sems[s.id].length + ' subjects' : 'No subjects'}</p>
        </motion.div>); })}
    </motion.div>);
  };
  const renderSubjects = () => {
    const subs = getSubjects(selectedStream.key, selectedSpec.key, selectedSem.id);
    const filtered = subs.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
    return (<motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" variants={container} initial="hidden" animate="visible" exit="exit">
      {filtered.map((s) => (<motion.div key={s} variants={card} className="card-nav p-6 cursor-pointer flex items-center gap-4" onClick={() => handleSubjectSelect(s)}>
        <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center flex-shrink-0"><FileText className="w-6 h-6 text-white" /></div>
        <div><h3 className="text-lg font-bold text-white">{s}</h3><p className="text-gray-400 text-sm">View PYQ papers</p></div>
      </motion.div>))}
      {filtered.length === 0 && <p className="text-gray-400 text-center col-span-full py-8">No subjects match your search.</p>}
    </motion.div>);
  };
  const renderPyqYears = () => {
    const years = getPyqYears();
    return (<motion.div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3" variants={container} initial="hidden" animate="visible" exit="exit">
      {years.map((y) => (<motion.div key={y} variants={card} className="card-nav p-5 cursor-pointer text-center" onClick={() => handleYearSelect(y)}>
        <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-2"><Calendar className="w-6 h-6 text-white" /></div>
        <h3 className="text-lg font-bold text-white">{y}</h3>
      </motion.div>))}
    </motion.div>);
  };

  const renderPapers = () => {
    if (isLoadingPapers) return (<div className="flex justify-center items-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500"></div><span className="ml-4 text-gray-400">Loading papers...</span></div>);
    return (
      <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible" exit="exit">
        <motion.div variants={card} className="bg-gradient-to-r from-indigo-500 to-blue-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div><h3 className="text-2xl font-bold">{selectedSubject}</h3><p className="text-indigo-100">{selectedStream?.displayName} / {selectedSpec?.displayName} / {selectedSem?.displayName} / {selectedPyqYear}</p></div>
            <div className="text-right"><div className="text-2xl font-bold">{papers.length}</div><div className="text-indigo-100 text-sm">Papers</div></div>
          </div>
        </motion.div>
        {paperError && <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4"><p className="text-yellow-400">{paperError}</p></div>}
        {papers.length === 0 && !paperError ? (
          <div className="text-center py-12 bg-white/5 rounded-xl"><FileText className="h-16 w-16 text-gray-500 mx-auto mb-4" /><h3 className="text-xl font-semibold text-white mb-2">No Papers Yet</h3><p className="text-gray-400">No question papers available for this selection. Be the first to upload!</p></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {papers.map((p) => (
              <SpotlightCard key={p.id} className="group bg-white/5 border border-white/10 rounded-xl p-4" spotlightColor="rgba(99,102,241,0.1)">
                <motion.div variants={card}>
                  <h4 className="font-semibold text-white mb-2 group-hover:text-indigo-300 transition-colors line-clamp-2">{p.title}</h4>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded">{p.exam_type || 'Exam'}</span>
                    <span>{p.year}</span>
                    {p.file_size && <span>{formatFileSize(p.file_size)}</span>}
                  </div>
                  <div className="flex gap-2">
                    <MagneticButton className="btn btn-sm btn-primary flex-1 justify-center" onClick={(e) => { e.stopPropagation(); handleDownload(p); }}><Download className="h-4 w-4" /> <span>Download</span></MagneticButton>
                    <button className="btn btn-sm btn-secondary flex-1 justify-center" onClick={(e) => { e.stopPropagation(); navigate('/analyze?paper=' + p.id); }}><Flame className="h-4 w-4" /> <span>Analyze</span></button>
                    <button className="btn btn-icon btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setPreviewPaper(p); }}><Eye className="h-4 w-4" /></button>
                    <button className={`btn btn-icon btn-sm ${bookmarkedPapers.has(p.id) ? 'text-red-400' : 'btn-ghost'}`} onClick={(e) => { e.stopPropagation(); handleToggleBookmark(p.id); }} aria-label={bookmarkedPapers.has(p.id) ? 'Remove bookmark' : 'Add bookmark'}><Heart className={`h-4 w-4 ${bookmarkedPapers.has(p.id) ? 'fill-current' : ''}`} /></button>
                  </div>
                </motion.div>
              </SpotlightCard>
            ))}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <motion.h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-200 to-blue-200 bg-clip-text text-transparent mb-4" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>PYQ Hub</motion.h1>
          <motion.p className="text-xl text-gray-400 max-w-3xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>Browse Osmania University previous year question papers by stream, subject, and year</motion.p>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            {currentLevel !== 'streams' && <button onClick={handleBack} className="btn btn-sm btn-secondary flex items-center gap-2"><ChevronLeft className="w-4 h-4" /> Back</button>}
            <button onClick={handleReset} className="btn btn-sm btn-danger">Reset</button>
          </div>
          {currentLevel === 'subjects' && <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Search subjects..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-white/15 rounded-lg bg-white/5 text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500" /></div>}
        </div>
        <div className="flex items-center gap-2 mb-6 text-sm text-gray-400 flex-wrap">
          {getBreadcrumb().map((item, i) => (<React.Fragment key={i}>{i > 0 && <ChevronRight className="w-3 h-3" />}<span className={i === getBreadcrumb().length - 1 ? 'font-medium text-white' : ''}>{item}</span></React.Fragment>))}
        </div>
        <motion.h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8" key={currentLevel} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>{getTitle()}</motion.h2>
        <AnimatePresence mode="wait">
          {currentLevel === 'streams' && renderStreams()}
          {currentLevel === 'specializations' && renderSpecializations()}
          {currentLevel === 'semesters' && renderSemesters()}
          {currentLevel === 'subjects' && renderSubjects()}
          {currentLevel === 'pyqYears' && renderPyqYears()}
          {currentLevel === 'papers' && renderPapers()}
        </AnimatePresence>
      </div>
      {previewPaper && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4" onClick={() => setPreviewPaper(null)}>
          <div className="relative bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-white/20 shadow-2xl w-full max-w-4xl h-[85vh] sm:h-[85vh] mx-0 sm:mx-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10"><h3 className="text-white font-semibold text-lg truncate">{previewPaper.title}</h3><button onClick={() => setPreviewPaper(null)} className="text-gray-400 hover:text-white text-2xl leading-none px-2">&times;</button></div>
            <div className="flex-1 overflow-hidden rounded-b-2xl"><iframe src={previewUrl || ''} className="w-full h-full border-0" title={previewPaper.title} /></div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PYQNavigator;
