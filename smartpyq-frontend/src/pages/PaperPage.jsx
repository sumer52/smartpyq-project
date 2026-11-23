import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, Calendar, CheckCircle2, ChevronRight, Download,
  ExternalLink, FileText, Flame, GraduationCap, Loader2, Search,
} from 'lucide-react';
import api from '../lib/api';
import { BACKEND_URL } from '../lib/backendUrl';
import { usePageMeta } from '../lib/seo';
import GlowEffect from '../components/ui/GlowEffect';
import MagneticButton from '../components/ui/MagneticButton';

const prettySemester = (name) => {
  const match = /^sem(?:ester)?\s*(\d+)$/i.exec(name || '');
  return match ? `Semester ${match[1]}` : name || '';
};

const formatFileSize = (bytes) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');

const examLabel = (value) => {
  if (!value) return 'Exam';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const SkeletonBlock = ({ className = '' }) => (
  <div className={`animate-pulse bg-white/10 rounded ${className}`} aria-hidden="true" />
);

const PaperPage = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | missing | error
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setData(null);
    setActionError('');
    api.getPaperDetail(id)
      .then((payload) => {
        if (cancelled) return;
        if (!payload?.paper) {
          setStatus('missing');
          return;
        }
        setData(payload);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load paper:', err);
        setStatus(err?.status === 404 ? 'missing' : 'error');
      });
    return () => { cancelled = true; };
  }, [id]);

  const paper = data?.paper;
  const questions = data?.questions || [];
  const related = data?.related_papers || [];

  const paperMeta = [
    paper?.subject,
    paper?.stream,
    paper?.specialization,
    prettySemester(paper?.semester),
    paper?.year ? `${paper.year}` : '',
    examLabel(paper?.exam_type),
    formatFileSize(paper?.file_size),
  ].filter(Boolean);

  const description = paper
    ? `${paper.subject}${paper.year ? ` ${paper.year}` : ''} previous year question paper` +
      `${paper.stream ? ` for ${paper.stream}` : ''}` +
      `${questions.length === 1 ? ' with 1 extracted question' : questions.length ? ` with ${questions.length} extracted questions` : ''}. ` +
      'Preview or download the PDF free on SmartPYQ.'
    : undefined;

  usePageMeta({
    title: paper
      ? `${paper.title} - PYQ Paper${paper.year ? ` ${paper.year}` : ''}`
      : status === 'missing'
        ? 'Paper not found'
        : 'Question paper',
    description: description || (status === 'missing'
      ? 'This question paper is not in the SmartPYQ library.'
      : 'Loading a previous year question paper from the SmartPYQ library.'),
    path: `/paper/${id}`,
    type: 'article',
    noindex: status === 'missing' || status === 'error',
    jsonLd: paper ? {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: paper.title,
      description,
      learningResourceType: 'exam paper',
      educationalLevel: paper.stream || undefined,
      about: paper.subject || undefined,
      datePublished: paper.year ? String(paper.year) : undefined,
      inLanguage: 'en',
      isAccessibleForFree: true,
      provider: { '@type': 'Organization', name: 'SmartPYQ' },
    } : undefined,
  });

  const handleDownload = useCallback(async () => {
    if (!paper || downloading) return;
    setDownloading(true);
    setActionError('');
    try {
      await api.authorizePaperDownload(paper.id);
    } catch (err) {
      console.error('Download failed:', err);
      setActionError('Download failed. Please try again in a moment.');
    } finally {
      setDownloading(false);
    }
  }, [paper, downloading]);

  // ---------------- not found / failed -------------------------------------
  if (status === 'missing') {
    return (
      <div className="min-h-screen">
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5">
            <FileText className="h-8 w-8 text-gray-500" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">That paper isn&apos;t available</h1>
          <p className="text-gray-400 mb-6">
            It may have been removed, or it hasn&apos;t been published yet. Every published paper is
            listed in the PYQ Hub.
          </p>
          <Link to="/pyq" className="btn btn-primary">Browse the PYQ Hub</Link>
        </main>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen">
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Couldn&apos;t load this paper</h1>
          <p className="text-gray-400 mb-6">The library isn&apos;t responding right now. Please try again.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </main>
      </div>
    );
  }

  // ---------------- loading ------------------------------------------------
  if (status === 'loading' || !paper) {
    return (
      <div className="min-h-screen">
        <main className="max-w-4xl mx-auto px-4 py-10" aria-busy="true" aria-label="Loading paper">
          <SkeletonBlock className="h-4 w-48 mb-6" />
          <SkeletonBlock className="h-9 w-3/4 mb-3" />
          <SkeletonBlock className="h-4 w-1/2 mb-6" />
          <div className="flex gap-2 mb-8">
            {[1, 2, 3, 4].map((i) => <SkeletonBlock key={i} className="h-7 w-24 rounded-full" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <SkeletonBlock key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        </main>
      </div>
    );
  }

  const pdfUrl = `${BACKEND_URL}/api/v1/papers/${paper.id}/download`;
  const analyzeUrl = `/analyze?papers=${paper.id}`;
  const subjectSearchUrl = `/search?q=${encodeURIComponent(paper.subject || '')}`;

  return (
    <div className="min-h-screen">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb: the browsable path this paper sits on */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-400 mb-5 flex-wrap">
          <Link to="/pyq" className="hover:text-white transition-colors">PYQ Hub</Link>
          {paper.stream && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <Link
                to={`/pyq?stream=${encodeURIComponent(paper.stream)}`}
                className="hover:text-white transition-colors"
              >
                {paper.stream}
              </Link>
            </>
          )}
          {paper.subject && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <Link to={subjectSearchUrl} className="hover:text-white transition-colors">{paper.subject}</Link>
            </>
          )}
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="text-white font-medium truncate max-w-[16rem]">{paper.title}</span>
        </nav>

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">{paper.title}</h1>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {paperMeta.map((item) => (
              <span key={item} className="bg-white/10 text-gray-300 text-xs px-2.5 py-1 rounded-full">{item}</span>
            ))}
          </div>

          <p className="text-sm text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-1">
            {paper.university && <span>{paper.university}</span>}
            {paper.page_count ? <span>{paper.page_count} page{paper.page_count === 1 ? '' : 's'}</span> : null}
            <span>{questions.length} question{questions.length === 1 ? '' : 's'} extracted</span>
            {paper.download_count > 0 && <span>{paper.download_count} download{paper.download_count === 1 ? '' : 's'}</span>}
          </p>
        </motion.header>

        <GlowEffect className="mb-8" color="rgba(241,136,99,0.12)" size={420}>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1 text-sm text-gray-400">
              {paper.description || 'The full question paper is available as a PDF — free, no sign-in required.'}
            </div>
            <div className="flex flex-wrap gap-2">
              <MagneticButton
                className="btn btn-primary"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Download className="h-4 w-4" aria-hidden="true" />}
                <span>{downloading ? 'Preparing…' : 'Download PDF'}</span>
              </MagneticButton>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open PDF
              </a>
            </div>
          </div>
          {actionError && (
            <p role="alert" className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-xl p-3">
              {actionError}
            </p>
          )}
        </GlowEffect>

        {/* Actions that turn this paper into study material */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          <Link to={analyzeUrl} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-brand-500/40 transition-colors flex items-start gap-3">
            <Flame className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="block text-white font-medium">Analyze this paper</span>
              <span className="block text-xs text-gray-400">Topics, difficulty and repeated questions.</span>
            </span>
          </Link>
          <Link to={subjectSearchUrl} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-brand-500/40 transition-colors flex items-start gap-3">
            <Search className="h-5 w-5 text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="block text-white font-medium">More {paper.subject} papers</span>
              <span className="block text-xs text-gray-400">Search this subject across every year.</span>
            </span>
          </Link>
        </div>

        {/* Extracted questions — the content this page is indexed for */}
        <section aria-labelledby="questions-heading" className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-brand-400" aria-hidden="true" />
            <h2 id="questions-heading" className="text-sm font-semibold uppercase tracking-wider text-gray-300">
              Questions in this paper ({questions.length})
            </h2>
          </div>

          {questions.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm text-gray-400">
              The questions inside this paper haven&apos;t been extracted yet. The PDF is still
              available above, and you can{' '}
              <Link to={analyzeUrl} className="text-brand-300 hover:text-brand-200 underline">run an analysis</Link>{' '}
              to pull out its topics.
            </div>
          ) : (
            <ol className="space-y-3">
              {questions.map((question) => (
                <li key={question.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex gap-3">
                    <span className="text-xs font-mono text-gray-500 pt-1 shrink-0">
                      {question.question_number || '•'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-line">
                        {question.text}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {question.section && (
                          <span className="bg-white/10 text-gray-400 text-xs px-2 py-0.5 rounded-full">{question.section}</span>
                        )}
                        {question.topic && (
                          <span className="bg-brand-500/15 text-brand-300 text-xs px-2 py-0.5 rounded-full">{question.topic}</span>
                        )}
                        {question.marks ? (
                          <span className="bg-white/10 text-gray-400 text-xs px-2 py-0.5 rounded-full">{question.marks} marks</span>
                        ) : null}
                        {question.has_answer && (
                          <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-300 text-xs px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> answer available
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Related papers keep visitors (and crawlers) moving through the library */}
        {related.length > 0 && (
          <section aria-labelledby="related-heading" className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="h-4 w-4 text-accent-400" aria-hidden="true" />
              <h2 id="related-heading" className="text-sm font-semibold uppercase tracking-wider text-gray-300">
                Related papers
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((item) => (
                <Link
                  key={item.id}
                  to={`/paper/${item.id}`}
                  className="group bg-white/5 border border-white/10 rounded-xl p-4 hover:border-brand-500/40 transition-colors"
                >
                  <p className="text-white text-sm font-medium leading-snug line-clamp-2 group-hover:text-brand-300 transition-colors mb-2">
                    {item.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    {item.subject && <span>{item.subject}</span>}
                    {item.year && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden="true" /> {item.year}
                      </span>
                    )}
                    {item.semester && <span>{prettySemester(item.semester)}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="pt-4 border-t border-white/10">
          <Link to="/pyq" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the PYQ Hub
          </Link>
        </div>
      </main>
    </div>
  );
};

export default PaperPage;
