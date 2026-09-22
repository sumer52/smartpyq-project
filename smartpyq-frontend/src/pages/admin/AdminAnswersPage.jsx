import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  DocumentTextIcon, PhotoIcon, DocumentIcon, CheckCircleIcon,
  TrashIcon, ArrowPathIcon, MagnifyingGlassIcon, ExclamationTriangleIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline';
import api, { ApiError } from '../../lib/api';
import { FormattedText } from '../../components/AnswerView';

/**
 * Admin Answer Management — /admin/answers (AdminRoute guarded).
 *
 * Teachers pick a subject, pick a question, and attach an answer in its
 * original format: formatted TEXT, an IMAGE (jpg/png/webp), or a PDF
 * document. Files are stored unmodified and served to students exactly as
 * uploaded — never converted to text.
 */

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_PDF = 25 * 1024 * 1024;
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

const ANSWER_TYPE_BADGE = {
  text: { label: 'TEXT ANSWER', cls: 'bg-success-50 text-success border-success-500/30' },
  image: { label: 'IMAGE ANSWER', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  pdf: { label: 'PDF ANSWER', cls: 'bg-warning-50 text-warning border-warning-500/30' },
};

const fmtSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AnswerTypeBadge = ({ type }) => {
  if (!type) return <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide bg-white text-muted border-line">NO ANSWER</span>;
  const b = ANSWER_TYPE_BADGE[type] || { label: type.toUpperCase(), cls: 'bg-muted-100 text-secondary border-muted-300' };
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${b.cls}`}>{b.label}</span>;
};

const AdminAnswersPage = () => {
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState('');
  const [questions, setQuestions] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);   // current question row
  const [detail, setDetail] = useState(null);       // question detail w/ answer
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Editor state
  const [tab, setTab] = useState('text');           // text | image | pdf
  const [textValue, setTextValue] = useState('');
  const [file, setFile] = useState(null);           // File object
  const [previewUrl, setPreviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load subjects that actually have questions.
  useEffect(() => {
    (async () => {
      try {
        const qs = await api.getQuestions({ limit: 300 });
        const subs = [...new Set((qs || []).map(q => q.subject).filter(Boolean))].sort();
        setSubjects(subs);
      } catch (e) {
        setError('Could not load questions. Is the backend running?');
      }
    })();
  }, []);

  // Load questions for the selected subject.
  const loadQuestions = useCallback(async (subj) => {
    if (!subj) { setQuestions([]); return; }
    setLoading(true);
    setError('');
    try {
      const qs = await api.getQuestions({ subject: subj, limit: 300 });
      setQuestions(qs || []);
    } catch (e) {
      setError('Could not load questions for this subject.');
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQuestions(subject); }, [subject, loadQuestions]);

  // Open the editor for a question: fetch its detail (current answer included).
  const openEditor = async (q) => {
    setSelected(q);
    setError('');
    setNotice('');
    setConfirmDelete(false);
    try {
      const d = await api.request(`/api/v1/analysis/questions/${q.id}/detail`);
      setDetail(d || null);
      const t = d?.answer_type;
      setTab(t === 'image' || t === 'pdf' ? t : 'text');
      setTextValue(t === 'text' ? (d?.answer_text || '') : '');
      setFile(null);
      setPreviewUrl(null);
    } catch (e) {
      setError('Could not load the question detail.');
    }
  };

  const closeEditor = () => {
    setSelected(null);
    setDetail(null);
    setFile(null);
    setPreviewUrl(null);
    setConfirmDelete(false);
  };

  const onPickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    setError('');
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const isImage = tab === 'image';
    const max = isImage ? MAX_IMAGE : MAX_PDF;
    const okExts = isImage ? IMAGE_EXTS : ['pdf'];
    if (!okExts.includes(ext)) {
      setError(isImage ? 'Please choose a JPG, JPEG, PNG or WEBP image.' : 'Please choose a PDF document.');
      e.target.value = '';
      return;
    }
    if (f.size > max) {
      setError(`File is too large (max ${max / (1024 * 1024)} MB).`);
      e.target.value = '';
      return;
    }
    setFile(f);
    setPreviewUrl(isImage ? URL.createObjectURL(f) : URL.createObjectURL(f));
  };

  const clearFile = () => {
    setFile(null);
    setPreviewUrl(null);
  };

  // Save (create or replace) the answer.
  const saveAnswer = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('answer_type', tab);
      if (tab === 'text') {
        if (!textValue.trim()) { setError('Write the answer text first.'); setSaving(false); return; }
        fd.append('answer_text', textValue);
      } else {
        if (!file) { setError(tab === 'image' ? 'Choose an image to upload.' : 'Choose a PDF to upload.'); setSaving(false); return; }
        fd.append('file', file);
      }
      const res = await api.saveQuestionAnswer(selected.id, fd);
      setNotice(res?.message || 'Answer saved successfully.');
      // Refresh detail + list badge.
      const d = await api.request(`/api/v1/analysis/questions/${selected.id}/detail`);
      setDetail(d || null);
      setFile(null);
      setPreviewUrl(null);
      setQuestions(qs => qs.map(x => x.id === selected.id ? { ...x, has_answer: true, answer_type: tab } : x));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save the answer.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAnswer = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await api.deleteQuestionAnswer(selected.id);
      setNotice('Answer deleted.');
      const d = await api.request(`/api/v1/analysis/questions/${selected.id}/detail`);
      setDetail(d || null);
      setTextValue('');
      setQuestions(qs => qs.map(x => x.id === selected.id ? { ...x, has_answer: false, answer_type: null } : x));
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete the answer.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = questions.filter(q =>
    !search || (q.question_text || '').toLowerCase().includes(search.toLowerCase())
  );
  const answeredCount = questions.filter(q => q.has_answer).length;
  const hasExisting = !!(detail && detail.answer_type);

  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Answer Management</h1>
          <p className="text-muted max-w-3xl">
            Attach teacher answers to practice questions. Text answers render as formatted text;
            images and PDF documents are shown to students exactly as uploaded, never converted.
          </p>
        </motion.div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-error-500/30 text-error text-sm flex items-center gap-2">
            <ExclamationTriangleIcon className="h-4 w-4" /> {error}
          </div>
        )}
        {notice && (
          <div className="mb-6 p-3 rounded-xl bg-success-50 border border-success-500/30 text-success text-sm flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4" /> {notice}
          </div>
        )}

        {/* Subject picker */}
        <div className="bg-white rounded-2xl border border-line p-5 mb-6">
          <label htmlFor="subject-select" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">1 · Choose subject</label>
          <select id="subject-select" value={subject} onChange={(e) => { setSubject(e.target.value); setSelected(null); setDetail(null); }}
            className="w-full sm:w-auto min-w-[260px] bg-white border border-line rounded-xl px-4 py-2.5 text-primary focus:outline-hidden focus:border-brand-500">
            <option value="" className="bg-muted-50">— Select a subject —</option>
            {subjects.map(s => <option key={s} value={s} className="bg-muted-50">{s}</option>)}
          </select>
          {subject && (
            <p className="text-muted text-xs mt-2">{questions.length} question{questions.length !== 1 ? 's' : ''} · {answeredCount} with a published answer</p>
          )}
        </div>

        {subject && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Question list */}
            <div className="bg-white rounded-2xl border border-line p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-secondary uppercase tracking-wide">2 · Pick a question</h2>
                <div className="relative">
                  <MagnifyingGlassIcon className="h-4 w-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…"
                    className="w-44 sm:w-56 bg-white border border-line rounded-lg pl-9 pr-3 py-1.5 text-sm text-primary placeholder:text-faint focus:outline-hidden focus:border-brand-500" />
                </div>
              </div>
              {loading ? (
                <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-muted text-sm py-8 text-center">No questions found. Run a paper analysis first.</p>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {filtered.map(q => (
                    <button key={q.id} onClick={() => openEditor(q)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === q.id ? 'bg-brand-500/15 border-brand-500/40' : 'bg-white border-line hover:bg-muted-100'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-primary text-sm leading-snug line-clamp-2 flex-1">{q.question_text}</p>
                        <AnswerTypeBadge type={q.answer_type || (q.has_answer ? 'text' : null)} />
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted">
                        {q.topic && <span className="bg-white rounded px-1.5 py-0.5">{q.topic}</span>}
                        {q.marks && <span>{q.marks} marks</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Editor */}
            <div className="bg-white rounded-2xl border border-line p-5">
              <h2 className="text-sm font-semibold text-secondary uppercase tracking-wide mb-4">3 · Manage the answer</h2>
              {!selected ? (
                <p className="text-muted text-sm py-10 text-center">Select a question to view or edit its answer.</p>
              ) : (
                <div className="space-y-5">
                  <div className="p-3 rounded-xl bg-white border border-line">
                    <p className="text-primary text-sm">{selected.question_text}</p>
                  </div>

                  {/* Current answer status */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-line">
                    <div className="flex items-center gap-2">
                      <AnswerTypeBadge type={detail?.answer_type} />
                      {detail?.answer_type && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-success">
                          <CheckCircleIcon className="h-3.5 w-3.5" /> Published
                        </span>
                      )}
                    </div>
                    {hasExisting && (
                      confirmDelete ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-error">Delete this answer?</span>
                          <button onClick={deleteAnswer} disabled={saving} className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-primary text-xs font-medium">Yes, delete</button>
                          <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1 rounded-lg bg-muted-100 text-secondary text-xs">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(true)} className="p-1.5 rounded-lg text-error hover:bg-red-500/10" aria-label="Delete answer">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )
                    )}
                  </div>

                  {/* Existing file answer preview */}
                  {hasExisting && detail.answer_type !== 'text' && detail.answer_url && (
                    <div className="p-3 rounded-xl border border-line bg-white">
                      <p className="text-[11px] text-muted mb-2">Current {detail.answer_type === 'image' ? 'image' : 'document'}: <span className="text-secondary">{detail.answer_file_name}</span>{detail.answer_file_size ? ` · ${fmtSize(detail.answer_file_size)}` : ''}</p>
                      {detail.answer_type === 'image' ? (
                        <img src={detail.answer_url} alt="Current answer" className="max-h-40 rounded-lg border border-line" />
                      ) : (
                        <a href={detail.answer_url} target="_blank" rel="noreferrer" className="text-accent text-sm underline hover:text-accent-2">Open current PDF</a>
                      )}
                    </div>
                  )}
                  {hasExisting && detail.answer_type === 'text' && (
                    <div className="p-3 rounded-xl border border-line bg-white">
                      <p className="text-[11px] text-muted mb-2">Current text answer:</p>
                      <FormattedText text={detail.answer_text} />
                    </div>
                  )}

                  {/* Answer type tabs */}
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Answer format</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'text', label: 'Text Answer', icon: DocumentTextIcon },
                        { id: 'image', label: 'Upload Image', icon: PhotoIcon },
                        { id: 'pdf', label: 'Upload Document', icon: DocumentIcon },
                      ].map(t => (
                        <button key={t.id} onClick={() => { setTab(t.id); clearFile(); }}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${tab === t.id ? 'bg-brand-500/20 border-brand-300 text-primary' : 'bg-white border-line text-muted hover:bg-muted-100'}`}>
                          <t.icon className="h-5 w-5" /> {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input area per format */}
                  {tab === 'text' && (
                    <div>
                      <label htmlFor="answer-text" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Write the answer</label>
                      <textarea id="answer-text" value={textValue} onChange={(e) => setTextValue(e.target.value)}
                        placeholder={'Write the complete answer…\n\nSupports paragraphs, line breaks,\n- bullet points\n1. numbered steps\n> quotes and indents'}
                        className="w-full h-44 bg-white border border-line rounded-xl p-4 text-primary text-sm placeholder:text-faint focus:outline-hidden focus:border-brand-500 resize-y" />
                      <p className="text-[11px] text-muted mt-1.5">Blank line starts a new paragraph. Lines starting with “- ” become bullets, “1.” numbered steps, “&gt;” quotes.</p>
                      {textValue.trim() && (
                        <div className="mt-3 p-3 rounded-xl border border-line bg-white">
                          <p className="text-[11px] text-muted mb-2">Preview:</p>
                          <FormattedText text={textValue} />
                        </div>
                      )}
                    </div>
                  )}

                  {tab !== 'text' && (
                    <div>
                      <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                        {tab === 'image' ? `Upload image (JPG, JPEG, PNG, WEBP · max ${MAX_IMAGE / (1024 * 1024)} MB)` : `Upload document (PDF · max ${MAX_PDF / (1024 * 1024)} MB)`}
                      </label>
                      {!file ? (
                        <label className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-line hover:border-brand-300 hover:bg-white cursor-pointer transition-colors">
                          <CloudArrowUpIcon className="h-8 w-8 text-muted" />
                          <span className="text-muted text-sm">Click to choose a {tab === 'image' ? 'image' : 'PDF'} file</span>
                          <input type="file" accept={tab === 'image' ? 'image/jpeg,image/png,image/webp' : 'application/pdf'} onChange={onPickFile} className="hidden" />
                        </label>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-3 rounded-xl border border-line bg-white">
                            <p className="text-[11px] text-muted mb-2">Preview before saving:</p>
                            {tab === 'image' ? (
                              <img src={previewUrl} alt="Upload preview" className="max-h-56 rounded-lg border border-line" />
                            ) : (
                              <iframe src={previewUrl} title="Upload preview" className="w-full h-48 rounded-lg border border-line bg-white" />
                            )}
                            <p className="text-xs text-secondary mt-2">{file.name} · {fmtSize(file.size)}</p>
                          </div>
                          <button onClick={clearFile} className="text-xs text-muted hover:text-primary underline">Choose a different file</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Save / replace */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <button onClick={saveAnswer} disabled={saving}
                      className="btn btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
                      {saving ? 'Saving…' : hasExisting ? 'Replace Answer' : 'Save & Publish Answer'}
                    </button>
                    <button onClick={closeEditor} className="btn btn-secondary">Close</button>
                  </div>
                  {hasExisting && (
                    <p className="text-[11px] text-warning flex items-center gap-1.5">
                      <ArrowPathIcon className="h-3.5 w-3.5" /> Saving replaces the current answer (the previous file is removed).
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminAnswersPage;
