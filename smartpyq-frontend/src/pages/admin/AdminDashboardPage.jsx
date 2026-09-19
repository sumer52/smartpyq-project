import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ShieldCheckIcon, UsersIcon, DocumentTextIcon, CloudArrowDownIcon,
  ClockIcon, CheckCircleIcon, XCircleIcon, TrashIcon, ArrowPathIcon,
  ExclamationTriangleIcon, ArrowUpTrayIcon, EyeIcon, SparklesIcon,
  GlobeAltIcon, ArchiveBoxIcon, PencilSquareIcon, ClipboardDocumentCheckIcon,
  ExclamationCircleIcon, PencilIcon
} from '@heroicons/react/24/outline';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { AnimatedCounter, RevealText } from '../../components/text/TextReveals';

/**
 * Admin dashboard — /admin (guarded by AdminRoute + backend role checks).
 *
 * Sections: overview stats · Uploaded PDFs management (publish / unpublish /
 * delete) · AI Analyze (trigger analysis for a paper). Every action calls an
 * endpoint that enforces admin authorization on the backend.
 */

const STATUS_BADGES = {
  APPROVED: { label: 'PUBLISHED', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  DRAFT: { label: 'DRAFT', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  PENDING: { label: 'PENDING', cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  ARCHIVED: { label: 'UNPUBLISHED', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  REJECTED: { label: 'REJECTED', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_BADGES[String(status || '').toUpperCase()] || { label: String(status || '?').toUpperCase(), cls: 'bg-white/10 text-gray-300 border-white/20' };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${s.cls}`}>{s.label}</span>;
};

const AdminDashboardPage = () => {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('APPROVED');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState(null);

  // ---- Student paper verification (PENDING -> APPROVED/REJECTED) ----
  const [pendingQueue, setPendingQueue] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [reviewItem, setReviewItem] = useState(null);   // queue row under review
  const [reviewUrl, setReviewUrl] = useState(null);     // blob URL of the file
  const [reviewLoadingFile, setReviewLoadingFile] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  const loadPendingQueue = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await api.getPendingReview();
      setPendingQueue(Array.isArray(res?.papers) ? res.papers : []);
    } catch (e) {
      setPendingQueue([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      setStats(await api.request('/api/v1/admin/stats'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setActionError('Your account cannot view system statistics.');
    }
  }, []);

  const loadPapers = useCallback(async (filter) => {
    setListLoading(true);
    try {
      const data = await api.request(`/api/v1/papers?paper_status=${filter.toLowerCase()}&per_page=50`);
      setPapers(Array.isArray(data?.papers) ? data.papers : []);
      setPapersTotal(data?.total ?? 0);
    } catch (e) {
      setPapers([]);
      if (e instanceof ApiError && e.status === 403) setActionError('Your account cannot list papers of this status.');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPapers(statusFilter); }, [statusFilter, loadPapers]);
  useEffect(() => { loadPendingQueue(); }, [loadPendingQueue]);

  // Fetch the submitted file as an authenticated blob for the review preview
  // (pending papers require an Authorization header, so a plain iframe src
  // pointing at the download endpoint would 401).
  const openReview = useCallback(async (item) => {
    setReviewItem(item);
    setReviewUrl(null);
    setReviewNote('');
    setRejectMode(false);
    setRejectReason('');
    setReviewLoadingFile(true);
    try {
      const blob = await api.getFileBlob(`/api/v1/papers/${item.id}/download`);
      setReviewUrl({ url: URL.createObjectURL(blob), type: blob.type, name: item.file_name || 'paper' });
    } catch (e) {
      setReviewUrl(null);
    } finally {
      setReviewLoadingFile(false);
    }
  }, []);

  const act = async (paperId, verb) => {
    setBusyId(paperId);
    setActionError('');
    setNotice('');
    try {
      let result;
      if (verb === 'publish') {
        result = await api.request(`/api/v1/papers/${paperId}/publish`, { method: 'POST' });
      } else if (verb === 'unpublish') {
        result = await api.request(`/api/v1/papers/${paperId}/unpublish`, { method: 'POST' });
      } else if (verb === 'delete') {
        if (!window.confirm('Permanently delete this paper and its file? This cannot be undone.')) {
          setBusyId(null);
          return;
        }
        result = await api.request(`/api/v1/papers/${paperId}`, { method: 'DELETE' });
      }
      setNotice(result?.message || 'Done.');
      setPapers((list) => list.filter((p) => p.id !== paperId));
      loadStats();
    } catch (e) {
      setActionError(e?.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const approveSubmission = async (paperId, note) => {
    setReviewBusy(true);
    setActionError('');
    try {
      const fd = new FormData();
      if (note) fd.append('note', note);
      const res = await api.request(`/api/v1/papers/${paperId}/approve`, { method: 'POST', body: fd });
      setNotice(res?.message || 'Paper approved — it is now live in the PYQ Hub.');
      setReviewItem(null);
      setPendingQueue(q => q.filter(p => p.id !== paperId));
      loadStats();
      loadPapers(statusFilter);
    } catch (e) {
      setActionError(e?.message || 'Approve failed.');
    } finally {
      setReviewBusy(false);
    }
  };

  const rejectSubmission = async (paperId, reason) => {
    setReviewBusy(true);
    setActionError('');
    try {
      const fd = new FormData();
      fd.append('reason', reason);
      const res = await api.request(`/api/v1/papers/${paperId}/reject`, { method: 'POST', body: fd });
      setNotice(res?.message || 'Paper rejected.');
      setReviewItem(null);
      setPendingQueue(q => q.filter(p => p.id !== paperId));
      loadStats();
      loadPapers(statusFilter);
    } catch (e) {
      setActionError(e?.message || 'Reject failed.');
    } finally {
      setReviewBusy(false);
    }
  };

  const runAnalyze = async (paperId) => {
    setBusyId(paperId);
    setActionError('');
    setAnalyzeResult(null);
    try {
      const result = await api.request('/api/v1/analysis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([paperId]),
      });
      const [insights, questions] = await Promise.allSettled([
        api.request(`/api/v1/analysis/analyses/${result.id}/insights`),
        api.request(`/api/v1/analysis/questions?paper_id=${paperId}&limit=100`),
      ]);
      setAnalyzeResult({
        analysis: result,
        insights: insights.status === 'fulfilled' ? insights.value : null,
        questionCount: questions.status === 'fulfilled' ? (Array.isArray(questions.value) ? questions.value.length : 0) : 0,
      });
      loadStats();
    } catch (e) {
      setActionError(e?.message || 'AI analysis failed.');
    } finally {
      setBusyId(null);
    }
  };

  const statCards = useMemo(() => stats ? [
    { label: 'Published PYQs', value: stats.approved_papers, icon: GlobeAltIcon, tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Drafts', value: stats.draft_papers, icon: PencilSquareIcon, tone: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { label: 'Unpublished', value: stats.unpublished_papers, icon: ArchiveBoxIcon, tone: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
    { label: 'Uploaded PDFs', value: stats.total_papers, icon: DocumentTextIcon, tone: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
    { label: 'AI Analyses', value: stats.ai_analyses, icon: SparklesIcon, tone: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20' },
    { label: 'Users', value: stats.total_users, icon: UsersIcon, tone: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
    { label: 'Downloads', value: stats.total_downloads, icon: CloudArrowDownIcon, tone: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
    { label: 'Pending Review', value: stats.pending_papers, icon: ClockIcon, tone: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
  ] : [], [stats]);

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheckIcon className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-sm text-gray-400">Signed in as {user?.email} · {String(user?.role).replace('_', ' ')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/upload"
              className="inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-emerald-400 hover:to-teal-500"
            >
              <ArrowUpTrayIcon className="h-4 w-4" /> Upload PDF
            </Link>
            <button
              onClick={() => { loadStats(); loadPapers(statusFilter); }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading || listLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={async () => { await logout(); window.location.href = '/'; }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {(stats ? statCards : [...Array(8)].map((_, i) => null)).map((s, i) => s ? (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className={`inline-flex w-9 h-9 items-center justify-center rounded-lg border ${s.tone} mb-2`}>
                <s.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-white">
                {typeof s.value === 'number'
                  ? <AnimatedCounter value={s.value} className="!text-2xl !font-bold" />
                  : (s.value ?? '—')}
              </p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </motion.div>
          ) : (
            <div key={i} className="h-28 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
          ))}
        </div>

        {/* Notices */}
        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {notice}
          </div>
        )}
        {actionError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0" /> {actionError}
          </div>
        )}

        {/* AI analysis result panel */}
        {analyzeResult && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-fuchsia-500/20 flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-fuchsia-400" />
              <h2 className="font-semibold text-white">AI Analyze Result</h2>
              <span className="ml-auto text-xs text-gray-400">status: {analyzeResult.analysis?.status}</span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Questions extracted</p>
                <p className="text-2xl font-bold text-white">{analyzeResult.analysis?.questions_extracted ?? analyzeResult.questionCount ?? 0}</p>
              </div>
              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Repeated groups found</p>
                <p className="text-2xl font-bold text-white">{analyzeResult.analysis?.repeated_groups ?? 0}</p>
              </div>
              <div className="rounded-lg bg-white/5 p-4">
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Questions in paper</p>
                <p className="text-2xl font-bold text-white">{analyzeResult.questionCount}</p>
              </div>
              {analyzeResult.insights && (
                <div className="md:col-span-3 rounded-lg bg-white/5 p-4 text-gray-300 text-xs leading-relaxed">
                  {typeof analyzeResult.insights === 'string'
                    ? analyzeResult.insights
                    : JSON.stringify(analyzeResult.insights).slice(0, 600)}
                </div>
              )}
            </div>
          </motion.section>
        )}

        {/* Student paper verification queue */}
        <section className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.03] overflow-hidden mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-yellow-500/20">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <ClipboardDocumentCheckIcon className="h-5 w-5 text-yellow-400" /> PYQ Paper Verification
              <span className="ml-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-300">{pendingQueue.length} pending</span>
            </h2>
            <div className="flex items-center gap-2">
              <Link to="/admin/answers" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20">
                <PencilSquareIcon className="h-4 w-4" /> Manage Answers
              </Link>
              <button onClick={loadPendingQueue} className="p-1.5 rounded-lg text-gray-400 hover:text-white" aria-label="Refresh queue">
                <ArrowPathIcon className={`h-4 w-4 ${pendingLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {pendingLoading ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">Loading verification queue…</div>
          ) : pendingQueue.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">No student submissions waiting for verification.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-yellow-500/20">
                    <th className="px-5 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium hidden md:table-cell">Stream / Sem</th>
                    <th className="px-3 py-3 font-medium">Subject</th>
                    <th className="px-3 py-3 font-medium hidden lg:table-cell">Year</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pendingQueue.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-3 max-w-[200px]">
                        <p className="text-white font-medium truncate">{p.uploaded_by?.name || `User #${p.uploaded_by?.id ?? '?'}`}</p>
                        <p className="text-gray-500 text-xs truncate">{p.title}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-300 hidden md:table-cell">{p.stream || '—'} · {p.semester || '—'}</td>
                      <td className="px-3 py-3 text-gray-300">{p.subject}</td>
                      <td className="px-3 py-3 text-gray-300 hidden lg:table-cell">{p.year}</td>
                      <td className="px-3 py-3"><span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold bg-yellow-500/15 text-yellow-300 border-yellow-500/30">🟠 Pending</span></td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openReview(p)} disabled={busyId === p.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-50">
                          <EyeIcon className="h-3.5 w-3.5" /> Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Uploaded PDFs management */}
        <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-indigo-400" /> Uploaded PDFs
              <span className="ml-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300">{papersTotal}</span>
            </h2>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              {['APPROVED', 'DRAFT', 'ARCHIVED', 'PENDING', 'REJECTED'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    statusFilter === s ? 'bg-indigo-500/30 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {STATUS_BADGES[s]?.label || s}
                </button>
              ))}
            </div>
          </div>

          {listLoading ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">Loading papers…</div>
          ) : papers.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400 text-sm">
              No {STATUS_BADGES[statusFilter]?.label.toLowerCase() || statusFilter.toLowerCase()} papers.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-white/10">
                    <th className="px-5 py-3 font-medium">PDF / Title</th>
                    <th className="px-3 py-3 font-medium hidden md:table-cell">Subject</th>
                    <th className="px-3 py-3 font-medium hidden lg:table-cell">Semester</th>
                    <th className="px-3 py-3 font-medium hidden lg:table-cell">Year</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {papers.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-3 max-w-[220px]">
                        <p className="text-white font-medium truncate">{p.title}</p>
                        <p className="text-gray-500 text-xs truncate">{p.file_name || `Paper #${p.id}`}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-300 hidden md:table-cell">{p.subject}</td>
                      <td className="px-3 py-3 text-gray-300 hidden lg:table-cell">{p.semester || '—'}</td>
                      <td className="px-3 py-3 text-gray-300 hidden lg:table-cell">{p.year}</td>
                      <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status === 'APPROVED' ? (
                            <button
                              onClick={() => act(p.id, 'unpublish')}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-500/15 border border-slate-500/30 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-500/25 disabled:opacity-50"
                              title="Hide from the public PYQ Hub (keeps the file)"
                            >
                              <EyeIcon className="h-3.5 w-3.5" /> Unpublish
                            </button>
                          ) : (
                            <button
                              onClick={() => act(p.id, 'publish')}
                              disabled={busyId === p.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                              title="Make publicly visible in the PYQ Hub"
                            >
                              <GlobeAltIcon className="h-3.5 w-3.5" /> Publish
                            </button>
                          )}
                          <button
                            onClick={() => runAnalyze(p.id)}
                            disabled={busyId === p.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 px-2.5 py-1.5 text-xs text-fuchsia-300 hover:bg-fuchsia-500/25 disabled:opacity-50"
                            title="Run AI analysis (questions, repeats, patterns)"
                          >
                            <SparklesIcon className="h-3.5 w-3.5" /> Analyze
                          </button>
                          <button
                            onClick={() => act(p.id, 'delete')}
                            disabled={busyId === p.id}
                            className="inline-flex items-center rounded-lg bg-red-500/15 border border-red-500/30 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                            aria-label={`Delete ${p.title}`}
                            title="Delete permanently"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-6 text-xs text-gray-500">
          Every action is enforced server-side by admin role checks — this UI cannot bypass backend authorization.
          Unpublishing hides a paper from the public PYQ Hub without deleting it.
        </p>
      </main>

      {/* ---- Review modal ---- */}
      {reviewItem && (
        <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl my-6 rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="font-semibold text-white">Review submission · #{reviewItem.id}</h3>
              <button onClick={() => setReviewItem(null)} className="p-2 rounded-lg text-gray-400 hover:bg-white/10" aria-label="Close review">✕</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 p-5">
              {/* Metadata + actions */}
              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-1.5 text-sm">
                  <p className="text-white font-medium">{reviewItem.title}</p>
                  <p className="text-gray-400 text-xs">Uploaded by <span className="text-gray-200">{reviewItem.uploaded_by?.name || `User #${reviewItem.uploaded_by?.id ?? '?'}`}</span></p>
                  <p className="text-gray-400 text-xs">Stream: <span className="text-gray-200">{reviewItem.stream || '—'}</span></p>
                  <p className="text-gray-400 text-xs">Semester: <span className="text-gray-200">{reviewItem.semester || '—'}</span></p>
                  <p className="text-gray-400 text-xs">Subject: <span className="text-gray-200">{reviewItem.subject}</span></p>
                  <p className="text-gray-400 text-xs">Year: <span className="text-gray-200">{reviewItem.year}</span></p>
                  {reviewItem.description && <p className="text-gray-500 text-xs mt-2">“{reviewItem.description}”</p>}
                </div>

                {reviewItem.possible_duplicates?.length > 0 && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                    <p className="text-amber-300 text-xs font-semibold flex items-center gap-1.5 mb-1.5">
                      <ExclamationCircleIcon className="h-4 w-4" /> Possible duplicate detected
                    </p>
                    {reviewItem.possible_duplicates.map(d => (
                      <p key={d.paper_id} className="text-amber-200/80 text-xs">
                        • {d.match_type === 'exact_file' ? 'Identical file' : 'Same subject + year'}: #{d.paper_id} — {d.title}
                      </p>
                    ))}
                  </div>
                )}

                {/* Admin note */}
                <div>
                  <label htmlFor="review-note" className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                    <PencilIcon className="h-3.5 w-3.5" /> Admin note (optional)
                  </label>
                  <textarea id="review-note" rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Visible in the audit trail; student sees it on rejection"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-hidden focus:border-indigo-500 resize-none" />
                </div>

                {rejectMode && (
                  <div>
                    <label htmlFor="reject-reason" className="block text-xs font-semibold text-red-300 uppercase tracking-wide mb-1.5">Rejection reason * (min 10 characters)</label>
                    <textarea id="reject-reason" rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Wrong subject / unclear paper / duplicate / invalid document"
                      className="w-full bg-white/5 border border-red-500/30 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-hidden focus:border-red-500 resize-none" />
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  {!rejectMode ? (
                    <>
                      <button onClick={() => approveSubmission(reviewItem.id, reviewNote)} disabled={reviewBusy}
                        className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        <CheckCircleIcon className="h-4 w-4" /> Approve Paper
                      </button>
                      <button onClick={() => { setRejectMode(true); }} disabled={reviewBusy}
                        className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-red-600/90 hover:bg-red-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        <XCircleIcon className="h-4 w-4" /> Reject Paper
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { if (rejectReason.trim().length >= 10) rejectSubmission(reviewItem.id, rejectReason.trim()); }}
                        disabled={reviewBusy || rejectReason.trim().length < 10}
                        className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        <XCircleIcon className="h-4 w-4" /> Confirm Rejection
                      </button>
                      <button onClick={() => setRejectMode(false)} disabled={reviewBusy}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10">
                        Back
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* File preview */}
              <div className="lg:col-span-3">
                <div className="rounded-xl border border-white/10 bg-white/5 h-[480px] flex items-center justify-center overflow-hidden">
                  {reviewLoadingFile ? (
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto" />
                      <p className="text-gray-400 text-xs mt-3">Loading preview…</p>
                    </div>
                  ) : reviewUrl ? (
                    reviewUrl.type === 'application/pdf' ? (
                      <iframe src={reviewUrl.url} title="Paper preview" className="w-full h-full bg-white" />
                    ) : (
                      <img src={reviewUrl.url} alt="Paper preview" className="max-h-full max-w-full object-contain" />
                    )
                  ) : (
                    <div className="text-center p-6">
                      <ExclamationTriangleIcon className="h-8 w-8 text-amber-400 mx-auto" />
                      <p className="text-gray-400 text-sm mt-3">Preview unavailable.</p>
                      <a href={`/api/v1/papers/${reviewItem.id}/download`} target="_blank" rel="noreferrer"
                        className="text-indigo-300 text-sm underline mt-2 inline-block">Try opening the file directly</a>
                    </div>
                  )}
                </div>
                {reviewUrl && (
                  <a href={reviewUrl.url} download={reviewUrl.name} className="text-indigo-300 hover:text-indigo-200 text-xs underline mt-2 inline-block">
                    Download original file
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
