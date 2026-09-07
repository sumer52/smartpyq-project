import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CloudArrowUpIcon, DocumentIcon, CheckCircleIcon,
  ExclamationTriangleIcon, XMarkIcon, TagIcon,
  AcademicCapIcon, CalendarIcon, BuildingLibraryIcon,
  MagnifyingGlassIcon, PhotoIcon, ArrowPathIcon,
  PencilSquareIcon, SparklesIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import { apiClient } from '../lib/api';
import {
  pyqData, getStreams, getSpecializations,
  getAllSubjectsForStreamSemester, getAvailableSemesters, getPyqYears
} from '../data/pyqData';
import { checkMetadata, applyCorrections, getConfidenceLabel } from '../lib/spellCheck';

const universities = [
  'Osmania University',
  'University of Hyderabad',
  'Jawaharlal Nehru Technological University',
  'Kakatiya University',
  'Palamuru University',
  'Satavahana University',
  'Telangana University',
  'Other'
];

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const UploadStepper = ({ onUploadComplete, onCancel }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadData, setUploadData] = useState({
    file: null, title: '', stream: '', semester: '',
    subject: '', year: new Date().getFullYear(),
    university: 'Osmania University', tags: [], description: '',
    specialization: ''
  });
  const [errors, setErrors] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisConfidence, setAnalysisConfidence] = useState(0);

  // Detected questions for review
  const [detectedQuestions, setDetectedQuestions] = useState([]);

  // Spelling correction state
  const [corrections, setCorrections] = useState([]);
  const [showCorrections, setShowCorrections] = useState(false);
  const [acceptedCorrections, setAcceptedCorrections] = useState({});

  const steps = [
    { id: 1, title: 'Select File', desc: 'Upload paper' },
    { id: 2, title: 'Review & Edit', desc: 'Verify details' },
    { id: 3, title: 'Confirm Upload', desc: 'Submit' }
  ];

  // Stream data
  const streamsData = getStreams();
  const streams = Object.entries(streamsData).map(([key, stream]) => ({
    key, name: stream.name, displayName: stream.displayName
  }));

  // Cascading: available semesters for selected stream
  const availableSemesters = useMemo(() => {
    if (!uploadData.stream) return [];
    return getAvailableSemesters(uploadData.stream);
  }, [uploadData.stream]);

  // Cascading: available subjects for selected stream + semester
  const availableSubjects = useMemo(() => {
    if (!uploadData.stream || !uploadData.semester) return [];
    return getAllSubjectsForStreamSemester(uploadData.stream, uploadData.semester);
  }, [uploadData.stream, uploadData.semester]);

  // Title suggestions
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const titleInputRef = useRef(null);

  const fetchTitleSuggestions = useCallback(async (query) => {
    if (!query || query.length < 2) { setTitleSuggestions([]); return; }
    try {
      const res = await apiClient.getPapers({ q: query, limit: 8 });
      const papers = res.papers || res || [];
      const titles = [...new Set(papers.map(p => p.title).filter(Boolean))];
      setTitleSuggestions(titles.slice(0, 6));
    } catch { setTitleSuggestions([]); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (uploadData.title) fetchTitleSuggestions(uploadData.title); }, 300);
    return () => clearTimeout(timer);
  }, [uploadData.title, fetchTitleSuggestions]);

  // Year suggestions
  const [yearSuggestions, setYearSuggestions] = useState([]);
  const fetchYearSuggestions = useCallback(async () => {
    if (!uploadData.stream || !uploadData.semester || !uploadData.subject) { setYearSuggestions([]); return; }
    try {
      const res = await apiClient.getPapers({
        stream: uploadData.stream, semester: uploadData.semester,
        subject: uploadData.subject, university: uploadData.university, limit: 100
      });
      const papers = res.papers || res || [];
      const years = [...new Set(papers.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
      setYearSuggestions(years);
    } catch { setYearSuggestions([]); }
  }, [uploadData.stream, uploadData.semester, uploadData.subject, uploadData.university]);

  useEffect(() => { fetchYearSuggestions(); }, [fetchYearSuggestions]);

  // Cascading resets
  const handleStreamChange = (value) => {
    setUploadData(prev => ({ ...prev, stream: value, semester: '', subject: '', specialization: '' }));
    if (errors.stream) setErrors(prev => ({ ...prev, stream: '' }));
  };
  const handleSemesterChange = (value) => {
    setUploadData(prev => ({ ...prev, semester: value, subject: '' }));
    if (errors.semester) setErrors(prev => ({ ...prev, semester: '' }));
  };
  const handleSubjectChange = (value) => {
    setUploadData(prev => ({ ...prev, subject: value }));
    if (errors.subject) setErrors(prev => ({ ...prev, subject: '' }));
  };
  const handleYearChange = (value) => {
    setUploadData(prev => ({ ...prev, year: parseInt(value) || '' }));
    if (errors.year) setErrors(prev => ({ ...prev, year: '' }));
  };
  const handleInputChange = (field, value) => {
    setUploadData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  // ─── File Validation ──────────────────────────────────────────────────────
  const validateFile = (file) => {
    if (!file) return { file: 'Please select a file' };

    const fileName = file.name || '';
    const ext = '.' + fileName.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return { file: 'Unsupported file type. Please upload a PDF, JPG, JPEG, PNG, or WEBP file.' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { file: 'File size must be less than 50MB' };
    }

    if (file.size === 0) {
      return { file: 'The file is empty. Please select a valid file.' };
    }

    return {};
  };

  // ─── Form Validation ──────────────────────────────────────────────────────
  const validateForm = () => {
    const e = {};
    if (!uploadData.title.trim()) e.title = 'Paper title is required';
    if (!uploadData.stream) e.stream = 'Please select a course';
    if (!uploadData.semester) e.semester = 'Please select a semester';
    if (!uploadData.subject) e.subject = 'Please select a subject';
    if (!uploadData.year || uploadData.year < 2000 || uploadData.year > new Date().getFullYear() + 1)
      e.year = 'Enter a valid PYQ year';
    if (!uploadData.university) e.university = 'Please select a university';
    return e;
  };

  // ─── File Handlers ────────────────────────────────────────────────────────
  const handleFileSelect = async (files) => {
    const file = files[0];
    if (!file) return;

    const errs = validateFile(file);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    // Set file and begin analysis
    setUploadData(prev => ({ ...prev, file }));
    setErrors({});
    setAnalysisError(null);
    setAnalysisResult(null);
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiClient.analyzePaper(formData);

      setAnalysisResult(result);
      setAnalysisConfidence(result.confidence || 0);

      // Apply detected metadata to form fields
      if (result.metadata) {
        const m = result.metadata;
        setUploadData(prev => ({
          ...prev,
          title: m.title || prev.title,
          stream: m.stream ? m.stream.toLowerCase() : prev.stream,
          semester: m.semester || prev.semester,
          subject: m.subject || prev.subject,
          year: m.year || prev.year,
          university: m.university || prev.university,
          exam_type: m.exam_type || prev.exam_type,
        }));
      }

      // Set detected questions for review
      setDetectedQuestions(result.questions || []);

      // Auto-advance to review step
      setIsAnalyzing(false);
      setCurrentStep(2);
    } catch (error) {
      setIsAnalyzing(false);
      setAnalysisError(
        error?.data?.detail || error?.message || 'Analysis failed. You can still upload by filling in details manually.'
      );
      // Allow manual entry even if analysis fails
      setCurrentStep(2);
    }
  };

  const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(e.type === 'dragenter' || e.type === 'dragover'); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files); };

  // ─── Tags ─────────────────────────────────────────────────────────────────
  const addTag = (tag) => {
    const t = tag.trim().toLowerCase();
    if (t && !uploadData.tags.includes(t)) setUploadData(prev => ({ ...prev, tags: [...prev.tags, t] }));
  };
  const removeTag = (tag) => setUploadData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  const handleTagKeyPress = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(e.target.value); e.target.value = ''; } };

  // ─── Questions Editing ────────────────────────────────────────────────────
  const updateQuestionText = (index, text) => {
    setDetectedQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], question_text: text };
      return updated;
    });
  };

  const updateQuestionMarks = (index, marks) => {
    setDetectedQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], marks: marks ? parseInt(marks) : null };
      return updated;
    });
  };

  const updateQuestionSection = (index, section) => {
    setDetectedQuestions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], section };
      return updated;
    });
  };

  const removeQuestion = (index) => {
    setDetectedQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const addQuestion = () => {
    setDetectedQuestions(prev => [
      ...prev,
      {
        question_number: String(prev.length + 1),
        question_text: '',
        section: '',
        marks: null,
        question_type: 'descriptive'
      }
    ]);
  };

  // ─── Spelling Correction ──────────────────────────────────────────────────
  const runSpellCheck = () => {
    const found = checkMetadata(uploadData);
    if (found.length > 0) {
      setCorrections(found);
      setShowCorrections(true);
      // Auto-accept high-confidence corrections (> 0.85)
      const autoAccepted = {};
      found.forEach(c => {
        if (c.confidence >= 0.85) autoAccepted[c.field] = true;
      });
      setAcceptedCorrections(autoAccepted);
    } else {
      setCurrentStep(3);
    }
  };

  const applyAndContinue = () => {
    const toApply = corrections.filter(c => acceptedCorrections[c.field]);
    if (toApply.length > 0) {
      const corrected = applyCorrections(uploadData, toApply);
      setUploadData(corrected);
    }
    setShowCorrections(false);
    setCorrections([]);
    setCurrentStep(3);
  };

  const skipCorrections = () => {
    setShowCorrections(false);
    setCorrections([]);
    setCurrentStep(3);
  };

  // ─── Navigation ───────────────────────────────────────────────────────────
  const nextStep = () => {
    if (currentStep === 2) {
      const e = validateForm();
      if (Object.keys(e).length > 0) { setErrors(e); return; }
      // Run spell check before going to confirm step
      runSpellCheck();
      return;
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const interval = setInterval(() => {
        setUploadProgress(prev => { if (prev >= 90) { clearInterval(interval); return prev; } return prev + Math.random() * 15; });
      }, 200);

      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('title', uploadData.title);
      formData.append('subject', uploadData.subject);
      formData.append('university', uploadData.university);
      formData.append('stream', uploadData.stream);
      formData.append('semester', uploadData.semester);
      formData.append('exam', 'University Exam');
      formData.append('year', uploadData.year.toString());
      formData.append('tags', uploadData.tags.join(','));
      if (uploadData.description) formData.append('description', uploadData.description);

      const response = await apiClient.uploadPaper(formData);
      clearInterval(interval);
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        onUploadComplete?.({ ...uploadData, ...response });
      }, 1500);
    } catch (error) {
      const msg = error?.message || 'Upload failed. Please try again.';
      setErrors({ submit: msg });
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (file) => {
    if (!file) return null;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return <PhotoIcon className="h-7 w-7 text-blue-400" />;
    }
    return <DocumentIcon className="h-7 w-7 text-red-400" />;
  };

  const getFileTypeLabel = (file) => {
    if (!file) return '';
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'PDF Document';
    if (['jpg', 'jpeg'].includes(ext)) return 'JPEG Image';
    if (ext === 'png') return 'PNG Image';
    if (ext === 'webp') return 'WebP Image';
    return 'Document';
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 0.7) return 'text-green-400';
    if (conf >= 0.4) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const stepAnim = { hidden: { opacity: 0, x: 40 }, visible: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -40 } };
  const inputClass = (field) =>
    'w-full px-4 py-3 bg-white/5 border rounded-xl text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50 transition-all duration-200' +
    (errors[field] ? ' border-red-500/50' : ' border-white/10 hover:border-white/20');

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/10 overflow-hidden shadow-xl shadow-black/10">
      {/* Step Header */}
      <div className="px-6 py-5 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Upload Question Paper</h2>
          {onCancel && (
            <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex items-center gap-2">
                <div className={'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ' +
                  (currentStep > step.id ? 'bg-green-500 text-white' :
                   currentStep === step.id ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300' :
                   'bg-white/5 text-gray-500 border border-white/10')}>
                  {currentStep > step.id ? <CheckCircleIconSolid className="h-4 w-4" /> : step.id}
                </div>
                <div className="hidden md:block">
                  <div className={'text-xs font-medium ' + (currentStep >= step.id ? 'text-white' : 'text-gray-500')}>{step.title}</div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={'flex-1 h-px ' + (currentStep > step.id ? 'bg-green-500/40' : 'bg-white/10')} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="p-6">
        <AnimatePresence mode="wait">

          {/* ══════════════════════════════════════════════════════════════════════
              STEP 1: File Selection
             ══════════════════════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <motion.div key="step1" variants={stepAnim} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.3 }}>
              <div className="text-center mb-6">
                <h3 className="text-base font-semibold text-white mb-1">Select Your Question Paper</h3>
                <p className="text-sm text-gray-400">Upload a PDF or image of the exam paper (up to 50MB)</p>
              </div>

              {/* Drop zone */}
              <div
                className={'relative border-2 border-dashed rounded-2xl p-10 transition-all duration-200 cursor-pointer group ' +
                  (dragActive ? 'border-purple-500 bg-purple-500/5' :
                   uploadData.file ? 'border-green-500/40 bg-green-500/5' :
                   errors.file ? 'border-red-500/40 bg-red-500/5' :
                   'border-white/10 hover:border-white/20 hover:bg-white/[0.02]')}
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                onClick={() => !uploadData.file && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />

                {/* Analyzing state */}
                {isAnalyzing ? (
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                      <ArrowPathIcon className="h-7 w-7 text-purple-400 animate-spin" />
                    </div>
                    <p className="text-white font-medium text-sm">Analyzing document...</p>
                    <p className="text-gray-400 text-xs mt-1">Extracting text and detecting metadata</p>
                    <div className="mt-4 w-48 bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        className="bg-purple-500 h-1.5 rounded-full"
                        initial={{ width: '0%' }}
                        animate={{ width: '80%' }}
                        transition={{ duration: 8, ease: 'linear' }}
                      />
                    </div>
                  </div>
                ) : uploadData.file ? (
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4">
                      <CheckCircleIcon className="h-7 w-7 text-green-400" />
                    </div>
                    <p className="text-white font-medium text-sm">{uploadData.file.name}</p>
                    <p className="text-gray-400 text-xs mt-1">
                      {formatFileSize(uploadData.file.size)} &bull; {getFileTypeLabel(uploadData.file)}
                    </p>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      setUploadData(prev => ({ ...prev, file: null }));
                      setAnalysisResult(null);
                      setDetectedQuestions([]);
                    }}
                      className="mt-3 text-xs text-gray-400 hover:text-white transition-colors">
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-200">
                      <CloudArrowUpIcon className="h-7 w-7 text-gray-400 group-hover:text-purple-400 transition-colors" />
                    </div>
                    <p className="text-white font-medium text-sm">Drop your file here or click to browse</p>
                    <p className="text-gray-500 text-xs mt-1">PDF, JPG, JPEG, PNG, or WEBP &bull; Up to 50MB</p>
                  </div>
                )}
              </div>

              {/* Error */}
              {errors.file && (
                <motion.div className="mt-3 flex items-center gap-2 text-red-400 text-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ExclamationTriangleIcon className="h-4 w-4" /> {errors.file}
                </motion.div>
              )}

              {/* Analysis error (non-blocking) */}
              {analysisError && (
                <motion.div className="mt-3 flex items-start gap-2 text-yellow-400 text-sm p-3 bg-yellow-500/5 border border-yellow-500/15 rounded-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Could not auto-detect details</p>
                    <p className="text-yellow-400/70 text-xs mt-0.5">{analysisError}</p>
                  </div>
                </motion.div>
              )}

              {/* File format hint */}
              {!uploadData.file && !isAnalyzing && (
                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <DocumentIcon className="h-4 w-4" />
                    <span>PDF</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PhotoIcon className="h-4 w-4" />
                    <span>JPG / PNG / WEBP</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              STEP 2: Review & Edit Detected Information
             ══════════════════════════════════════════════════════════════════════ */}
          {currentStep === 2 && (
            <motion.div key="step2" variants={stepAnim} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.3 }}>
              {/* File info bar */}
              <div className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/5 mb-5">
                {getFileIcon(uploadData.file)}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{uploadData.file?.name}</p>
                  <p className="text-gray-500 text-xs">{formatFileSize(uploadData.file?.size)} &bull; {getFileTypeLabel(uploadData.file)}</p>
                </div>
                {analysisResult?.success && (
                  <div className="flex items-center gap-1 text-xs">
                    <SparklesIcon className="h-3.5 w-3.5 text-purple-400" />
                    <span className={getConfidenceColor(analysisConfidence)}>
                      {Math.round(analysisConfidence * 100)}% detected
                    </span>
                  </div>
                )}
              </div>

              {/* Analysis error banner */}
              {analysisError && (
                <div className="mb-5 flex items-start gap-2 text-yellow-400 text-sm p-3 bg-yellow-500/5 border border-yellow-500/15 rounded-xl">
                  <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Auto-detection partially failed</p>
                    <p className="text-yellow-400/70 text-xs mt-0.5">Please review and correct the details below before uploading.</p>
                  </div>
                </div>
              )}

              <div className="text-center mb-5">
                <h3 className="text-base font-semibold text-white mb-1">Review Detected Information</h3>
                <p className="text-sm text-gray-400">Verify and correct any auto-detected details before uploading</p>
              </div>

              <div className="space-y-5">

                {/* ─── Paper Details Section ─── */}
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <PencilSquareIcon className="h-3.5 w-3.5" />
                    Paper Details
                  </h4>
                  <div className="space-y-4">
                    {/* Title */}
                    <div className="relative">
                      <label className="block text-xs font-medium text-gray-300 mb-1.5">Paper Title *</label>
                      <div className="relative">
                        <input ref={titleInputRef} type="text" value={uploadData.title}
                          onChange={(e) => handleInputChange('title', e.target.value)}
                          onFocus={() => titleSuggestions.length > 0 && setShowTitleSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 200)}
                          className={inputClass('title')} placeholder="e.g., Data Structures - Final Exam 2024" />
                        {uploadData.title && <MagnifyingGlassIcon className="h-4 w-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2" />}
                      </div>
                      {showTitleSuggestions && titleSuggestions.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                          {titleSuggestions.map((title, i) => (
                            <button key={i} className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl"
                              onMouseDown={(e) => { e.preventDefault(); handleInputChange('title', title); setShowTitleSuggestions(false); }}>
                              {title}
                            </button>
                          ))}
                        </div>
                      )}
                      {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title}</p>}
                    </div>

                    {/* Stream */}
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1.5"><AcademicCapIcon className="h-3.5 w-3.5 inline mr-1" />Stream *</label>
                      <select value={uploadData.stream} onChange={(e) => handleStreamChange(e.target.value)} className={inputClass('stream')}>
                        <option value="">Select Stream</option>
                        {streams.map(s => <option key={s.key} value={s.key}>{s.displayName}</option>)}
                      </select>
                      {errors.stream && <p className="mt-1 text-xs text-red-400">{errors.stream}</p>}
                    </div>

                    {/* Semester */}
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1.5">Semester *</label>
                      <select value={uploadData.semester} onChange={(e) => handleSemesterChange(e.target.value)}
                        className={inputClass('semester')} disabled={!uploadData.stream}>
                        <option value="">{uploadData.stream ? 'Select Semester' : 'Select stream first'}</option>
                        {availableSemesters.map(s => (
                          <option key={s} value={s}>Semester {s.replace('sem', '')}</option>
                        ))}
                      </select>
                      {errors.semester && <p className="mt-1 text-xs text-red-400">{errors.semester}</p>}
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1.5">Subject *</label>
                      <select value={uploadData.subject} onChange={(e) => handleSubjectChange(e.target.value)}
                        className={inputClass('subject')} disabled={!uploadData.semester}>
                        <option value="">{uploadData.semester ? 'Select Subject' : 'Select semester first'}</option>
                        {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {errors.subject && <p className="mt-1 text-xs text-red-400">{errors.subject}</p>}
                    </div>

                    {/* Year */}
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1.5"><CalendarIcon className="h-3.5 w-3.5 inline mr-1" />PYQ Year *</label>
                      <select value={uploadData.year} onChange={(e) => handleYearChange(e.target.value)}
                        className={inputClass('year')} disabled={!uploadData.subject}>
                        <option value="">{uploadData.subject ? 'Select Year' : 'Select subject first'}</option>
                        {yearSuggestions.length > 0 && (
                          <optgroup label="Years with existing papers">
                            {yearSuggestions.map(y => <option key={y} value={y}>{y}</option>)}
                          </optgroup>
                        )}
                        <optgroup label="All available years">
                          {getPyqYears().filter(y => !yearSuggestions.includes(y)).map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </optgroup>
                      </select>
                      {errors.year && <p className="mt-1 text-xs text-red-400">{errors.year}</p>}
                    </div>

                    {/* University */}
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1.5"><BuildingLibraryIcon className="h-3.5 w-3.5 inline mr-1" />University *</label>
                      <select value={uploadData.university} onChange={(e) => handleInputChange('university', e.target.value)}
                        className={inputClass('university')}>
                        {universities.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      {errors.university && <p className="mt-1 text-xs text-red-400">{errors.university}</p>}
                    </div>
                  </div>
                </div>

                {/* ─── Tags & Description ─── */}
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Additional Info</h4>
                  <div className="space-y-4">
                    {/* Tags */}
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1.5"><TagIcon className="h-3.5 w-3.5 inline mr-1" />Tags (optional)</label>
                      <input type="text" onKeyPress={handleTagKeyPress} className={inputClass('tags')}
                        placeholder="Press Enter to add tags (e.g., algorithms, mid-term)" />
                      {uploadData.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {uploadData.tags.map((tag, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-lg text-xs">
                              {tag}
                              <button onClick={() => removeTag(tag)} className="hover:text-white transition-colors"><XMarkIcon className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs font-medium text-gray-300 mb-1.5">Description (optional)</label>
                      <textarea value={uploadData.description} onChange={(e) => handleInputChange('description', e.target.value)}
                        rows={2} className={inputClass('description') + ' resize-none'}
                        placeholder="Any additional notes about this paper..." />
                    </div>
                  </div>
                </div>

                {/* ─── Detected Questions Section ─── */}
                {detectedQuestions.length > 0 && (
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <SparklesIcon className="h-3.5 w-3.5 text-purple-400" />
                        Detected Questions ({detectedQuestions.length})
                      </h4>
                      <span className="text-xs text-gray-500">Edit below or remove incorrect entries</span>
                    </div>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {detectedQuestions.map((q, i) => (
                        <div key={i} className="p-3 bg-white/[0.03] rounded-lg border border-white/5 group">
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold mt-0.5">
                              {q.question_number || i + 1}
                            </span>
                            <div className="flex-1 min-w-0 space-y-2">
                              <textarea
                                value={q.question_text}
                                onChange={(e) => updateQuestionText(i, e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-gray-500 focus:ring-1 focus:ring-purple-500/30 focus:border-purple-500/50 resize-none"
                                placeholder="Question text..."
                              />
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={q.marks || ''}
                                  onChange={(e) => updateQuestionMarks(i, e.target.value)}
                                  className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-gray-500 focus:ring-1 focus:ring-purple-500/30"
                                  placeholder="Marks"
                                />
                                <input
                                  type="text"
                                  value={q.section || ''}
                                  onChange={(e) => updateQuestionSection(i, e.target.value)}
                                  className="flex-1 px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs placeholder-gray-500 focus:ring-1 focus:ring-purple-500/30"
                                  placeholder="Section (e.g., Section A)"
                                />
                                <button
                                  onClick={() => removeQuestion(i)}
                                  className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded"
                                  title="Remove question"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={addQuestion}
                      className="mt-3 w-full py-2 border border-dashed border-white/10 rounded-xl text-gray-400 text-xs hover:border-purple-500/30 hover:text-purple-300 transition-colors"
                    >
                      + Add Question
                    </button>
                  </div>
                )}

                {/* Show add questions button even if none detected */}
                {detectedQuestions.length === 0 && (
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Questions</h4>
                    </div>
                    <p className="text-gray-500 text-xs mb-3">No questions were auto-detected. You can add them manually below.</p>
                    <button
                      onClick={addQuestion}
                      className="w-full py-2 border border-dashed border-white/10 rounded-xl text-gray-400 text-xs hover:border-purple-500/30 hover:text-purple-300 transition-colors"
                    >
                      + Add Question
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="mt-6 flex justify-between">
                <button onClick={prevStep} className="btn btn-ghost px-5 py-2.5 text-sm">Back</button>
                <button onClick={nextStep} className="btn btn-primary px-6 py-2.5 text-sm">Review Upload</button>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              SPELL CHECK CORRECTION REVIEW
             ══════════════════════════════════════════════════════════════════════ */}
          {showCorrections && corrections.length > 0 && (
            <motion.div key="corrections" variants={stepAnim} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.3 }}>
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3">
                  <SparklesIcon className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">Spelling Corrections Detected</h3>
                <p className="text-sm text-gray-400">We found {corrections.length} potential {corrections.length === 1 ? 'correction' : 'corrections'} in your metadata. Review and accept or reject each.</p>
              </div>

              <div className="space-y-3">
                {corrections.map((c, i) => {
                  const conf = getConfidenceLabel(c.confidence);
                  return (
                    <motion.div key={c.field} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="p-4 bg-white/[0.03] rounded-xl border border-white/5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-gray-400">{c.label}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${conf.bg} ${conf.color}`}>{conf.label}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-red-400 line-through">{c.original}</span>
                            <span className="text-gray-500">→</span>
                            <span className="text-green-400 font-medium">{c.correctedDisplay || c.corrected}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setAcceptedCorrections(prev => ({ ...prev, [c.field]: !prev[c.field] }))}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                              acceptedCorrections[c.field]
                                ? 'bg-green-500/20 border-green-500/30 text-green-400'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                            }`}>
                            {acceptedCorrections[c.field] ? '✓ Accepted' : 'Accept'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-between">
                <button onClick={() => { setShowCorrections(false); setCorrections([]); }} className="btn btn-ghost px-5 py-2.5 text-sm">Back to Edit</button>
                <div className="flex gap-3">
                  <button onClick={skipCorrections} className="btn btn-ghost px-5 py-2.5 text-sm text-gray-400">Skip All</button>
                  <button onClick={applyAndContinue} className="btn btn-primary px-6 py-2.5 text-sm">
                    Apply {Object.values(acceptedCorrections).filter(Boolean).length} & Continue
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════
              STEP 3: Confirm & Upload
             ══════════════════════════════════════════════════════════════════════ */}
          {currentStep === 3 && !showCorrections && (
            <motion.div key="step3" variants={stepAnim} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.3 }}>
              <div className="text-center mb-6">
                <h3 className="text-base font-semibold text-white mb-1">Confirm Your Upload</h3>
                <p className="text-sm text-gray-400">Double-check the details before uploading to the PYQ Hub</p>
              </div>

              <div className="bg-white/[0.03] rounded-xl border border-white/5 p-5 mb-6">
                <div className="space-y-3">
                  {/* File info */}
                  <div className="flex items-start gap-3 pb-3 border-b border-white/5">
                    {getFileIcon(uploadData.file)}
                    <div>
                      <p className="text-white text-sm font-medium">{uploadData.file?.name}</p>
                      <p className="text-gray-500 text-xs">{formatFileSize(uploadData.file?.size)} &bull; {getFileTypeLabel(uploadData.file)}</p>
                    </div>
                  </div>

                  {/* Metadata grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-500 text-xs block">Title</span><span className="text-white">{uploadData.title}</span></div>
                    <div><span className="text-gray-500 text-xs block">Stream</span><span className="text-white">{streams.find(s => s.key === uploadData.stream)?.displayName || uploadData.stream}</span></div>
                    <div><span className="text-gray-500 text-xs block">Semester</span><span className="text-white">{uploadData.semester ? 'Semester ' + uploadData.semester.replace('sem', '') : '-'}</span></div>
                    <div><span className="text-gray-500 text-xs block">Subject</span><span className="text-white">{uploadData.subject}</span></div>
                    <div><span className="text-gray-500 text-xs block">PYQ Year</span><span className="text-white">{uploadData.year}</span></div>
                    <div><span className="text-gray-500 text-xs block">University</span><span className="text-white">{uploadData.university}</span></div>
                    {uploadData.tags.length > 0 && (
                      <div className="col-span-2"><span className="text-gray-500 text-xs block">Tags</span>
                        <div className="flex flex-wrap gap-1 mt-1">{uploadData.tags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-purple-500/10 text-purple-300 rounded text-xs">{tag}</span>
                        ))}</div>
                      </div>
                    )}
                    {uploadData.description && (
                      <div className="col-span-2"><span className="text-gray-500 text-xs block">Description</span>
                        <span className="text-white text-sm">{uploadData.description}</span>
                      </div>
                    )}
                  </div>

                  {/* Questions summary */}
                  {detectedQuestions.length > 0 && (
                    <div className="pt-3 border-t border-white/5">
                      <span className="text-gray-500 text-xs block mb-2">Questions ({detectedQuestions.length})</span>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {detectedQuestions.map((q, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-purple-400 font-medium flex-shrink-0">{q.question_number || i + 1}.</span>
                            <span className="text-gray-300 line-clamp-2">{q.question_text}</span>
                            {q.marks && <span className="text-gray-500 flex-shrink-0">({q.marks}m)</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload progress */}
              {isUploading && (
                <motion.div className="mb-5 p-4 bg-purple-500/5 border border-purple-500/15 rounded-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-400 border-t-transparent"></div>
                    <span className="text-purple-300 text-sm font-medium">{uploadProgress < 100 ? 'Uploading to PYQ Hub...' : 'Upload complete!'}</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1.5">
                    <motion.div className="bg-purple-500 h-1.5 rounded-full" animate={{ width: uploadProgress + '%' }} transition={{ duration: 0.3 }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">{Math.round(uploadProgress)}% complete</p>
                </motion.div>
              )}

              {/* Error */}
              {errors.submit && (
                <motion.div className="mb-5 flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/5 border border-red-500/15 rounded-xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ExclamationTriangleIcon className="h-4 w-4" /> {errors.submit}
                </motion.div>
              )}

              {/* Action buttons */}
              <div className="flex justify-between">
                <button onClick={prevStep} disabled={isUploading} className="btn btn-ghost px-5 py-2.5 text-sm disabled:opacity-50">Back</button>
                <div className="flex gap-3">
                  <button onClick={() => { setIsUploading(false); setCurrentStep(1); setUploadData(prev => ({ ...prev, file: null })); setAnalysisResult(null); setDetectedQuestions([]); }}
                    disabled={isUploading}
                    className="btn btn-ghost px-5 py-2.5 text-sm disabled:opacity-50 text-gray-400">
                    Cancel
                  </button>
                  <button onClick={handleSubmit} disabled={isUploading}
                    className="btn btn-primary px-8 py-2.5 text-sm disabled:opacity-50 flex items-center gap-2">
                    {isUploading ? (<><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>Uploading...</>)
                    : (<><CloudArrowUpIcon className="h-4 w-4" /> Confirm & Upload</>)}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default UploadStepper;
