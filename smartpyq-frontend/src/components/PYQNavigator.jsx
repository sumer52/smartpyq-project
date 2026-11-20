import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Search, BookOpen, Calendar, GraduationCap, FileText, Download, Eye, Flame, CheckSquare, Loader2, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getStreamIcon } from '../data/streamIcons';
import { apiClient } from '../lib/api';
import SpotlightCard from './ui/SpotlightCard';
import MagneticButton from './ui/MagneticButton';
import { Skeleton, SkeletonCard } from './ui/Loaders';
import { backdrop, modalPanel, sheetPanel } from '../lib/motion';
import { BACKEND_URL } from '../lib/backendUrl';

// ---------------------------------------------------------------------------
// URL contract
//   /pyq?q=dbms                      paper search (finds papers directly)
//   /pyq?stream=B.Sc&specialization=MSCS&semester=sem3&subject=Mathematics
//   /pyq?...&year=2023               papers for that selection
// Every level of the tree is a real, shareable URL, and browser Back walks up
// the tree because the level is derived from these params.
// ---------------------------------------------------------------------------

const PARAM_KEYS = ['q', 'stream', 'specialization', 'semester', 'subject', 'year'];

// Compare catalog values loosely: HomePage still links with catalog ids like
// "bsc"/"sem3", while the database stores "B.Sc"/"sem3".
const slug = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const displayName = (name, fallback = 'Unspecified') => (name && name.trim() ? name : fallback);

const prettySemester = (name) => {
  const match = /^sem(?:ester)?\s*(\d+)$/i.exec(name || '');
  return match ? `Sem ${match[1]}` : displayName(name);
};

const formatFileSize = (bytes) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');

const PYQNavigator = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState({ streams: [], paper_count: 0 });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  const [papers, setPapers] = useState([]);
  const [paperTotal, setPaperTotal] = useState(0);
  const [papersLoading, setPapersLoading] = useState(false);
  const [paperError, setPaperError] = useState('');

  const [yearCounts, setYearCounts] = useState({});
  const [yearsLoading, setYearsLoading] = useState(false);

  const [queryDraft, setQueryDraft] = useState(searchParams.get('q') || '');
  const [previewPaper, setPreviewPaper] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [selectedYears, setSelectedYears] = useState([]);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  // --- read the URL -------------------------------------------------------
  const q = searchParams.get('q') || '';
  const streamParam = searchParams.get('stream') || '';
  const specParam = searchParams.get('specialization') || '';
  const semParam = searchParams.get('semester') || '';
  const subjectParam = searchParams.get('subject') || '';
  const yearParam = searchParams.get('year') || '';

  // --- load the backend-built tree ----------------------------------------
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    apiClient.getPaperCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog({ streams: data?.streams || [], paper_count: data?.paper_count || 0 });
        setCatalogError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load the paper catalog:', err);
        setCatalogError('Could not load the paper library. Please retry in a moment.');
      })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // --- resolve the URL against that tree -----------------------------------
  // Guard on the param being present: the catalog can contain entries with an
  // empty name (papers missing a level), and slug('') would match those and
  // silently skip a whole level of the tree.
  const stream = useMemo(
    () => (streamParam ? catalog.streams.find((s) => slug(s.name) === slug(streamParam)) || null : null),
    [catalog.streams, streamParam],
  );
  const specialization = useMemo(() => {
    if (!stream || !specParam) return null;
    return stream.specializations.find((s) => slug(s.name) === slug(specParam)) || null;
  }, [stream, specParam]);
  const semester = useMemo(() => {
    if (!specialization || !semParam) return null;
    return specialization.semesters.find((s) => slug(s.name) === slug(semParam)) || null;
  }, [specialization, semParam]);
  const subject = useMemo(() => {
    if (!semester || !subjectParam) return null;
    return semester.subjects.find((s) => slug(s.name) === slug(subjectParam)) || null;
  }, [semester, subjectParam]);

  // The level follows from what the URL actually resolves to, so a stale or
  // hand-edited link degrades to the deepest level that still exists.
  const level = q
    ? 'search'
    : subject
      ? (yearParam ? 'papers' : 'years')
      : semester
        ? 'subjects'
        : specialization
          ? 'semesters'
          : stream
            ? 'specializations'
            : 'streams';

  const setParam = useCallback((patch, { clearDeeper = false } = {}) => {
    const next = new URLSearchParams(searchParams);
    if (clearDeeper) {
      // Changing a parent level invalidates every level below it.
      const order = ['stream', 'specialization', 'semester', 'subject', 'year'];
      const changedAt = order.findIndex((key) => key in patch);
      if (changedAt >= 0) order.slice(changedAt + 1).forEach((key) => next.delete(key));
    }
    Object.entries(patch).forEach(([key, value]) => {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
    });
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  // --- data for the current level -----------------------------------------
  useEffect(() => {
    if (level !== 'years' || !subject) return;
    let cancelled = false;
    setYearsLoading(true);
    apiClient.getYearAvailability({
      subject: subject.name,
      stream: stream?.name,
      semester: semester?.name,
    }).then((data) => {
      if (cancelled) return;
      const map = {};
      for (const entry of data?.year_counts || []) map[entry.year] = entry.paper_count;
      setYearCounts(map);
    }).catch(() => { if (!cancelled) setYearCounts({}); })
      .finally(() => { if (!cancelled) setYearsLoading(false); });
    return () => { cancelled = true; };
  }, [level, subject, stream, semester]);

  useEffect(() => {
    if (level !== 'papers' && level !== 'search') {
      setPapers([]);
      setPaperTotal(0);
      setPaperError('');
      return;
    }
    let cancelled = false;
    setPapersLoading(true);
    setPaperError('');
    const params = { per_page: 50, paper_status: 'approved' };
    if (level === 'search') {
      params.q = q;
    } else {
      params.subject = subject?.name;
      params.stream = stream?.name;
      params.semester = semester?.name;
      params.year = yearParam;
    }
    apiClient.getPapers(params)
      .then((data) => {
        if (cancelled) return;
        setPapers(data?.papers || []);
        setPaperTotal(data?.total ?? (data?.papers || []).length);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load papers:', err);
        setPapers([]);
        setPaperError('Could not load papers right now. Please try again.');
      })
      .finally(() => { if (!cancelled) setPapersLoading(false); });
    return () => { cancelled = true; };
  }, [level, q, subject, stream, semester, yearParam]);

  // Keep the input in sync when the URL changes (Back/Forward, shared link).
  useEffect(() => { setQueryDraft(q); }, [q]);

  // --- preview ------------------------------------------------------------
  useEffect(() => {
    if (!previewPaper) { if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } return; }
    let cancelled = false;
    const fetchPreview = async () => {
      try {
        const url = `${BACKEND_URL}/api/v1/papers/${previewPaper.id}/download`;
        const headers = {};
        const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) throw new Error('Failed to load preview');
        const blob = await resp.blob();
        if (!cancelled) setPreviewUrl(URL.createObjectURL(blob));
      } catch (e) { console.error('Preview fetch failed:', e); }
    };
    fetchPreview();
    return () => { cancelled = true; };
  }, [previewPaper]);

  // --- handlers -----------------------------------------------------------
  const handleSearch = (e) => {
    e?.preventDefault();
    const next = queryDraft.trim();
    // A search is global: start from a clean URL so results can't be
    // silently narrowed by filters left over from browsing.
    setSearchParams(next ? { q: next } : {});
  };

  const handleReset = () => { setSearchParams({}); setSelectedYears([]); setAnalyzeError(''); };

  const handleBack = () => {
    const next = new URLSearchParams(searchParams);
    const deepest = [...PARAM_KEYS].reverse().find((key) => next.has(key));
    if (deepest) next.delete(deepest);
    setSearchParams(next);
  };

  const toggleYearSelect = (year) => {
    setAnalyzeError('');
    setSelectedYears((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  };

  const handleAnalyzeSelected = async () => {
    if (!selectedYears.length || analyzeBusy) return;
    setAnalyzeBusy(true);
    setAnalyzeError('');
    try {
      const ids = [];
      const yearsWithPapers = [];
      for (const year of selectedYears) {
        const data = await apiClient.getPapers({
          subject: subject?.name,
          stream: stream?.name,
          semester: semester?.name,
          year,
          per_page: 100,
          paper_status: 'approved',
        });
        const list = data?.papers || [];
        if (list.length) { ids.push(...list.map((p) => p.id)); yearsWithPapers.push(year); }
      }
      if (!ids.length) {
        setAnalyzeError('No analyzable papers found for the selected year(s). Upload approved papers first.');
        return;
      }
      navigate(`/analyze?papers=${ids.join(',')}`, {
        state: {
          context: {
            stream: stream?.name,
            spec: specialization?.name,
            semester: semester?.name,
            subject: subject?.name,
            years: yearsWithPapers,
          },
        },
      });
    } catch (e) {
      setAnalyzeError(e?.message || 'Could not start the analysis. Please try again.');
    } finally {
      setAnalyzeBusy(false);
    }
  };

  const handleDownload = async (paper) => {
    try { await apiClient.authorizePaperDownload(paper.id); }
    catch (e) { console.error('Download failed:', e); alert('Download failed. Please try again.'); }
  };

  const breadcrumb = useMemo(() => {
    const trail = [{ label: 'PYQ Hub', onClick: handleReset }];
    if (level === 'search') trail.push({ label: `Search: ${q}`, onClick: null });
    if (stream) trail.push({ label: displayName(stream.name), onClick: () => setParam({ stream: stream.name }, { clearDeeper: true }) });
    if (specialization) trail.push({ label: displayName(specialization.name), onClick: () => setParam({ specialization: specialization.name }, { clearDeeper: true }) });
    if (semester) trail.push({ label: prettySemester(semester.name), onClick: () => setParam({ semester: semester.name }, { clearDeeper: true }) });
    if (subject) trail.push({ label: displayName(subject.name), onClick: () => setParam({ subject: subject.name }, { clearDeeper: true }) });
    if (yearParam) trail.push({ label: yearParam, onClick: null });
    return trail;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, q, stream, specialization, semester, subject, yearParam]);

  const title = {
    search: `Results for “${q}”`,
    streams: 'Browse the library',
    specializations: 'Choose Specialization',
    semesters: 'Choose Semester',
    subjects: 'Choose Subject',
    years: 'Select PYQ Year',
    papers: 'Papers',
  }[level];

  const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const card = { hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } }, exit: { opacity: 0, y: -20, scale: 0.95 } };

  // --- renderers ----------------------------------------------------------
  const renderStreams = () => {
    if (catalogLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" aria-busy="true" aria-label="Loading courses">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
        </div>
      );
    }
    if (catalogError) {
      return (
        <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
          <p className="text-yellow-400 mb-3">{catalogError}</p>
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => window.location.reload()}>Retry</button>
        </div>
      );
    }
    if (!catalog.streams.length) {
      return (
        <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
          <FileText className="h-14 w-14 text-gray-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No papers published yet</h3>
          <p className="text-gray-400 mb-4">The library is empty. Upload the first question paper and it will appear here once approved.</p>
          <MagneticButton className="btn btn-primary" onClick={() => navigate('/my-papers')}>Upload a paper</MagneticButton>
        </div>
      );
    }
    return (
      <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" variants={container} initial="hidden" animate="visible" exit="exit">
        {catalog.streams.map((s) => {
          const StreamIcon = getStreamIcon(s.name);
          return (
            <motion.button
              key={s.name || 'unspecified'}
              variants={card}
              className="card-nav p-8 cursor-pointer text-center"
              onClick={() => setParam({ stream: s.name }, { clearDeeper: true })}
            >
              <div className="w-16 h-16 bg-linear-to-r from-brand-500 to-accent-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <StreamIcon className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{displayName(s.name)}</h3>
              <p className="text-gray-400 text-sm">
                {s.specializations.length} specialization{s.specializations.length === 1 ? '' : 's'} · {s.paper_count} paper{s.paper_count === 1 ? '' : 's'}
              </p>
            </motion.button>
          );
        })}
      </motion.div>
    );
  };

  const renderSpecializations = () => (
    <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" variants={container} initial="hidden" animate="visible" exit="exit">
      {stream.specializations.map((spec) => (
        <motion.button
          key={spec.name || 'unspecified'}
          variants={card}
          className="card-nav p-8 cursor-pointer text-center"
          onClick={() => setParam({ specialization: spec.name }, { clearDeeper: true })}
        >
          <div className="w-16 h-16 bg-linear-to-r from-brand-500 to-accent-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">{displayName(spec.name)}</h3>
          <p className="text-gray-400 text-sm">{spec.paper_count} paper{spec.paper_count === 1 ? '' : 's'}</p>
        </motion.button>
      ))}
    </motion.div>
  );

  const renderSemesters = () => (
    <motion.div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4" variants={container} initial="hidden" animate="visible" exit="exit">
      {specialization.semesters.map((sem) => (
        <motion.button
          key={sem.name || 'unspecified'}
          variants={card}
          className="card-nav p-6 cursor-pointer text-center"
          onClick={() => setParam({ semester: sem.name }, { clearDeeper: true })}
        >
          <div className="w-14 h-14 bg-linear-to-r from-green-500 to-accent-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-1">{prettySemester(sem.name)}</h3>
          <p className="text-gray-400 text-xs">
            {sem.subjects.length} subject{sem.subjects.length === 1 ? '' : 's'}
          </p>
        </motion.button>
      ))}
    </motion.div>
  );

  const renderSubjects = () => (
    <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" variants={container} initial="hidden" animate="visible" exit="exit">
      {semester.subjects.map((sub) => (
        <motion.button
          key={sub.name || 'unspecified'}
          variants={card}
          className="card-nav p-6 cursor-pointer flex items-center gap-4 text-left"
          onClick={() => setParam({ subject: sub.name }, { clearDeeper: true })}
        >
          <div className="w-12 h-12 bg-linear-to-r from-accent-500 to-accent-600 rounded-full flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{displayName(sub.name)}</h3>
            <p className="text-gray-400 text-sm">{sub.paper_count} paper{sub.paper_count === 1 ? '' : 's'}</p>
          </div>
        </motion.button>
      ))}
    </motion.div>
  );

  const renderYears = () => {
    const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);
    return (
      <>
        {yearsLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3" aria-busy="true">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
          </div>
        ) : years.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
            <FileText className="h-14 w-14 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No papers for this subject yet</h3>
            <p className="text-gray-400 mb-4">Papers appear here as soon as one is approved.</p>
            <MagneticButton className="btn btn-primary" onClick={() => navigate('/my-papers')}>Upload a paper</MagneticButton>
          </div>
        ) : (
          <motion.div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3" variants={container} initial="hidden" animate="visible" exit="exit">
            {years.map((year) => {
              const isSelected = selectedYears.includes(year);
              const count = yearCounts[year];
              return (
                <motion.div key={year} variants={card}
                  className={`card-nav p-5 cursor-pointer text-center relative transition-colors ${isSelected ? 'ring-2 ring-brand-400 bg-brand-500/10' : ''}`}
                  onClick={(e) => {
                    // The checkbox owns its own toggle; the rest of the card browses.
                    if (e.target.closest('[data-year-checkbox]')) return;
                    setParam({ year: String(year) });
                  }}>
                  <label data-year-checkbox className="absolute top-0 right-0 z-10 cursor-pointer rounded-bl-lg bg-black/40 p-2 hover:bg-black/60 transition-colors">
                    <input type="checkbox" className="sr-only" checked={isSelected} onChange={() => toggleYearSelect(year)} aria-label={`Select ${year} for analysis`} />
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md border-2 transition-colors ${isSelected ? 'bg-brand-500 border-brand-400 text-white' : 'border-white/40 bg-white/10 text-transparent hover:border-brand-300'}`}>
                      <CheckSquare className="w-5 h-5" strokeWidth={3} />
                    </span>
                  </label>
                  <div className="w-12 h-12 bg-linear-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{year}</h3>
                  <p className="text-gray-400 text-xs mt-1">{count} paper{count === 1 ? '' : 's'}</p>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Sticky only from sm up: on phones the bar would float over the
            year cards and swallow taps meant for them. */}
        <div className="mt-6 z-20 sm:sticky sm:bottom-4">
          <div className="bg-gray-900/95 border border-white/15 rounded-2xl shadow-xl p-4 flex flex-col sm:flex-row items-center gap-3 backdrop-blur">
            <div className="text-white font-semibold whitespace-nowrap">
              {selectedYears.length > 0 ? `${selectedYears.length} Paper${selectedYears.length > 1 ? 's' : ''} Selected` : 'Select years to analyze'}
            </div>
            <div className="flex-1 text-xs text-gray-400 hidden sm:block">
              {selectedYears.length ? `Selected: ${selectedYears.join(', ')}` : 'Tick the checkbox on a year card, or tap a card to browse its papers.'}
            </div>
            <button onClick={handleAnalyzeSelected} disabled={selectedYears.length === 0 || analyzeBusy}
              className="btn btn-primary flex items-center gap-2 whitespace-nowrap disabled:opacity-40">
              {analyzeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
              {analyzeBusy ? 'Collecting papers...' : 'Analyze Selected Papers'}
            </button>
          </div>
          {analyzeError && <div className="mt-2 bg-red-500/10 border border-red-400/30 text-red-300 rounded-xl p-3 text-sm">{analyzeError}</div>}
        </div>
      </>
    );
  };

  const renderPapers = () => {
    if (papersLoading) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading papers">
          {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      );
    }
    const heading = level === 'search' ? 'Matching papers' : displayName(subject?.name);
    const subheading = level === 'search'
      ? `${paperTotal} paper${paperTotal === 1 ? ' matches' : 's match'} your search`
      : [displayName(stream?.name), displayName(specialization?.name), prettySemester(semester?.name), yearParam].filter(Boolean).join(' / ');
    return (
      <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible" exit="exit">
        <motion.div variants={card} className="bg-linear-to-r from-brand-500 to-accent-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-2xl font-bold truncate">{heading}</h3>
              <p className="text-brand-100 text-sm truncate">{subheading}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold">{paperTotal}</div>
              <div className="text-brand-100 text-sm">Paper{paperTotal === 1 ? '' : 's'}</div>
            </div>
          </div>
        </motion.div>

        {paperError && <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4"><p className="text-yellow-400">{paperError}</p></div>}

        {papers.length === 0 && !paperError ? (
          <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
            <FileText className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No papers found</h3>
            <p className="text-gray-400 mb-4">
              {level === 'search'
                ? 'Nothing matches that search yet. Try a subject name, a year, or a shorter keyword.'
                : 'No question papers for this selection yet.'}
            </p>
            {level === 'search'
              ? <button type="button" className="btn btn-secondary" onClick={handleReset}>Clear search</button>
              : <MagneticButton className="btn btn-primary" onClick={() => navigate('/my-papers')}>Upload a paper</MagneticButton>}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {papers.map((paper) => (
              <SpotlightCard key={paper.id} className="group bg-white/5 border border-white/10 rounded-xl p-4" spotlightColor="rgba(241,136,99,0.1)">
                <motion.div variants={card}>
                  <h4 className="font-semibold text-white mb-2 group-hover:text-brand-300 transition-colors line-clamp-2">{paper.title}</h4>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-3 flex-wrap">
                    <span className="bg-accent-500/20 text-accent-400 px-2 py-1 rounded">{paper.exam_type || 'Exam'}</span>
                    {paper.year && <span>{paper.year}</span>}
                    {paper.semester && <span>{prettySemester(paper.semester)}</span>}
                    {paper.file_size && <span>{formatFileSize(paper.file_size)}</span>}
                  </div>
                  <div className="flex gap-2">
                    <MagneticButton className="btn btn-sm btn-primary flex-1 justify-center" onClick={(e) => { e.stopPropagation(); handleDownload(paper); }}>
                      <Download className="h-4 w-4" /> <span>Download</span>
                    </MagneticButton>
                    <button className="btn btn-sm btn-secondary flex-1 justify-center" onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/analyze?papers=${paper.id}`, {
                        state: { context: { stream: paper.stream, semester: paper.semester, subject: paper.subject, years: [paper.year] } },
                      });
                    }}><Flame className="h-4 w-4" /> <span>Analyze</span></button>
                    <button className="btn btn-icon btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); setPreviewPaper(paper); }} aria-label={`Preview ${paper.title}`}>
                      <Eye className="h-4 w-4" />
                    </button>
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
          <motion.h1 className="text-4xl md:text-5xl font-bold text-brand-300 mb-4" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>PYQ Hub</motion.h1>
          <motion.p className="text-xl text-gray-400 max-w-3xl mx-auto" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
            Search every paper by subject, year, or course — or browse the library below
          </motion.p>
        </div>

        {/* One search box that finds papers directly (no tree required). */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-8" role="search">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" aria-hidden="true" />
              <input
                type="search"
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                placeholder="Search papers — e.g. “DBMS 2023”, “Mathematics”, “B.Com”"
                aria-label="Search question papers"
                className="w-full bg-white/5 border border-white/15 rounded-xl pl-12 pr-12 py-3 text-white placeholder-gray-500 focus:outline-hidden focus:border-brand-500/60 min-h-[48px]"
              />
              {(queryDraft || q) && (
                <button type="button" onClick={() => { setQueryDraft(''); if (q) handleReset(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-1 rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Clear search">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button type="submit" className="btn btn-primary btn-lg">Search</button>
          </div>
        </form>

        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex items-center gap-3">
            {level !== 'streams' && (
              <button onClick={handleBack} className="btn btn-sm btn-secondary flex items-center gap-2">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            {(level !== 'streams' || q) && <button onClick={handleReset} className="btn btn-sm btn-danger">Reset</button>}
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 text-sm text-gray-400 flex-wrap">
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={`${crumb.label}-${i}`}>
              {i > 0 && <ChevronRight className="w-3 h-3" aria-hidden="true" />}
              {crumb.onClick && i !== breadcrumb.length - 1 ? (
                <button type="button" onClick={crumb.onClick} className="hover:text-white transition-colors">{crumb.label}</button>
              ) : (
                <span className={i === breadcrumb.length - 1 ? 'font-medium text-white' : ''}>{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>

        <motion.h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-8" key={level} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>{title}</motion.h2>

        <AnimatePresence mode="wait">
          {level === 'search' && renderPapers()}
          {level === 'streams' && renderStreams()}
          {level === 'specializations' && renderSpecializations()}
          {level === 'semesters' && renderSemesters()}
          {level === 'subjects' && renderSubjects()}
          {level === 'years' && renderYears()}
          {level === 'papers' && renderPapers()}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {previewPaper && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => setPreviewPaper(null)}
            {...backdrop}
          >
            <motion.div
              className="relative bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-white/20 shadow-2xl w-full max-w-4xl h-[85vh] mx-0 sm:mx-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
              {...(typeof window !== 'undefined' && window.innerWidth < 640 ? sheetPanel : modalPanel)}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <h3 className="text-white font-semibold text-lg truncate">{previewPaper.title}</h3>
                <button onClick={() => setPreviewPaper(null)} className="text-gray-400 hover:text-white text-2xl leading-none px-2" aria-label="Close preview">&times;</button>
              </div>
              <div className="flex-1 overflow-hidden rounded-b-2xl">
                {previewUrl ? <iframe src={previewUrl} className="w-full h-full border-0" title={previewPaper.title} /> : (
                  <div className="p-6 space-y-4" aria-busy="true">
                    <Skeleton className="h-full w-full min-h-[50vh]" />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PYQNavigator;
