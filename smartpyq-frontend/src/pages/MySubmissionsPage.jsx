import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon, XCircleIcon, ClockIcon,
  ExclamationTriangleIcon, EyeIcon, ArrowPathIcon, FunnelIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import api, { getAnonUploadToken } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import UploadStepper from '../components/UploadStepper';

/**
 * My Submissions — /my-papers (public; no account needed).
 *
 * Community uploads use the SAME 3-step wizard as admins (AI analysis,
 * review detected metadata/questions, spell check, confirm) — submitted to
 * the student endpoint, the paper is stored as PENDING VERIFICATION and is
 * invisible to everyone except its uploader and admins until an admin
 * approves it. Below the wizard, contributors track their own submissions'
 * status.
 *
 * Signed-out visitors are tracked by an anon_token the backend returns with
 * each upload (kept in localStorage). Signed-in admins get instant approval.
 */

const STATUS_META = {
  pending: { label: 'Pending Verification', icon: ClockIcon, cls: 'bg-warning-50 text-warning border-warning-500/30' },
  approved: { label: 'Approved · Published', icon: CheckCircleIcon, cls: 'bg-success-50 text-success border-success-500/30' },
  rejected: { label: 'Rejected', icon: XCircleIcon, cls: 'bg-error-50 text-error border-error-500/30' },
  draft: { label: 'Draft (admin upload)', icon: ClockIcon, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  archived: { label: 'Unpublished', icon: ClockIcon, cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

const StatusBadge = ({ status }) => {
  const m = STATUS_META[String(status || '').toLowerCase()] ||
    { label: String(status || '?'), icon: ClockIcon, cls: 'bg-muted-100 text-secondary border-muted-300' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${m.cls}`}>
      <m.icon className="h-3.5 w-3.5" /> {m.label}
    </span>
  );
};

const MySubmissionsPage = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const [notice, setNotice] = useState(null);   // { kind: 'ok'|'warn', text }
  const [dupes, setDupes] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState('all');

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

  // Called by the wizard (both admin and student mode) when a paper lands.
  const handleUploadComplete = useCallback((result) => {
    setDupes(result?.possible_duplicates || []);
    if (isAdmin) {
      setNotice({ kind: 'ok', text: 'Paper uploaded and published. It is live in the PYQ Hub now.' });
    } else if (result?.possible_duplicates?.length) {
      setNotice({ kind: 'warn', text: 'Possible duplicate detected. An admin will double-check before approving.' });
    } else {
      setNotice({ kind: 'ok', text: result?.message || 'Paper uploaded successfully and submitted for verification.' });
    }
    loadSubmissions();
  }, [isAdmin, loadSubmissions]);

  const visibleSubs = submissions.filter(s => yearFilter === 'all' || String(s.year) === yearFilter);
  const yearsPresent = [...new Set(submissions.map(s => s.year).filter(Boolean))].sort((a, b) => b - a);

  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Upload a PYQ Paper</h1>
          <p className="text-muted max-w-3xl">
            Contribute a previous-year question paper you have, no account needed. Every submission is
            reviewed by an admin before it becomes visible to other students. Help grow the PYQ Hub for everyone.
          </p>
          {isAdmin && (
            <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-success bg-success-50 border border-success-500/30 rounded-full px-3 py-1.5">
              <ShieldCheckIcon className="h-4 w-4" /> Admin upload: papers you submit here are published immediately.
            </p>
          )}
        </motion.div>

        {notice && (
          <div className={`mb-6 p-4 rounded-xl border text-sm ${notice.kind === 'warn' ? 'bg-warning-50 border-warning-500/30 text-warning' : 'bg-success-50 border-success-500/30 text-success'}`}>
            <span className="flex items-start gap-2">
              {notice.kind === 'warn' ? <ExclamationTriangleIcon className="h-4 w-4 mt-0.5" /> : <CheckCircleIcon className="h-4 w-4 mt-0.5" />}
              <span>{notice.text}</span>
            </span>
            {dupes.length > 0 && (
              <div className="mt-2 ml-6 text-xs text-warning">
                {dupes.map(d => <p key={d.paper_id}>• Similar approved paper: #{d.paper_id}: {d.title}</p>)}
              </div>
            )}
          </div>
        )}

        {/* Upload wizard — same 3-step flow as the admin page, student mode:
            AI analysis, review detected details/questions, spell check,
            submit for verification (or instant publish for admins). */}
        <div className="mb-10">
          <UploadStepper mode={isAdmin ? 'admin' : 'student'} onUploadComplete={handleUploadComplete} />
        </div>

        {/* My submissions */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-primary">My Submissions</h2>
          {yearsPresent.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <FunnelIcon className="h-4 w-4 text-muted" />
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}
                className="bg-white border border-line rounded-lg px-2.5 py-1.5 text-secondary focus:outline-hidden focus:border-brand-500 focus:ring-2 focus:ring-indigo-500/30">
                <option value="all" className="bg-muted-50">All years</option>
                {yearsPresent.map(y => <option key={y} value={y} className="bg-muted-50">{y}</option>)}
              </select>
              <button onClick={loadSubmissions} className="p-1.5 rounded-lg text-muted hover:text-primary" aria-label="Refresh"><ArrowPathIcon className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        {subsLoading ? (
          <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" /></div>
        ) : visibleSubs.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-line">
            <p className="text-muted">You haven't uploaded any papers yet.</p>
            <p className="text-muted text-sm mt-1">Upload your first paper above; approved papers appear in the public PYQ Hub.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleSubs.map(s => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-line p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-primary text-sm font-medium truncate">{s.title}</p>
                  <p className="text-muted text-xs mt-0.5">{s.subject} · {s.semester || '—'} · {s.year}{s.file_name ? ` · ${s.file_name}` : ''}</p>
                  {s.status === 'rejected' && s.rejection_reason && (
                    <p className="text-error/90 text-xs mt-1.5 flex items-start gap-1.5">
                      <XCircleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Reason: {s.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {s.status === 'approved' && (
                    <a href={`/pyq?year=${s.year}`} className="text-accent hover:text-accent-2 text-xs inline-flex items-center gap-1" title="View in PYQ Hub">
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
