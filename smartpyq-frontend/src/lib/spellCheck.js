// SmartPYQ - Metadata Spelling Correction & Normalization
// Compares user input against canonical data from pyqData.js

import { pyqData, getAllSubjectsForStreamSemester, getSemesterOptions } from '../data/pyqData';

// ─── Levenshtein Distance ─────────────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── Similarity Score (0 to 1) ───────────────────────────────────────────────
function similarity(input, canonical) {
  const a = input.toLowerCase().trim();
  const b = canonical.toLowerCase().trim();
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── Canonical Data Collections ───────────────────────────────────────────────

// All valid subject names across all streams/semesters
function getAllSubjects() {
  const subjects = new Set();
  Object.keys(pyqData.streams).forEach(streamId => {
    for (let sem = 1; sem <= 6; sem++) {
      getAllSubjectsForStreamSemester(streamId, `sem${sem}`).forEach(s => subjects.add(s));
    }
  });
  return [...subjects];
}

// All valid stream keys and display names
function getAllStreams() {
  const streams = [];
  Object.entries(pyqData.streams).forEach(([key, stream]) => {
    streams.push({ key, name: stream.name, displayName: stream.displayName });
  });
  return streams;
}

// All valid semester options
function getAllSemesters() {
  return getSemesterOptions();
}

// All valid specialization names
function getAllSpecializations() {
  const specs = [];
  Object.entries(pyqData.streams).forEach(([streamKey, stream]) => {
    Object.entries(stream.specializations || {}).forEach(([specKey, spec]) => {
      specs.push({ key: specKey, name: spec.name, displayName: spec.displayName, streamKey });
    });
  });
  return specs;
}

// ─── Fuzzy Match Finder ───────────────────────────────────────────────────────
function findBestMatch(input, candidates, threshold = 0.6) {
  if (!input || !input.trim()) return null;

  const normalizedInput = input.trim();

  // Exact match first
  for (const c of candidates) {
    const value = typeof c === 'string' ? c : c.name || c.displayName || c.key;
    if (value.toLowerCase() === normalizedInput.toLowerCase()) {
      return { canonical: value, confidence: 1.0, exact: true, original: normalizedInput };
    }
  }

  // Fuzzy match
  let best = null;
  let bestScore = 0;

  for (const c of candidates) {
    const value = typeof c === 'string' ? c : c.name || c.displayName || c.key;
    const score = similarity(normalizedInput, value);
    if (score > bestScore) {
      bestScore = score;
      best = { canonical: value, confidence: score, exact: false, original: normalizedInput };
    }
  }

  // Also check display names and keys
  for (const c of candidates) {
    if (typeof c !== 'string') {
      if (c.displayName) {
        const score = similarity(normalizedInput, c.displayName);
        if (score > bestScore) {
          bestScore = score;
          best = { canonical: c.name || c.displayName, confidence: score, exact: false, original: normalizedInput };
        }
      }
      if (c.key) {
        const score = similarity(normalizedInput, c.key);
        if (score > bestScore) {
          bestScore = score;
          best = { canonical: c.name || c.displayName, confidence: score, exact: false, original: normalizedInput };
        }
      }
    }
  }

  if (bestScore >= threshold) {
    return best;
  }

  return null;
}

// ─── Main Correction Function ─────────────────────────────────────────────────
export function checkMetadata(metadata) {
  const corrections = [];

  const subjects = getAllSubjects();
  const streams = getAllStreams();
  const semesters = getAllSemesters();
  const specializations = getAllSpecializations();

  // Check Subject
  if (metadata.subject) {
    const match = findBestMatch(metadata.subject, subjects, 0.55);
    if (match && !match.exact) {
      corrections.push({
        field: 'subject',
        label: 'Subject',
        original: metadata.subject,
        corrected: match.canonical,
        confidence: match.confidence,
      });
    }
  }

  // Check Stream
  if (metadata.stream) {
    // Try matching against stream keys, names, and display names
    const streamCandidates = streams.flatMap(s => [s.key, s.name, s.displayName]);
    const match = findBestMatch(metadata.stream, streamCandidates, 0.55);
    if (match && !match.exact) {
      // Resolve to canonical stream key
      const canonicalStream = streams.find(s =>
        s.key.toLowerCase() === match.canonical.toLowerCase() ||
        s.name.toLowerCase() === match.canonical.toLowerCase() ||
        s.displayName.toLowerCase() === match.canonical.toLowerCase()
      );
      corrections.push({
        field: 'stream',
        label: 'Course/Stream',
        original: metadata.stream,
        corrected: canonicalStream?.key || match.canonical,
        correctedDisplay: canonicalStream?.displayName || match.canonical,
        confidence: match.confidence,
      });
    }
  }

  // Check Semester
  if (metadata.semester) {
    const semCandidates = semesters.flatMap(s => [s.id, s.name, s.displayName]);
    const match = findBestMatch(metadata.semester, semCandidates, 0.55);
    if (match && !match.exact) {
      const canonicalSem = semesters.find(s =>
        s.id.toLowerCase() === match.canonical.toLowerCase() ||
        s.name.toLowerCase() === match.canonical.toLowerCase() ||
        s.displayName.toLowerCase() === match.canonical.toLowerCase()
      );
      corrections.push({
        field: 'semester',
        label: 'Semester',
        original: metadata.semester,
        corrected: canonicalSem?.id || match.canonical,
        correctedDisplay: canonicalSem?.displayName || match.canonical,
        confidence: match.confidence,
      });
    }
  }

  // Check Specialization
  if (metadata.specialization) {
    const match = findBestMatch(metadata.specialization, specializations, 0.55);
    if (match && !match.exact) {
      corrections.push({
        field: 'specialization',
        label: 'Specialization',
        original: metadata.specialization,
        corrected: match.canonical,
        confidence: match.confidence,
      });
    }
  }

  // Check Title - normalize common patterns
  if (metadata.title) {
    const title = metadata.title.trim();
    let normalizedTitle = title;

    // Fix common title patterns
    normalizedTitle = normalizedTitle
      .replace(/\b(fnal|finl)\b/gi, 'Final')
      .replace(/\b(mid|midd)\s*(term|trem)\b/gi, 'Mid Term')
      .replace(/\b(exam|exm|exma)\b/gi, 'Exam')
      .replace(/\b(semestar|semster|semster|semster)\b/gi, 'Semester')
      .replace(/\b(questin|qus|que|ques|question|qustion)\s*(paper|papaer|ppr)\b/gi, 'Question Paper')
      .replace(/\b(papaer|papper|papre|papr)\b/gi, 'Paper')
      .replace(/\b(univercity|universty|universiy|univesity)\b/gi, 'University')
      .replace(/\b(technolog|techonology|techonlogy)\b/gi, 'Technology')
      .replace(/\b(sciecne|scince|scinece|scienc)\b/gi, 'Science')
      .replace(/\b(managment|managemnt|mangement)\b/gi, 'Management')
      .replace(/\b(statistcs|statistics|statstics|statitics)\b/gi, 'Statistics')
      .replace(/\b(mathematcs|mathematics|mathamatics|mathmatics)\b/gi, 'Mathematics')
      .replace(/\b(econimics|economics|economocs|econmics)\b/gi, 'Economics')
      .replace(/\b(accounting|accountng|accouting|acounting)\b/gi, 'Accounting')
      .replace(/\b(buisness|busines|busniess|bussiness)\b/gi, 'Business')
      .replace(/\b(operatng|opertaing|operting)\s*systems?\b/gi, 'Operating Systems')
      .replace(/\b(computer|computr|compuer|comptuer)\s*(scince|sciene|science|scinence)\b/gi, 'Computer Science')
      .replace(/\b(netwrk|network|netowrk|netwrok)s?\b/gi, 'Networks')
      .replace(/\b(database|databse|databs|databaes)\s*(managment|management|managemnt|mangement)?\s*(system|sytem|sysstem)?s?\b/gi, 'Database Management Systems')
      .replace(/\b(artifcial|inteligence|intelligance|ai)\b/gi, 'Artificial Intelligence');

    // Title case normalization
    normalizedTitle = normalizedTitle
      .split(' ')
      .map(word => {
        // Don't capitalize articles, prepositions, small words unless first
        const smallWords = ['of', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'is', 'by'];
        if (smallWords.includes(word.toLowerCase())) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');

    if (normalizedTitle !== title) {
      corrections.push({
        field: 'title',
        label: 'Paper Title',
        original: title,
        corrected: normalizedTitle,
        confidence: 0.85,
      });
    }
  }

  // Check Year
  if (metadata.year) {
    const year = parseInt(metadata.year);
    const currentYear = new Date().getFullYear();
    if (year < 2000 || year > currentYear + 1) {
      corrections.push({
        field: 'year',
        label: 'Year',
        original: String(metadata.year),
        corrected: String(Math.min(currentYear, Math.max(2000, year))),
        confidence: 0.5,
      });
    }
  }

  return corrections;
}

// ─── Apply Accepted Corrections ───────────────────────────────────────────────
export function applyCorrections(metadata, corrections) {
  const corrected = { ...metadata };
  corrections.forEach(c => {
    corrected[c.field] = c.corrected;
  });
  return corrected;
}

// ─── Confidence Label ─────────────────────────────────────────────────────────
export function getConfidenceLabel(confidence) {
  if (confidence >= 0.9) return { label: 'High confidence', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' };
  if (confidence >= 0.7) return { label: 'Likely correct', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
  return { label: 'Please verify', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' };
}
