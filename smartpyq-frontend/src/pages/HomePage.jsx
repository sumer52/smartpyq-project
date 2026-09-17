import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Bot, Search, BookOpen, Upload, TrendingUp,
  ArrowRight, Repeat, Brain, Sparkles, ChevronRight,
  BarChart3, Zap, CheckCircle, Target, Flame, Lightbulb, GraduationCap
} from 'lucide-react';
import { apiClient } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { getStreams, getAllSubjectsForStreamSemester, getAvailableSemesters, getPyqYears } from '../data/pyqData';
import MagneticButton from '../components/ui/MagneticButton';
import ThumbnailCarousel from '../components/ui/ThumbnailCarousel';
import SpotlightCard from '../components/ui/SpotlightCard';
import AnimatedBeam from '../components/ui/AnimatedBeam';
import Typewriter from '../components/ui/Typewriter';
import AuroraGradient from '../components/ui/AuroraGradient';
import BorderBeam from '../components/ui/BorderBeam';
import CursorGlow from '../components/ui/CursorGlow';
import PerspectiveGrid from '../components/ui/PerspectiveGrid';
import TextScramble from '../components/ui/TextScramble';
import Marquee from '../components/ui/Marquee';
import { Star } from 'lucide-react';
import { EASE_OUT, useReducedMotionSafe } from '../lib/motion';

/* ---- Animation Variants ---- */
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const cardUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22,1,0.36,1] } } };

/* ---- Hero artifact: an analyzed question-paper excerpt ----

   The one bold element on the page. A paper-white excerpt of a real
   question paper, annotated the way the analysis engine annotates:
   a highlight sweep over a repeated question, the exam officer's year
   stamps, and the engine's verdict chip. The reveal sequence plays once
   on load: the paper arrives blank, then "receives its analysis".
   Question text mirrors the real seeded DBMS papers (2023–2025). */
const AnnotatedPaper = () => {
  const reduced = useReducedMotion();
  const quiet = useReducedMotionSafe();
  const D = (d) => (quiet ? 0 : d);

  return (
    <div className="relative" aria-hidden="true">
      {/* ghost sheet behind, like a pile of past papers */}
      <div className="absolute inset-0 translate-x-4 translate-y-4 rotate-[1.6deg] rounded-xs bg-[#efece4]/25" />
      <div className="absolute inset-0 -translate-x-3 translate-y-2 -rotate-[1.2deg] rounded-xs bg-[#efece4]/40" />

      <motion.div
        className="relative rounded-xs bg-[#f7f4ec] text-[#231f18] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.65)]"
        initial={reduced ? false : { opacity: 0, y: 28, rotate: 2.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: D(0.7), ease: EASE_OUT }}
      >
        {/* paper header — university question-paper furniture */}
        <div className="border-b border-[#231f18]/20 px-6 pt-5 pb-3 sm:px-8">
          <div className="font-serif text-[13px] sm:text-sm tracking-wide text-[#231f18]">OSMANIA UNIVERSITY</div>
          <div className="font-serif text-[11px] sm:text-xs text-[#231f18]/60">B.Sc MSCS · Semester V · Database Systems</div>
          <div className="mt-2 flex items-center justify-between font-serif text-[11px] text-[#231f18]/50">
            <span>Time: 3 hours</span>
            <span>Max marks: 80</span>
          </div>
        </div>

        <div className="px-6 py-4 sm:px-8 space-y-3 font-serif text-[13px] sm:text-[15px] leading-snug">
          {/* PART A — short answers */}
          <div className="font-semibold tracking-wide text-[12px] sm:text-[13px]">PART A — Answer all questions. 8 × 4 = 32 marks</div>
          <ol className="space-y-1.5 text-[#231f18]/85">
            <li><span className="font-semibold">1.</span> Define DBMS and list its advantages. <span className="italic text-[#231f18]/55">(4 marks)</span></li>
            <li><span className="font-semibold">2.</span> Differentiate between primary key and foreign key. <span className="italic text-[#231f18]/55">(4 marks)</span></li>
            <li><span className="font-semibold">3.</span> What is a view in SQL? <span className="italic text-[#231f18]/55">(4 marks)</span></li>
          </ol>
          {/* PART B — long answers, where the analysis happens */}
          <div className="pt-1 font-semibold tracking-wide text-[12px] sm:text-[13px]">PART B — Answer all questions. 6 × 8 = 48 marks</div>
          <ol className="space-y-2.5">
            {/* Q9 — the repeated one: highlight + stamps + chip */}
            <li className="relative">
              <motion.span
                className="absolute -inset-x-2 -inset-y-1 -z-0 rounded-xs bg-[#ffe34d]"
                style={{ transformOrigin: 'left center' }}
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: D(0.55), delay: D(1.15), ease: EASE_OUT }}
              />
              <span className="relative z-10">
                <span className="font-semibold">9.</span> Explain normalization in DBMS with suitable examples.
                <span className="italic text-[#231f18]/55"> (8 marks)</span>
              </span>
              <motion.span
                className="absolute right-0 -top-4 font-serif text-[10px] tracking-wider text-[#b3261e]"
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: D(0.3), delay: D(1.7) }}
              >'23 '24 '25</motion.span>
              <motion.span
                className="absolute left-1/2 -translate-x-1/2 -bottom-6 whitespace-nowrap rounded-full bg-[#0b0620] px-3 py-1 text-[11px] font-medium text-cyan-200 shadow-lg"
                initial={reduced ? false : { opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: D(0.4), delay: D(2.0), ease: EASE_OUT }}
              >Asked 3 years in a row</motion.span>
            </li>
            <li className="text-[#231f18]/85">
              <span className="font-semibold">10.</span> What is a transaction? Explain ACID properties with examples.
              <span className="italic text-[#231f18]/55"> (8 marks)</span>
              <span className="ml-2 font-serif text-[10px] tracking-wider text-[#b3261e]/80">'23 '25</span>
            </li>
          </ol>
        </div>

        {/* engine signature strip */}
        <motion.div
          className="flex items-center justify-between border-t border-dashed border-[#231f18]/25 px-6 py-2.5 sm:px-8"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: D(0.4), delay: D(2.35) }}
        >
          <span className="font-sans text-[10px] uppercase tracking-[0.18em] text-[#231f18]/50">Analyzed by SmartPYQ</span>
          <span className="font-serif text-[11px] italic text-[#231f18]/55">14 questions · 3 papers · 80 marks</span>
        </motion.div>
      </motion.div>
    </div>
  );
};

/* ---- Reusable Animation Components ---- */

const WordReveal = ({ text, className, delay = 0 }) => {
  const words = text.split(/\s+/);
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          style={{ display: 'inline-block', marginRight: '0.35em' }}
          initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.5, delay: delay + i * 0.08, ease: [0.22,1,0.36,1] }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
};

const GradientText = ({ children, className = '' }) => (
  <motion.span
    className={`bg-linear-to-r from-cyan-200 via-blue-200 to-purple-200 bg-clip-text text-transparent bg-[length:200%_auto] ${className}`}
    animate={{ backgroundPosition: ['0% center', '200% center'] }}
    transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
  >
    {children}
  </motion.span>
);

const FloatingParticles = () => {
  const particles = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 15,
      delay: Math.random() * 10,
    })), []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden" aria-hidden="true">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-purple-400/20"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [0, -30, 0, 20, 0], x: [0, 15, -10, 5, 0], opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
};

const AnimatedUnderline = ({ children, className = '' }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      {children}
      <motion.span
        className="absolute -bottom-1 left-0 h-[2px] bg-linear-to-r from-purple-400 to-cyan-400 rounded-full"
        initial={{ width: 0 }}
        animate={isInView ? { width: '100%' } : { width: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.22,1,0.36,1] }}
      />
    </span>
  );
};

const ShimmerButton = ({ children, className = '', ...props }) => (
  <motion.button
    className={`relative overflow-hidden ${className}`}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    {...props}
  >
    <span className="relative z-10 flex items-center gap-2">{children}</span>
    <motion.span
      className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent"
      initial={{ x: '-100%' }}
      whileHover={{ x: '100%' }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    />
  </motion.button>
);

/* ---- AI Analysis Showcase Data (demo) ---- */
const demoRepeatedQuestions = [
  { question: 'Normalization in DBMS', times: 4, priority: 'high' },
  { question: 'ER Diagram Design', times: 3, priority: 'medium' },
  { question: 'SQL Joins & Queries', times: 5, priority: 'high' },
  { question: 'Transactions & ACID', times: 3, priority: 'medium' },
  { question: 'Indexing in Databases', times: 2, priority: 'low' },
];

const demoTopicFrequency = [
  { topic: 'SQL Queries', percent: 85, color: 'bg-purple-500' },
  { topic: 'Normalization', percent: 72, color: 'bg-blue-500' },
  { topic: 'ER Model', percent: 58, color: 'bg-indigo-500' },
  { topic: 'Transactions', percent: 42, color: 'bg-cyan-500' },
  { topic: 'Indexing', percent: 31, color: 'bg-teal-500' },
];

const demoTrendingTopics = [
  { stream: 'Database Management', topics: [
    { name: 'Normalization', priority: 'high' },
    { name: 'SQL Queries', priority: 'high' },
    { name: 'Transactions', priority: 'medium' },
  ]},
  { stream: 'Data Structures', topics: [
    { name: 'Tree Traversal', priority: 'high' },
    { name: 'Graph Algorithms', priority: 'medium' },
    { name: 'Hashing', priority: 'medium' },
  ]},
  { stream: 'Computer Networks', topics: [
    { name: 'OSI Model', priority: 'high' },
    { name: 'TCP/IP Protocol', priority: 'medium' },
    { name: 'Subnetting', priority: 'low' },
  ]},
];

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
const testimonials = [
  { name: 'Priya Sharma', course: 'B.Com General, 3rd Year', text: 'SmartPYQ helped me identify the most repeated questions in Accounting. I scored 85% in my finals by focusing on just the high-priority topics it suggested.', rating: 5 },
  { name: 'Rahul Verma', course: 'B.Sc Computer Science, 2nd Year', text: 'The AI analysis showed me that 40% of Data Structures questions repeat every year. I stopped wasting time on low-priority topics and my preparation became 3x more efficient.', rating: 5 },
  { name: 'Ananya Reddy', course: 'BCA, 4th Semester', text: 'I used to browse random PDFs for exam prep. SmartPYQ changed everything � the pattern analysis told me exactly what to study. Got the highest marks in my batch!', rating: 5 },
  { name: 'Vikram Patel', course: 'BBA, 2nd Year', text: 'The repeated questions feature is a game-changer. I could see which topics appeared in 4 out of 5 papers. My exam preparation is now data-driven, not guesswork.', rating: 5 },
  { name: 'Sneha Kumari', course: 'B.Sc Mathematics, 3rd Year', text: 'SmartPYQ AI assistant explained complex calculus concepts when I was stuck at 2 AM. Having both PYQ access and AI help in one platform is incredible.', rating: 5 },
  { name: 'Arjun Nair', course: 'B.Com Honors, 1st Year', text: 'As a first-year student, I had no idea what to expect. SmartPYQ showed me the exact exam pattern and important topics. I walked into my exams feeling confident.', rating: 4 },
];

const TestimonialCard = ({ t }) => (
  <div className="shrink-0 w-[320px] sm:w-[360px] p-5 rounded-2xl bg-white/[0.04] border border-white/10 mx-3">
    <div className="flex gap-0.5 mb-3">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < t.rating ? 'text-yellow-400 fill-current' : 'text-gray-600'}`} />
      ))}
    </div>
    <p className="text-sm text-gray-300 leading-relaxed mb-4">"{t.text}"</p>
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-linear-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
        {t.name.split(' ').map(n => n[0]).join('')}
      </div>
      <div>
        <p className="text-sm font-medium text-white">{t.name}</p>
        <p className="text-xs text-gray-500">{t.course}</p>
      </div>
    </div>
  </div>
);

const HomePage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [papers, setPapers] = useState([]);
  const [stats, setStats] = useState({ total: 0, subjects: new Set(), streams: new Set() });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Paper finder state
  const [pfStream, setPfStream] = useState('');
  const [pfSem, setPfSem] = useState('');
  const [pfSubject, setPfSubject] = useState('');
  const [pfYear, setPfYear] = useState('');

  const streamsData = useMemo(() => getStreams(), []);
  const streamEntries = useMemo(() => Object.entries(streamsData).map(([k, v]) => ({ key: k, ...v })), [streamsData]);
  const pfSems = useMemo(() => pfStream ? getAvailableSemesters(pfStream) : [], [pfStream]);
  const pfSubjects = useMemo(() => (pfStream && pfSem) ? getAllSubjectsForStreamSemester(pfStream, pfSem) : [], [pfStream, pfSem]);

  // Parallax for hero
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  // Load papers
  useEffect(() => {
    const load = async () => {
      try {
        const r = await apiClient.getPapers({ limit: 50 });
        const list = r.papers || [];
        setPapers(list);
        const subjects = new Set(list.map(p => p.subject).filter(Boolean));
        const streams = new Set(list.map(p => p.stream).filter(Boolean));
        setStats({ total: r.total || list.length, subjects, streams });
      } catch(e) { console.error(e); }
    };
    load();
  }, []);

  const recentPapers = useMemo(() => papers.slice(0, 6), [papers]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate('/search?q=' + encodeURIComponent(searchQuery.trim()));
  };

  const handleFindPapers = () => {
    const params = new URLSearchParams();
    if (pfStream) params.set('stream', pfStream);
    if (pfSem) params.set('semester', pfSem);
    if (pfSubject) params.set('subject', pfSubject);
    if (pfYear) params.set('year', pfYear);
    navigate('/pyq?' + params.toString());
  };

  const streamDisplayName = (key) => streamEntries.find(s => s.key === key)?.displayName || key;

  /* ---- Preparation Modes ---- */
  const prepModes = [
    { icon: BookOpen, title: 'PYQ Hub', desc: 'Browse and download previous-year papers organized by course and semester.', color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/pyq' },
    { icon: Zap, title: 'AI Analyze', desc: 'Upload papers and discover patterns, repeated questions, and topic frequency.', color: 'text-purple-400', bg: 'bg-purple-500/10', href: '/analyze' },
    { icon: Repeat, title: 'Repeated Questions', desc: 'Find questions that appear across multiple exams — focus on what matters most.', color: 'text-orange-400', bg: 'bg-orange-500/10', href: '/repeated-questions' },
    { icon: Target, title: 'Practice Mode', desc: 'Test yourself with questions extracted from previous year papers.', color: 'text-green-400', bg: 'bg-green-500/10', href: '/practice' },
    { icon: Bot, title: 'AI Assistant', desc: 'Ask questions about subjects, concepts, and exam strategies.', color: 'text-indigo-400', bg: 'bg-indigo-500/10', href: '/ai' },
  ];

  return (
    <div className="min-h-screen">
      <FloatingParticles />

      {/* ================================================================
          1. HERO — AI Value Proposition
          ================================================================ */}
      <section ref={heroRef} className="relative min-h-[85vh] flex items-center overflow-hidden">
        <AuroraGradient />

        <motion.div
          className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-16"
          style={{ y: heroY, opacity: heroOpacity }}
        >
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-16 items-center">
            {/* ---- Pitch column ---- */}
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_OUT }}>
              {/* Welcome eyebrow — spec: WELCOME TO SMARTPYQ */}
              <motion.p
                className="text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase text-purple-300/80 mb-3"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                Welcome to SmartPYQ
              </motion.p>
              {/* Badge */}
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium text-purple-300">AI-Powered Exam Preparation</span>
              </motion.div>

              {/* Headline — spec: Analyze PYQs. Find Patterns. / Predict Exam Trends. */}
              <motion.h1
                className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white mb-5 leading-[1.08] [text-wrap:balance]"
              >
                <WordReveal text="Analyze PYQs. Find Patterns." delay={0.3} />
                <br />
                <GradientText className="text-4xl sm:text-5xl lg:text-[3.4rem]">
                  Predict Exam Trends.
                </GradientText>
              </motion.h1>

              <motion.p
                className="text-lg text-gray-400 mb-8 max-w-xl"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.9 }}
              >
                Upload or search previous-year papers and let SmartPYQ identify
                <span className="text-purple-300 font-medium"> repeated questions</span>,
                <span className="text-purple-300 font-medium"> important topics</span>,
                <span className="text-purple-300 font-medium"> exam patterns</span>, and
                <span className="text-purple-300 font-medium"> practice priorities</span>.
              </motion.p>

              {/* Primary action + search: one clear hierarchy */}
              <motion.div
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 1.1 }}
              >
                <MagneticButton className="btn btn-primary btn-lg whitespace-nowrap" onClick={() => navigate('/pyq')}>
                  <Search className="h-4 w-4" /> Find your PYQs
                </MagneticButton>
                <form onSubmit={handleSearch} className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10 pointer-events-none" />
                  <input
                    type="search"
                    name="pyq-hero-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search papers, subjects, and courses"
                    placeholder="or search by subject, course, year…"
                    className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-400 focus:outline-hidden focus:border-purple-500/50 transition-[border-color]"
                  />
                </form>
              </motion.div>

              {/* Quiet secondary paths — text links, not more pills */}
              <motion.div
                className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.35 }}
              >
                <button onClick={() => navigate('/analyze')} className="inline-flex items-center gap-1.5 text-purple-300 hover:text-purple-200 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded">
                  <Zap className="h-3.5 w-3.5" /> Analyze a paper
                </button>
                <button onClick={() => navigate('/practice')} className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-purple-400/60 rounded">
                  <Target className="h-3.5 w-3.5" /> Practice questions
                </button>
              </motion.div>

              {/* Live library pulse — real numbers from the database */}
              <motion.div
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 1.6 }}
              >
                <span className="relative inline-flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span><span className="text-white font-semibold">{stats.total}</span> papers in the library</span>
                <span aria-hidden="true" className="text-gray-700">|</span>
                <span><span className="text-white font-semibold">{stats.subjects.size}</span> subjects covered</span>
              </motion.div>
            </motion.div>

            {/* ---- Artifact column: the analyzed paper ---- */}
            <div className="relative mx-auto w-full max-w-md lg:max-w-none lg:justify-self-end">
              <AnnotatedPaper />
            </div>
          </div>
        </motion.div>
      </section>

      {/* ================================================================
          2. TRUST INDICATORS
          ================================================================ */}
      <motion.section
        className="py-6 border-y border-white/5"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            {[
              'Organized by Course & Semester',
              'Community-Contributed Papers',
              'AI-Powered Pattern Analysis',
              'Free Student Access',
              'Built for Osmania University',
            ].map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ================================================================
          3. CHOOSE YOUR PREPARATION MODE
          ================================================================ */}
      <motion.section
        className="py-20"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-white mb-1">
              <AnimatedUnderline><TextScramble text="Choose Your Preparation Mode" className="text-3xl font-bold text-white" delay={200} /></AnimatedUnderline>
            </h2>
            <span className="section-accent" aria-hidden="true" />
            <p className="text-gray-400 mt-3">Five ways to prepare smarter — not just harder</p>
          </motion.div>
          <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            {prepModes.map((mode, i) => (
              <SpotlightCard
                key={i}
                className="group p-6 rounded-2xl bg-white/[0.03] border border-white/10 cursor-pointer"
                spotlightColor="rgba(139,92,246,0.12)"
              >
                <motion.div
                  variants={cardUp}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => navigate(mode.href)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${mode.bg}`}>
                    <mode.icon className={`h-5 w-5 ${mode.color}`} />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{mode.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{mode.desc}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Get started <ArrowRight className="h-3 w-3" />
                  </div>
                </motion.div>
              </SpotlightCard>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ================================================================
          4. BROWSE BY COURSE
          ================================================================ */}
      <motion.section
        className="py-20 bg-white/[0.02]"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-white mb-1">
              <AnimatedUnderline>Browse by Course</AnimatedUnderline>
            </h2>
            <span className="section-accent" aria-hidden="true" />
            <p className="text-gray-400 mt-3">Select your course to explore available question papers</p>
          </motion.div>
          <motion.div className="grid grid-cols-2 sm:grid-cols-4 gap-4" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            {streamEntries.map((s) => (
              <motion.button key={s.key} variants={cardUp}
                className="group relative p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-purple-500/40 transition-all duration-300 text-left overflow-hidden"
                whileHover={{ y: -4, boxShadow: '0 8px 32px rgba(139,92,246,0.15)' }}
                onClick={() => navigate('/pyq?stream=' + s.key)}>
                <div className="absolute inset-0 bg-linear-to-br from-purple-500/0 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative text-3xl mb-3 block">{s.icon || '📚'}</span>
                <h3 className="relative text-lg font-semibold text-white mb-1 group-hover:text-purple-300 transition-colors">{s.displayName}</h3>
                <p className="relative text-sm text-gray-500">View papers</p>
                <ArrowRight className="relative h-4 w-4 text-gray-600 group-hover:text-purple-400 group-hover:translate-x-1 transition-all mt-3" />
              </motion.button>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* ================================================================
          5. AI ANALYSIS SHOWCASE — The Wow Factor
          ================================================================ */}
      <motion.section
        className="py-20"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 mb-4">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-medium text-orange-300">Live Demo</span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-1">
              <AnimatedUnderline><TextScramble text="SmartPYQ AI Analysis" className="text-3xl font-bold text-white" delay={300} /></AnimatedUnderline>
            </h2>
            <span className="section-accent" aria-hidden="true" />
            <p className="text-gray-400 mt-3">Upload a paper — AI reveals repeated questions, topic frequency, and exam patterns</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Repeated Questions */}
            <BorderBeam className="rounded-2xl" colorFrom="rgba(239,68,68,0.4)" colorTo="rgba(249,115,22,0.3)">
              <CursorGlow className="p-6" glowColor="rgba(239,68,68,0.12)">
              <motion.div variants={cardUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Repeat className="h-4 w-4 text-orange-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Repeated Questions</h3>
                </div>
                <div className="space-y-3">
                  {demoRepeatedQuestions.map((q, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl border border-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{q.question}</p>
                        <p className="text-xs text-gray-500">Appeared {q.times} times</p>
                      </div>
                      <div className="flex gap-0.5 ml-3">
                        {Array.from({ length: q.times }, (_, j) => (
                          <span key={j} className="text-xs">🔥</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
              </CursorGlow>
            </BorderBeam>

            {/* Topic Frequency */}
            <BorderBeam className="rounded-2xl" colorFrom="rgba(139,92,246,0.4)" colorTo="rgba(59,130,246,0.3)">
              <CursorGlow className="p-6" glowColor="rgba(139,92,246,0.12)">
              <motion.div variants={cardUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ delay: 0.1 }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-purple-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Topic Frequency</h3>
                </div>
                <div className="space-y-4">
                  {demoTopicFrequency.map((t, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-300">{t.topic}</span>
                        <span className="text-purple-400 font-medium">{t.percent}%</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        {/* scaleX (transform-only) instead of width — GPU-composited */}
                        <motion.div
                          className={`h-full w-full origin-left rounded-full ${t.color}`}
                          initial={{ scaleX: 0 }}
                          whileInView={{ scaleX: t.percent / 100 }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, delay: i * 0.1, ease: [0.22,1,0.36,1] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
              </CursorGlow>
            </BorderBeam>

            {/* Exam Pattern Insight */}
            <BorderBeam className="rounded-2xl" colorFrom="rgba(59,130,246,0.4)" colorTo="rgba(34,211,238,0.3)">
              <CursorGlow className="p-6" glowColor="rgba(59,130,246,0.12)">
              <motion.div variants={cardUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ delay: 0.2 }}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Lightbulb className="h-4 w-4 text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Exam Pattern Insight</h3>
                </div>
                <div className="p-4 bg-linear-to-br from-blue-500/5 to-purple-500/5 rounded-xl border border-blue-500/10 mb-4">
                  <p className="text-sm text-gray-300 leading-relaxed italic">
                    "SQL and Normalization account for approximately <span className="text-white font-semibold">42% of questions</span> across the analyzed papers."
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <div>
                      <p className="text-sm text-white">High Priority</p>
                      <p className="text-xs text-gray-500">3 topics — study these first</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    <div>
                      <p className="text-sm text-white">Medium Priority</p>
                      <p className="text-xs text-gray-500">2 topics — review regularly</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <div>
                      <p className="text-sm text-white">Low Priority</p>
                      <p className="text-xs text-gray-500">1 topic — optional review</p>
                    </div>
                  </div>
                </div>
              </motion.div>
              </CursorGlow>
            </BorderBeam>
          </div>
        </div>
      </motion.section>

      {/* ================================================================
          6. TRENDING SUBJECTS / TOPICS
          ================================================================ */}
      <motion.section
        className="py-20 bg-white/[0.02] relative"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <PerspectiveGrid opacity={0.3} />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
              <TrendingUp className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs font-medium text-red-300">Trending Now</span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-1">
              <AnimatedUnderline><TextScramble text="Most Repeated Topics" className="text-3xl font-bold text-white" delay={200} /></AnimatedUnderline>
            </h2>
            <span className="section-accent" aria-hidden="true" />
            <p className="text-gray-400 mt-3">Based on analysis of question papers across multiple years</p>
          </motion.div>

          {/* Desktop: 3-up grid. Mobile (<640px): swipeable thumbnail carousel
              — same content, thumb-friendly navigation instead of a long stack. */}
          <div className="hidden sm:block">
            <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-6" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
              {demoTrendingTopics.map((stream, i) => (
                <SpotlightCard key={i} className="p-6 rounded-2xl bg-white/[0.03] border border-white/10" spotlightColor="rgba(239,68,68,0.08)">
                  <motion.div variants={cardUp}>
                    <h3 className="text-base font-semibold text-white mb-4">{stream.stream}</h3>
                    <div className="space-y-2.5">
                      {stream.topics.map((topic, j) => (
                        <div key={j} className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                          <span className="text-sm text-gray-300">{topic.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            topic.priority === 'high' ? 'bg-red-500/15 text-red-300' :
                            topic.priority === 'medium' ? 'bg-yellow-500/15 text-yellow-300' :
                            'bg-gray-500/15 text-gray-400'
                          }`}>
                            {topic.priority === 'high' ? '🔥 High' : topic.priority === 'medium' ? '⚡ Medium' : 'Low'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </SpotlightCard>
              ))}
            </motion.div>
          </div>
          <div className="sm:hidden">
            <ThumbnailCarousel
              ariaLabel="Most repeated topics by stream"
              interval={5200}
              items={demoTrendingTopics.map((stream, i) => ({
                id: `trend-${i}`,
                label: stream.stream,
                thumbClass: i === 0 ? 'bg-linear-to-br from-purple-600/40 to-indigo-700/40' : i === 1 ? 'bg-linear-to-br from-blue-600/40 to-cyan-700/40' : 'bg-linear-to-br from-rose-600/40 to-orange-600/40',
                render: () => (
                  <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                    <h3 className="text-base font-semibold text-white mb-4">{stream.stream}</h3>
                    <div className="space-y-2.5">
                      {stream.topics.map((topic, j) => (
                        <div key={j} className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                          <span className="text-sm text-gray-300">{topic.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            topic.priority === 'high' ? 'bg-red-500/15 text-red-300' :
                            topic.priority === 'medium' ? 'bg-yellow-500/15 text-yellow-300' :
                            'bg-gray-500/15 text-gray-400'
                          }`}>
                            {topic.priority === 'high' ? '🔥 High' : topic.priority === 'medium' ? '⚡ Medium' : 'Low'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              }))}
            />
          </div>
        </div>
      </motion.section>

      {/* ================================================================
          7. HOW SMARTPYQ WORKS — Updated
          ================================================================ */}
      <motion.section
        className="py-20"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-white mb-1">
              <AnimatedUnderline><TextScramble text="How SmartPYQ Works" className="text-3xl font-bold text-white" delay={200} /></AnimatedUnderline>
            </h2>
            <span className="section-accent" aria-hidden="true" />
            <p className="text-gray-400 mt-3">From paper to preparation in four steps</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            <div className="hidden lg:block absolute top-12 left-[12%] right-[12%]">
              <AnimatedBeam direction="horizontal" />
            </div>
            {[
              { step: 1, title: 'Search or Upload', desc: 'Find an existing PYQ or upload your question paper', icon: <Search className="h-6 w-6" /> },
              { step: 2, title: 'AI Extracts Questions', desc: 'SmartPYQ automatically organizes questions by topic', icon: <Brain className="h-6 w-6" /> },
              { step: 3, title: 'Discover Patterns', desc: 'See repeated questions, important topics, and frequency', icon: <TrendingUp className="h-6 w-6" /> },
              { step: 4, title: 'Practice Smart', desc: 'Focus your preparation based on actual exam data', icon: <Target className="h-6 w-6" /> },
            ].map((item, i) => (
              <motion.div
                key={i}
                className="text-center p-6 rounded-2xl bg-white/[0.03] border border-white/10 relative"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                whileHover={{ y: -3 }}
              >
                <motion.div
                  className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-4 text-purple-400 relative z-10"
                  whileHover={{ scale: 1.1, borderColor: 'rgba(139,92,246,0.5)' }}
                >
                  {item.icon}
                </motion.div>
                <div className="text-xs font-bold text-purple-400 mb-2">Step {item.step}</div>
                <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ================================================================
          8. COMMUNITY UPLOAD — Improved messaging
          ================================================================ */}
      <motion.section
        className="py-20 bg-white/[0.02]"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            className="relative p-10 rounded-2xl overflow-hidden"
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.3 }}
          >
            <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/15" />
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{ background: 'conic-gradient(from 0deg, transparent, rgba(139,92,246,0.15), transparent, rgba(59,130,246,0.15), transparent)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative z-10">
              <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                <Upload className="h-10 w-10 text-purple-400 mx-auto mb-4" />
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-3"><TextScramble text="Help Students Prepare Smarter" delay={200} /></h2>
              <p className="text-gray-400 mb-4 max-w-lg mx-auto">
                Have an Osmania University previous-year question paper? Upload it to SmartPYQ. Your contribution can help thousands of students access better study resources.
              </p>
              <div className="flex flex-wrap justify-center gap-4 text-xs text-gray-500 mb-6">
                <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-400" /> PDF / Image</span>
                <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-400" /> AI Verification</span>
                <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-400" /> Community Contribution</span>
              </div>
              <ShimmerButton className="btn btn-primary btn-lg" onClick={() => navigate('/my-papers')}>
                <Upload className="h-5 w-5" /> Upload Question Paper
              </ShimmerButton>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* ================================================================
          9. AI ASSISTANT CTA
          ================================================================ */}
      <motion.section
        className="py-20"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="w-16 h-16 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center mx-auto mb-6"
              animate={{ boxShadow: ['0 0 0 0 rgba(99,102,241,0)', '0 0 0 12px rgba(99,102,241,0.08)', '0 0 0 0 rgba(99,102,241,0)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Bot className="h-8 w-8 text-indigo-400" />
            </motion.div>
            <h2 className="text-3xl font-bold text-white mb-4">
              <AnimatedUnderline><TextScramble text="Ask SmartPYQ Anything" className="text-3xl font-bold text-white" delay={200} /></AnimatedUnderline>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
              Have a question about your subject, exam preparation, programming, or concepts?
              Ask the SmartPYQ AI assistant — it is here to help you learn and prepare smarter.
            </p>
            <ShimmerButton className="btn btn-lg btn-primary" onClick={() => navigate('/ai')}>
              <Bot className="h-5 w-5" /> Chat with AI
            </ShimmerButton>
          </motion.div>
        </div>
      </motion.section>

      {/* ================================================================
          10. STUDENT TESTIMONIALS
          ================================================================ */}
      <motion.section
        className="py-20 overflow-hidden"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-4">
              <Star className="h-3.5 w-3.5 text-yellow-400 fill-current" />
              <span className="text-xs font-medium text-yellow-300">Student Stories</span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-1">
              <AnimatedUnderline><TextScramble text="What Students Say" className="text-3xl font-bold text-white" delay={200} /></AnimatedUnderline>
            </h2>
            <span className="section-accent" aria-hidden="true" />
            <p className="text-gray-400 mt-3">Real students. Real results. Real preparation.</p>
          </motion.div>
        </div>

        {/* Row 1 � scrolling left */}
        <Marquee speed={35} direction="left" className="mb-4">
          {testimonials.map((t, i) => (
            <TestimonialCard key={i} t={t} />
          ))}
        </Marquee>

        {/* Row 2 � scrolling right (reverse) */}
        <Marquee speed={40} direction="right">
          {[...testimonials].reverse().map((t, i) => (
            <TestimonialCard key={i} t={t} />
          ))}
        </Marquee>
      </motion.section>

      {/* ================================================================
          11. FINAL CTA
          ================================================================ */}
      <motion.section
        className="py-20"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.h2
            className="text-3xl sm:text-4xl font-bold text-white mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <TextScramble text="Start Preparing" className="text-3xl sm:text-4xl font-bold text-white" delay={100} /> <GradientText className="text-3xl sm:text-4xl font-bold"><TextScramble text="Smarter" delay={400} /></GradientText> <TextScramble text="Today" className="text-3xl sm:text-4xl font-bold text-white" delay={500} />
            <span className="section-accent" aria-hidden="true" />
          </motion.h2>
          <motion.p
            className="text-lg text-gray-400 mb-8"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            This isn't just a PYQ website. It tells you what you should study.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <MagneticButton className="btn btn-lg btn-primary" onClick={() => navigate('/pyq')}>
              <BookOpen className="h-5 w-5" /> Get Started
            </MagneticButton>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
};

export default HomePage;
