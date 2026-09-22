import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';
import { getStreams } from '../data/pyqData';

/* ================================================================
   HOME — exam-paper editorial
   The product is the visual. One artifact, real data, generous space.
   ================================================================ */

/* ---- Hero artifact: an analyzed question-paper excerpt ----
   A real question paper, annotated the way the analysis engine annotates:
   a highlight sweep over a repeated question, the exam officer's year
   stamps, and the engine's verdict chip. Question text mirrors the real
   seeded DBMS papers (2023-2025). Plays once on load; instant under
   reduced motion. */
const AnnotatedPaper = () => {
  const reduced = useReducedMotion();
  const D = (d) => (reduced ? 0 : d);

  return (
    <div className="relative" aria-hidden="true">
      {/* ghost sheet behind, like a pile of past papers */}
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-[1.4deg] bg-white/50" />
      <div className="absolute inset-0 -translate-x-2 translate-y-1.5 -rotate-[1deg] bg-white/70" />

      <motion.div
        className="relative bg-paper text-[#231f18] shadow-[0_24px_60px_-24px_rgba(28,27,24,0.35)]"
        initial={reduced ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: D(0.6), ease: [0.22, 1, 0.36, 1] }}
      >
        {/* paper header — university question-paper furniture */}
        <div className="border-b border-[#231f18]/20 px-6 pt-5 pb-3 sm:px-8">
          <div className="font-serif text-[13px] sm:text-sm tracking-wide">OSMANIA UNIVERSITY</div>
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
            {/* Q9 — the repeated one: highlight + stamps + chip.
                pb makes room for the absolutely-positioned verdict chip. */}
            <li className="relative pb-9">
              <motion.span
                className="absolute -inset-x-2 -inset-y-1 bg-highlight"
                style={{ transformOrigin: 'left center' }}
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: D(0.5), delay: D(1.1), ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="relative z-10">
                <span className="font-semibold">9.</span> Explain normalization in DBMS with suitable examples.
                <span className="italic text-[#231f18]/55"> (8 marks)</span>
              </span>
              <motion.span
                className="absolute right-0 -top-4 font-serif text-[10px] tracking-wider text-stamp"
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: D(0.3), delay: D(1.65) }}
              >'23 '24 '25</motion.span>
              <motion.span
                className="absolute left-1/2 -translate-x-1/2 bottom-1 whitespace-nowrap bg-[#1C1B18] text-[#FAF9F5] px-3 py-1 text-[11px] font-medium shadow-lg"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: D(0.35), delay: D(1.9), ease: [0.22, 1, 0.36, 1] }}
              >Asked 3 years in a row</motion.span>
            </li>
            <li className="text-[#231f18]/85">
              <span className="font-semibold">10.</span> What is a transaction? Explain ACID properties with examples.
              <span className="italic text-[#231f18]/55"> (8 marks)</span>
              <span className="ml-2 font-serif text-[10px] tracking-wider text-stamp/80">'23 '25</span>
            </li>
          </ol>
        </div>

        {/* engine signature strip */}
        <motion.div
          className="flex items-center justify-between border-t border-dashed border-[#231f18]/25 px-6 py-2.5 sm:px-8"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: D(0.4), delay: D(2.2) }}
        >
          <span className="font-sans text-[10px] uppercase tracking-[0.18em] text-[#231f18]/50">Analyzed by SmartPYQ</span>
          <span className="font-serif text-[11px] italic text-[#231f18]/55">14 questions · 3 papers · 80 marks</span>
        </motion.div>
      </motion.div>
    </div>
  );
};

/* ================================================================ */
const HomePage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin } = useAuth();
  const [papers, setPapers] = useState([]);
  const [stats, setStats] = useState({ total: 0, subjects: new Set(), streams: new Set() });
  const [searchQuery, setSearchQuery] = useState('');

  const streamEntries = useMemo(() => Object.entries(getStreams()).map(([k, v]) => ({ key: k, ...v })), []);

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
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate('/search?q=' + encodeURIComponent(searchQuery.trim()));
  };

  /* ---- Numbered editorial list: what the product does ---- */
  const capabilities = [
    {
      n: '01',
      title: 'The library',
      body: 'Every paper is organized by course, semester, subject, and year. Search by name or drill down from your stream. Download the PDF, read it, keep it.',
      to: '/pyq',
      label: 'Browse the hub',
    },
    {
      n: '02',
      title: 'The analysis',
      body: 'Upload a paper and the engine extracts every question, groups it by topic, and marks what it looks for: repetitions, mark distribution, and which years each question appeared.',
      to: '/analyze',
      label: 'Try the analysis',
    },
    {
      n: '03',
      title: 'The priorities',
      body: 'Three years of papers answer one question: what is likely to appear again. Repeated questions surface first, low-yield topics fall away, and you study in the order the exams suggest.',
      to: '/repeated-questions',
      label: 'See repeated questions',
    },
    {
      n: '04',
      title: 'The practice',
      body: 'Questions pulled from previous exams become a working session. Attempt them cold, or bring the AI assistant into the tab when you are stuck on a concept.',
      to: '/practice',
      label: 'Start practicing',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* ================================================================
          HERO
          ================================================================ */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-16 items-center">
          {/* ---- Pitch column ---- */}
          <div>
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-faint mb-4">
              Previous year papers, analyzed
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold text-primary leading-[1.06] tracking-[-0.02em] [text-wrap:balance]">
              Know what the exam asks before you walk in.
            </h1>
            <p className="text-lg text-secondary mt-5 max-w-xl leading-relaxed">
              SmartPYQ collects Osmania University question papers and reads them for you.
              Repeated questions, important topics, and mark patterns, drawn from the papers themselves.
            </p>

            {/* Primary action + search: one clear hierarchy */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl">
              <Link to="/pyq" viewTransition className="btn btn-primary btn-lg whitespace-nowrap">
                Browse papers
              </Link>
              <form onSubmit={handleSearch} className="relative flex-1">
                <input
                  type="search"
                  name="pyq-hero-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search papers, subjects, and courses"
                  placeholder="or search by subject, course, year…"
                  className="w-full px-4 py-3.5 bg-white border border-line rounded-lg text-sm text-primary placeholder:text-faint focus:outline-hidden focus:border-brand-500 transition-[border-color]"
                />
              </form>
            </div>

            {/* Live library pulse — real numbers from the database */}
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
              <span><span className="text-primary font-semibold">{stats.total}</span> papers in the library</span>
              <span aria-hidden="true" className="text-muted-300">·</span>
              <span><span className="text-primary font-semibold">{stats.subjects.size}</span> subjects covered</span>
            </div>
          </div>

          {/* ---- Artifact column: the analyzed paper ---- */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none lg:justify-self-end">
            <AnnotatedPaper />
          </div>
        </div>
      </section>

      {/* ================================================================
          WHAT SMARTPYQ DOES — numbered editorial list
          ================================================================ */}
      <section className="border-t border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12">
            <div>
              <h2 className="text-3xl font-semibold text-primary tracking-[-0.02em]">
                Four things, done properly.
              </h2>
              <p className="text-secondary mt-4 max-w-sm leading-relaxed">
                No dashboard to learn. The platform does one job: turn past papers into a study order.
              </p>
            </div>
            <ol className="divide-y divide-line">
              {capabilities.map((c) => (
                <li key={c.n} className="py-6 first:pt-0 last:pb-0">
                  <div className="flex gap-5">
                    <span className="font-serif text-sm text-faint pt-1 w-8 shrink-0 tabular-nums">{c.n}</span>
                    <div>
                      <h3 className="text-base font-semibold text-primary">{c.title}</h3>
                      <p className="text-secondary text-sm mt-1.5 leading-relaxed max-w-lg">{c.body}</p>
                      <Link to={c.to} viewTransition className="inline-flex items-center gap-1 text-sm text-accent mt-2.5 hover:underline underline-offset-4">
                        {c.label}
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ================================================================
          BROWSE BY COURSE — real streams from pyqData
          ================================================================ */}
      <section className="border-t border-line bg-muted-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold text-primary tracking-[-0.02em]">Find your course</h2>
            <p className="text-secondary mt-3 leading-relaxed">
              Papers are filed under four streams. Open yours, pick a semester, and the subjects with papers are listed first.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {streamEntries.map((s) => (
              <Link key={s.key} to={'/pyq?stream=' + s.key} viewTransition
                className="group bg-white border border-line rounded-xl p-6 hover:border-muted-300 hover:shadow-[var(--shadow-md)] transition-all text-left">
                <span className="block text-lg font-semibold text-primary">{s.displayName}</span>
                <span className="block text-sm text-faint mt-1">{s.specializations?.length || 4} specializations</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          HOW IT WORKS — four numbered steps, no beam, no cards
          ================================================================ */}
      <section className="border-t border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold text-primary tracking-[-0.02em]">How it works</h2>
            <p className="text-secondary mt-3 leading-relaxed">From paper to preparation in four steps.</p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
            {[
              { n: '1', title: 'Search or upload', desc: 'Find an existing paper in the hub, or upload one you already have.' },
              { n: '2', title: 'Questions extracted', desc: 'The engine organizes every question by topic and mark weight.' },
              { n: '3', title: 'Patterns surface', desc: 'Repeated questions and topic frequency are marked across years.' },
              { n: '4', title: 'Study in order', desc: 'Practice what recurs. Skip nothing, but start with what matters.' },
            ].map((item) => (
              <div key={item.n}>
                <div className="font-serif text-2xl text-accent tabular-nums">{item.n}</div>
                <h3 className="text-base font-semibold text-primary mt-3">{item.title}</h3>
                <p className="text-sm text-muted mt-1.5 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          COMMUNITY UPLOAD — honest copy
          ================================================================ */}
      <section className="border-t border-line bg-muted-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-3xl font-semibold text-primary tracking-[-0.02em]">Have a paper we don't?</h2>
          <p className="text-secondary mt-4 leading-relaxed max-w-xl mx-auto">
            Upload it. Every submission is reviewed by an admin before it appears in the hub,
            so the library stays clean for everyone who comes after you.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={isAdmin ? '/upload' : '/my-papers'} viewTransition className="btn btn-primary btn-lg">
              Upload a paper
            </Link>
            {isAuthenticated && isAdmin && (
              <Link to="/admin" viewTransition className="btn btn-secondary btn-lg">
                Review pending papers
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ================================================================
          FINAL CTA
          ================================================================ */}
      <section className="border-t border-line">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-primary tracking-[-0.02em] leading-tight [text-wrap:balance]">
            Your next exam has been given before.
          </h2>
          <p className="text-lg text-secondary mt-4 leading-relaxed">
            Find your course, see what repeated, and walk in prepared.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/pyq" viewTransition className="btn btn-primary btn-lg">
              Get started
            </Link>
            <Link to="/ai" viewTransition className="btn btn-ghost btn-lg">
              Ask the AI assistant
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
