import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  CloudArrowUpIcon, DocumentIcon, CheckCircleIcon, XCircleIcon,
  ClockIcon, ExclamationTriangleIcon, EyeIcon, ArrowPathIcon, FunnelIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import api, { ApiError, getAnonUploadToken, setAnonUploadToken } from '../lib/api';
import { getStreams, getSemesterOptions, getAllSubjectsForStreamSemester } from '../data/pyqData';
import { useAuth } from '../contexts/AuthContext';

/**
 * My Submissions — /my-papers (public; no account needed).
 *
 * Community uploads: choose the paper's metadata, attach the file, submit →
 * the paper is stored as PENDING VERIFICATION and is invisible to everyone
 * except its uploader and admins until an admin approves it. Below the form,
 * contributors track their own submissions' status.
 *
 * Signed-out visitors are tracked by an anon_token the backend returns with
 * each upload (kept in localStorage). Signed-in admins get instant approval.
 */

const STATUS_META = {
  pending: { label: 'Pending Verification', icon: ClockIcon, cls: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  approved: { label: 'Approved · Published', icon: CheckCircleIcon, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  rejected: { label: 'Rejected', icon: XCircleIcon, cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  draft: { label: 'Draft (admin upload)', icon: ClockIcon, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  archived: { label: 'Unpublished', icon: ClockIcon, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[String(status || '').toLowerCase()] ||
    { label: String(status || '?'), icon: ClockIcon, cls: 'bg-white/10 text-gray-300 border-white/20' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${m.cls}`}>
      <m.icon className="h-3.5 w-3.5" /> {m.label}
    </span>
  );
};

const MySubmissionsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  // Catalog options (streams/semesters/subjects) come from the same data the
  // PYQ Hub uses, so students contribute to real categories.
  const [catalog, setCatalog] = useState({ streams: [], semesters: [], subjects: [] });
  const [form, setForm] = useState({ stream: '', specialization: '', semester: '', subject: '', year: '', exam: 'Final Exam', title: '', description: '' });
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);   // { kind: 'ok'|'warn', text }
  const [error, setError] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState('all');
  const [dupes, setDupes] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Streams: display names ("B.Sc") matching what papers store in `stream`.
    const streamList = Object.entries(getStreams() || {}).map(([id, s]) => ({ id, name: s.displayName || s.name })).filter(s => s.name);
    const semesters = getSemesterOptions().map(s => ({ id: s.id, name: s.displayName }));
    setCatalog({ streams: streamList, semesters, subjects: [] });
  }, []);

  // Subjects for the chosen stream + semester (PYQ Hub catalog).
  useEffect(() => {
    const streamEntry = catalog.streams.find(s => s.name === form.stream);
    const semEntry = catalog.semesters.find(s => s.name === form.semester);
    if (streamEntry && semEntry) {
      setCatalog(c => ({ ...c, subjects: getAllSubjectsForStreamSemester(streamEntry.id, semEntry.id) }));
    } else {
      setCatalog(c => (c.subjects.length ? { ...c, subjects: [] } : c));
    }
  }, [form.stream, form.semester, catalog.streams, catalog.semesters]);

  const loadSubmissions = useCallback(async () => {
    setSubsLoading(true);
    try {
      // Signed-out visitors: identify via the stored anon upload token.
      const anonToken = !isAuthenticated ? getAnonUploadToken() : undefined;
      if (!isAuthenticated && !anonToken) {
        setSubmissions([]);
        return;
      }
      const res = await api.getMySubmissions(anonToken);
      setSubmissions(res?.papers || []);
    } catch (e) {
      setSubmissions([]);
      // A missing/expired anon token is not an error worth shouting about —
      // the empty state below invites the first upload.
    } finally {
      setSubsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  const onPickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    setError('');
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      setError('Unsupported file type. Please upload a PDF, JPG, JPEG, PNG or WEBP file.');
      e.target.value = '';
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('File is too large (max 50 MB).');
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const years = Array.from({ length: 16 }, (_, i) => 2026 - i);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice(null);
    setDupes([]);
    if (!form.stream || !form.semester || !form.subject || !form.year) {
      setError('Please choose the stream, semester, subject and academic year.');
      return;
    }
    if (!file) { setError('Please attach the question paper file (PDF or image).'); return; }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', form.title.trim() || `${form.subject} — ${form.year}`);
    fd.append('subject', form.subject);
    fd.append('stream', form.stream);
    fd.append('specialization', form.specialization || '');
    fd.append('semester', form.semester);
    fd.append('exam', form.exam || 'Final Exam');
    fd.append('year', String(form.year));
    fd.append('description', form.description || '');
    // Signed-out: send any token from an earlier upload so all of this
    // browser's submissions stay grouped under one "My Papers" list.
    if (!isAuthenticated) fd.append('anon_token', getAnonUploadToken());

    setUploading(true);
    setProgress(0);
    try {
      const res = await api.uploadStudentPaper(fd, setProgress);
      // Signed-out: persist the tracking token so "My Submissions" works
      // in this browser without an account.
      if (!isAuthenticated && res?.anon_token) setAnonUploadToken(res.anon_token);
      setNotice({
        kind: 'ok',
        text: isAdmin
          ? 'Paper uploaded and published — it is live in the PYQ Hub now.'
          : (res?.message || 'Paper uploaded successfully and submitted for verification.'),
      });
      if (res?.possible_duplicates?.length) {
        setDupes(res.possible_duplicates);
        setNotice({ kind: 'warn', text: 'Possible duplicate detected — an admin will double-check before approving.' });
      }
      setForm(f => ({ ...f, title: '', description: '' }));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadSubmissions();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const visibleSubs = submissions.filter(s => yearFilter === 'all' || String(s.year) === yearFilter);
  const yearsPresent = [...new Set(submissions.map(s => s.year).filter(Boolean))].sort((a, b) => b - a);

  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Upload a PYQ Paper</h1>
          <p className="text-gray-400 max-w-3xl">
            Contribute a previous-year question paper you have — no account needed. Every submission is
            reviewed by an admin before it becomes visible to other students — help grow the PYQ Hub for everyone.
          </p>
          {isAdmin && (
            <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1.5">
              <ShieldCheckIcon className="h-4 w-4" /> Admin upload — papers you submit here are published immediately.
            </p>
          )}
        </motion.div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
            <ExclamationTriangleIcon className="h-4 w-4" /> {error}
          </div>
        )}
        {notice && (
          <div className={`mb-6 p-4 rounded-xl border text-sm ${notice.kind === 'warn' ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>
            <span className="flex items-start gap-2">
              {notice.kind === 'warn' ? <ExclamationTriangleIcon className="h-4 w-4 mt-0.5" /> : <CheckCircleIcon className="h-4 w-4 mt-0.5" />}
              <span>{notice.text}</span>
            </span>
            {dupes.length > 0 && (
              <div className="mt-2 ml-6 text-xs text-amber-300/80">
                {dupes.map(d => <p key={d.paper_id}>• Similar approved paper: #{d.paper_id} — {d.title}</p>)}
              </div>
            )}
          </div>
        )}

        {/* Upload form */}
        <form onSubmit={submit} className="bg-white/5 rounded-2xl border border-white/10 p-6 mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="st-stream" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Stream / Course *</label>
              <select id="st-stream" value={form.stream} onChange={(e) => setForm(f => ({ ...f, stream: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" required>
                <option value="" className="bg-gray-900">— Select stream —</option>
                {catalog.streams.map(s => <option key={s.id} value={s.name} className="bg-gray-900">{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="st-sem" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Semester *</label>
              <select id="st-sem" value={form.semester} onChange={(e) => setForm(f => ({ ...f, semester: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" required>
                <option value="" className="bg-gray-900">— Select semester —</option>
                {catalog.semesters.map(s => <option key={s.id} value={s.name} className="bg-gray-900">{s.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="st-subject" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Subject *</label>
              <input id="st-subject" list="subject-options" value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="e.g. Data Structures"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" required />
              <datalist id="subject-options">
                {catalog.subjects.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="st-year" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Academic Year / Exam Year *</label>
              <select id="st-year" value={form.year} onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" required>
                <option value="" className="bg-gray-900">— Select year —</option>
                {years.map(y => <option key={y} value={y} className="bg-gray-900">{y}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="st-exam" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Exam</label>
              <select id="st-exam" value={form.exam} onChange={(e) => setForm(f => ({ ...f, exam: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500">
                {['Final Exam', 'Midterm', 'Quiz'].map(x => <option key={x} value={x} className="bg-gray-900">{x}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="st-title" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Title (optional)</label>
              <input id="st-title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Defaults to “Subject — Year”"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="st-desc" className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Description / source (optional)</label>
              <textarea id="st-desc" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                placeholder="e.g. Scanned from the university library archive"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 resize-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Paper file * <span className="normal-case font-normal text-gray-500">(PDF, JPG, JPEG, PNG, WEBP · max 50 MB)</span></label>
              {!file ? (
                <label className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-white/15 hover:border-indigo-500/50 hover:bg-white/5 cursor-pointer transition-colors">
                  <CloudArrowUpIcon className="h-8 w-8 text-gray-500" />
                  <span className="text-gray-400 text-sm">Click to choose the question paper file</span>
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={onPickFile} className="hidden" />
                </label>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                  <DocumentIcon className="h-8 w-8 text-indigo-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{file.name}</p>
                    <p className="text-gray-500 text-xs">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-xs text-gray-400 hover:text-white underline">Remove</button>
                </div>
              )}
            </div>
          </div>

          {uploading && (
            <div className="mt-5">
              <div className="flex justify-between text-xs text-gray-400 mb-1.5"><span>Uploading…</span><span>{progress}%</span></div>
              <div className="w-full bg-white/10 rounded-full h-2"><div className="bg-indigo-500 h-2 rounded-full transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
            </div>
          )}

          <button type="submit" disabled={uploading}
            className="btn btn-primary btn-lg w-full sm:w-auto mt-6 disabled:opacity-50 disabled:cursor-not-allowed">
            {uploading ? 'Submitting…' : 'Upload Paper'}
          </button>
          <p className="text-[11px] text-gray-500 mt-3">
            {isAdmin
              ? 'As an admin, your uploads skip the queue and are published immediately.'
              : (isAuthenticated
                ? 'Your submission starts as Pending Verification and is only visible to you and the admins until it is approved.'
                : 'No account needed — your submission starts as Pending Verification and becomes public once an admin approves it. This browser keeps a private link to track it.')}
          </p>
        </form>

        {/* My submissions */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-white">My Submissions</h2>
          {yearsPresent.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <FunnelIcon className="h-4 w-4 text-gray-500" />
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30">
                <option value="all" className="bg-gray-900">All years</option>
                {yearsPresent.map(y => <option key={y} value={y} className="bg-gray-900">{y}</option>)}
              </select>
              <button onClick={loadSubmissions} className="p-1.5 rounded-lg text-gray-400 hover:text-white" aria-label="Refresh"><ArrowPathIcon className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        {subsLoading ? (
          <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" /></div>
        ) : visibleSubs.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-gray-400">You haven't uploaded any papers yet.</p>
            <p className="text-gray-500 text-sm mt-1">Upload your first paper above — approved papers appear in the public PYQ Hub.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleSubs.map(s => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{s.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{s.subject} · {s.semester || '—'} · {s.year}{s.file_name ? ` · ${s.file_name}` : ''}</p>
                  {s.status === 'rejected' && s.rejection_reason && (
                    <p className="text-red-300/90 text-xs mt-1.5 flex items-start gap-1.5">
                      <XCircleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Reason: {s.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {s.status === 'approved' && (
                    <a href={`/pyq?year=${s.year}`} className="text-indigo-300 hover:text-indigo-200 text-xs inline-flex items-center gap-1" title="View in PYQ Hub">
                      <EyeIcon className="h-3.5 w-3.5" /> In PYQ Hub
                    </a>
                  )}
                  <StatusBadge status={s.status} />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MySubmissionsPage;
