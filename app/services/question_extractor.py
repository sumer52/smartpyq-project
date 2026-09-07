"""PDF Question Extraction Pipeline."""

import re
import os
import logging
from typing import List, Dict, Optional
from dataclasses import dataclass
import io

logger = logging.getLogger(__name__)


@dataclass
class ExtractedQuestion:
    question_number: str
    original_text: str
    normalized_text: str
    section: Optional[str] = None
    marks: Optional[int] = None
    question_type: str = "descriptive"
    topic: Optional[str] = None
    confidence: float = 1.0


def extract_text_from_pdf(pdf_path: str) -> str:
    try:
        import fitz
        doc = fitz.open(pdf_path)
        text_parts = []
        for page in doc:
            text = page.get_text("text")
            if text and text.strip():
                text_parts.append(text)
        doc.close()
        full_text = "\n\n".join(text_parts)
        if full_text.strip():
            return full_text
    except Exception as e:
        logger.warning(f"PyMuPDF failed: {e}")
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            text_parts = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            return "\n\n".join(text_parts)
    except Exception as e:
        raise ValueError(f"Could not extract text from PDF: {e}")


def clean_text(text: str) -> str:
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        s = line.strip()
        if not s:
            cleaned.append("")
            continue
        if re.match(r"^(page\s*\d+|copyright|all rights)", s, re.I):
            continue
        if re.match(r"^\d+$", s):
            continue
        cleaned.append(s)
    return "\n".join(cleaned)


def normalize_question(text: str) -> str:
    n = text.lower().strip()
    n = re.sub(r"\s+", " ", n)
    n = re.sub(r"^(q\.?\s*\d+[\.\)\]:\s]*)", "", n)
    n = re.sub(r"^(\d+[\.\)\]:\s]+)", "", n)
    n = re.sub(r"\(\s*\d+\s*(?:marks?|m)\s*\)?$", "", n, flags=re.I)
    n = re.sub(r"\b(please|kindly|note)\b", "", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


MARKS_RE = re.compile(r"\(\s*(\d+)\s*(?:marks?|m)\s*\)", re.I)

# Section headers like "SECTION A", "Part II", "Section - B"
SECTION_RE = re.compile(r"^(?:section|part)\s*[-–—:.]?\s*([a-z0-9]+)\b", re.I)


def detect_question_type(text: str) -> str:
    """Rich heuristic classification. Order matters: specific beats generic."""
    t = text.lower()
    if re.search(r"\b(differentiate|difference between|distinguish|compare and contrast|versus| vs\.? )", t):
        return "comparison"
    if re.search(r"\b(derive|derivation|prove that|show that|prove the)", t):
        return "derivation"
    if re.search(r"\b(calculate|compute|evaluate|find the value|solve|determine the)\b", t) or re.search(r"\b(given|following data|frequency distribution)\b", t):
        return "numerical"
    if re.search(r"\b(draw|sketch|diagram|flow ?chart|graph the|plot)\b", t):
        return "diagram"
    if re.search(r"\b(write (a )?(program|code)|program to|algorithm for|implement)\b", t):
        return "programming"
    if re.search(r"\b(formula|equation for|state the formula)\b", t):
        return "formula"
    if re.search(r"\b(apply|application|use case|practical|real[- ]world|case study)\b", t):
        return "application"
    if re.search(r"\b(advantages? and disadvantages?|merits? and demerits?|pros and cons)\b", t):
        return "pros_cons"
    if re.search(r"\b(define|what is|what are|list|state|name the|expand|full form|true or false|fill in)\b", t):
        return "definition"
    if re.search(r"\b(explain in detail|discuss|describe|elaborate|write a (detailed |short )?note|explain)\b", t):
        return "theory"
    return "descriptive"


# Domain keyword -> topic map. Deliberately cross-subject (B.Sc/B.Com/BCA/BBA);
# each entry maps common exam phrases to a syllabus topic. Matched on the
# normalized question text; first topic whose keyword appears wins.
TOPIC_KEYWORDS = [
    ("measures of central tendency", ["mean", "median", "mode", "central tendency", "arithmetic mean", "geometric mean", "harmonic mean"]),
    ("dispersion", ["standard deviation", "variance", "range", "quartile", "dispersion", "mean deviation", "coefficient of variation"]),
    ("correlation & regression", ["correlation", "regression", "scatter", "covariance", "karl pearson", "spearman"]),
    ("probability", ["probability", "bayes", "random experiment", "sample space", "odds"]),
    ("probability distributions", ["binomial", "poisson", "normal distribution", "gaussian", "distribution function"]),
    ("sampling & estimation", ["sampling", "estimator", "confidence interval", "hypothesis", "t-test", "chi-square", "anova", "test of significance"]),
    ("index numbers & time series", ["index number", "time series", "trend", "seasonal", "cyclical"]),
    ("trees & graphs", ["binary tree", "tree traversal", "graph", "bfs", "dfs", "spanning tree", "shortest path", "hashing", "avl"]),
    ("sorting & searching", ["sort", "search", "binary search", "quick sort", "merge sort", "bubble", "insertion", "complexity", "big o"]),
    ("linked lists & stacks & queues", ["linked list", "stack", "queue", "push", "pop", "deque"]),
    ("database systems", ["sql", "normalization", "normal form", "er diagram", "database", "dbms", "transaction", "acid", "join", "primary key", "foreign key", "indexing", "relational"]),
    ("operating systems", ["operating system", "process", "thread", "scheduling", "deadlock", "memory management", "paging", "semaphore", "virtual memory"]),
    ("computer networks", ["osi", "tcp", "ip address", "network", "protocol", "router", "subnet", "ethernet", "topology", "dns"]),
    ("object-oriented programming", ["class", "object", "inheritance", "polymorphism", "encapsulation", "constructor", "operator overloading", "virtual function"]),
    ("data structures fundamentals", ["data structure", "array", "pointer", "recursion", "time complexity", "space complexity"]),
    ("web technologies", ["html", "css", "javascript", "http", "web", "api", "rest"]),
    ("financial accounting", ["journal", "ledger", "trial balance", "balance sheet", "profit and loss", "debit", "credit", "voucher", "depreciation", "final accounts"]),
    ("cost accounting", ["cost", "marginal costing", "budget", "standard costing", "overhead", "break-even", "absorption"]),
    ("corporate accounting", ["shares", "dividend", "debenture", "amalgamation", "company accounts"]),
    ("business management", ["management", "planning", "organizing", "staffing", "directing", "controlling", "leadership", "motivation", "swot"]),
    ("business economics", ["demand", "supply", "elasticity", "market", "monopoly", "inflation", "gdp", "macro", "micro"]),
    ("business law", ["contract", "act", "law", "agreement", "consumer", "company law"]),
    ("banking & finance", ["bank", "loan", "interest", "investment", "capital", "finance", "insurance", "risk management"]),
    ("marketing", ["marketing", "advertising", "brand", "consumer behavior", "product life", "sales promotion", "4ps"]),
    ("entrepreneurship", ["entrepreneur", "startup", "business plan", "small scale"]),
    ("matrices & algebra", ["matrix", "determinant", "eigen", "algebra", "equation", "polynomial", "logarithm"]),
    ("calculus", ["integral", "derivative", "differentiation", "integration", "limit", "continuity", "differential"]),
    ("sets & functions", ["set", "relation", "function", "group", "ring", "permutation", "combination"]),
    ("mechanics", ["force", "motion", "velocity", "acceleration", "newton", "energy", "momentum"]),
    ("optics & waves", ["light", "lens", "mirror", "wave", "sound", "interference", "diffraction", "optics"]),
    ("electricity & magnetism", ["current", "voltage", "circuit", "magnetic", "electric", "resistance", "capacitor"]),
    ("thermodynamics", ["heat", "temperature", "thermodynamic", "entropy", "enthalpy"]),
    ("organic chemistry", ["organic", "alkane", "alkene", "benzene", "reaction mechanism", "carbon"]),
    ("inorganic & physical chemistry", ["acid", "base", "mole", "chemical bond", "periodic", "electrochemical", "solution chemistry"]),
    ("cell biology", ["cell", "mitosis", "meiosis", "organelle", "dna", "rna", "chromosome"]),
    ("plant sciences", ["plant", "photosynthesis", "botany", "root", "leaf", "flower"]),
    ("animal sciences", ["animal", "zoology", "respiration", "circulation", "digestive", "nervous system"]),
    ("ecology & environment", ["ecosystem", "environment", "pollution", "biodiversity", "ecology", "conservation"]),
    ("english language & communication", ["essay", "grammar", "comprehension", "letter", "communication", "vocabulary", "tense"]),
]


def guess_topic(text: str):
    """Map a question to a syllabus topic by keyword. Returns None when no
    keyword matches — callers must show 'Not detected' rather than guess."""
    t = text.lower()
    best = None
    best_hits = 0
    for topic, kws in TOPIC_KEYWORDS:
        hits = sum(1 for kw in kws if kw in t)
        if hits > best_hits:
            best, best_hits = topic, hits
    return best


def extract_questions_from_text(text: str) -> List[ExtractedQuestion]:
    """Split cleaned text into questions, tracking the current section header.
    Every question gets a topic guess (None = 'Not detected') and a confidence
    score (regex-parsed numbered questions = 1.0, fallback paragraphs = 0.6)."""
    questions = []
    cleaned = clean_text(text)
    current_section = None

    def _mk(num, q_text, confidence):
        mm = MARKS_RE.search(q_text)
        marks = int(mm.group(1)) if mm else None
        return ExtractedQuestion(
            question_number=num,
            original_text=q_text,
            normalized_text=normalize_question(q_text),
            section=current_section,
            marks=marks,
            question_type=detect_question_type(q_text),
            topic=guess_topic(q_text),
            confidence=confidence,
        )

    # Track sections while scanning line by line so each question carries the
    # section it appeared under.
    q_start = re.compile(r"(?i)^(?:Q\.?\s*)?(\d+)[\.\)\]:\s]+\S")
    pending = []  # (num, start_idx, section_at_start)

    # First pass: locate numbered question starts with their offsets
    for line_m in re.finditer(r"[^\n]+", cleaned):
        line = line_m.group(0)
        sec = SECTION_RE.match(line.strip())
        if sec:
            current_section = "Section " + sec.group(1).upper()
            continue
        qm = q_start.match(line.strip())
        if qm and len(line.strip()) >= 10:
            pending.append((qm.group(1), line_m.start(), current_section))

    if pending:
        for i, (num, start, section) in enumerate(pending):
            end = pending[i + 1][1] if i + 1 < len(pending) else len(cleaned)
            chunk = cleaned[start:end]
            lines = chunk.split("\n")
            # Drop trailing blank lines and the next question's section header
            while lines and (not lines[-1].strip() or SECTION_RE.match(lines[-1].strip())):
                lines.pop()
            q_text = "\n".join(lines).strip()
            # Strip the leading number WITHOUT \S so the first question
            # character survives ("1. Define" -> "Define", not "efine").
            q_text = re.sub(r"^(?:Q\.?\s*)?\d+[\.\)\]:\s]+", "", q_text, count=1, flags=re.I).strip()
            questions.append(ExtractedQuestion(
                question_number=num,
                original_text=q_text,
                normalized_text=normalize_question(q_text),
                section=section,
                marks=(int(MARKS_RE.search(q_text).group(1)) if MARKS_RE.search(q_text) else None),
                question_type=detect_question_type(q_text),
                topic=guess_topic(q_text),
                confidence=1.0,
            ))
    else:
        # Fallback: paragraph blocks. Lower confidence — no question numbering
        # was detected, so this may include non-question prose.
        paras = [p.strip() for p in re.split(r"\n\s*\n", cleaned) if p.strip() and len(p.strip()) > 20]
        for i, p in enumerate(paras, 1):
            if re.match(r"^(university|college|department|exam|paper|instructions)", p, re.I):
                continue
            questions.append(ExtractedQuestion(
                question_number=str(i),
                original_text=p,
                normalized_text=normalize_question(p),
                section=current_section,
                question_type=detect_question_type(p),
                topic=guess_topic(p),
                confidence=0.6,
            ))

    return questions


META_PATTERNS = {
    "subject": re.compile(r"(?:subject|paper)\s*[:\-]\s*(.+)", re.I),
    "semester": re.compile(r"semester\s*[:\-]?\s*(?:([ivx0-9]+)|sem\s*([0-9]+))", re.I),
    "max_marks": re.compile(r"(?:max(?:imum)?|total)\s*marks?\s*[:\-]?\s*(\d+)", re.I),
    "duration": re.compile(r"(?:time|duration)\s*[:\-]?\s*([0-9]+\s*(?:hours?|hrs?|h)\b(?:\s*[0-9]+\s*minutes?)?|half day|full day)", re.I),
    "course": re.compile(r"\b(B\.?Sc|B\.?Com|BCA|BBA|M\.?Sc|M\.?Com)\b[^\n]*", re.I),
    "year": re.compile(r"\b(20[0-2][0-9])\b"),
    "exam_type": re.compile(r"\b(final|midterm|mid[- ]term|semester end|annual|supplementary|quiz)\b", re.I),
}


def detect_paper_metadata(text: str) -> Dict[str, Optional[str]]:
    """Best-effort metadata detection from raw paper text. Every field is None
    when not found — callers must show 'Not detected', never invent values."""
    out = {k: None for k in META_PATTERNS}
    head = text[:2000]
    for key, rx in META_PATTERNS.items():
        m = rx.search(head)
        if m:
            out[key] = next((g for g in m.groups() if g), m.group(0)).strip()
    # year: take the most recent plausible year mentioned
    years = [int(y) for y in re.findall(r"\b(20[0-2][0-9])\b", head)]
    if years:
        out["year"] = str(max(years))
    return out


def extract_questions_from_pdf(pdf_path: str):
    """Returns (questions, metadata, page_count). Raises ValueError when the
    PDF has no extractable text (scanned/image PDFs need OCR — callers should
    report that the file could not be read, not pretend analysis succeeded)."""
    page_count = 0
    try:
        import fitz
        doc = fitz.open(pdf_path)
        page_count = doc.page_count
        doc.close()
    except Exception:
        pass
    raw_text = extract_text_from_pdf(pdf_path)
    if not raw_text.strip():
        raise ValueError("No text could be extracted from the PDF (it may be a scanned/image-only file)")
    return extract_questions_from_text(raw_text), detect_paper_metadata(raw_text), page_count
