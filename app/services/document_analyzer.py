"""
Document Analyzer Service

Handles analysis of PDF and image files for question paper extraction:
- PDF text extraction (PyMuPDF with pdfplumber fallback)
- Image OCR (pytesseract)
- Scanned PDF OCR (page-by-page)
- Metadata detection (title, stream, semester, subject, year, etc.)
- Question structure extraction
"""

import os
import re
import logging
import tempfile
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

# Supported file types
SUPPORTED_PDF_EXTENSIONS = {'.pdf'}
SUPPORTED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
SUPPORTED_EXTENSIONS = SUPPORTED_PDF_EXTENSIONS | SUPPORTED_IMAGE_EXTENSIONS
SUPPORTED_MIME_TYPES = {
    'application/pdf',
    'image/jpeg', 'image/jpg',
    'image/png',
    'image/webp',
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@dataclass
class DetectedMetadata:
    """Metadata detected from a question paper."""
    title: str = ""
    stream: str = ""
    specialization: str = ""
    semester: str = ""
    subject: str = ""
    year: int = 0
    university: str = ""
    exam_type: str = ""
    max_marks: Optional[int] = None
    duration_minutes: Optional[int] = None
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DetectedQuestion:
    """A question detected from the paper."""
    question_number: str = ""
    question_text: str = ""
    section: str = ""
    marks: Optional[int] = None
    question_type: str = "descriptive"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AnalysisResult:
    """Complete analysis result of a document."""
    success: bool = False
    error: Optional[str] = None
    file_type: str = ""  # "pdf" or "image"
    raw_text: str = ""
    page_count: int = 1
    metadata: DetectedMetadata = field(default_factory=DetectedMetadata)
    questions: List[DetectedQuestion] = field(default_factory=list)
    sections: List[str] = field(default_factory=list)
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "error": self.error,
            "file_type": self.file_type,
            "page_count": self.page_count,
            "metadata": self.metadata.to_dict(),
            "questions": [q.to_dict() for q in self.questions],
            "sections": self.sections,
            "confidence": self.confidence,
            "raw_text_length": len(self.raw_text),
        }


# ─── Known values for matching ───────────────────────────────────────────────

KNOWN_STREAMS = {
    'bsc': ['b.sc', 'bsc', 'bachelor of science'],
    'bcom': ['b.com', 'bcom', 'bachelor of commerce'],
    'bca': ['bca', 'bachelor of computer applications'],
    'bba': ['bba', 'bachelor of business administration'],
    'ba': ['b.a', 'ba', 'bachelor of arts'],
    'btech': ['b.tech', 'btech', 'bachelor of technology'],
    'mtech': ['m.tech', 'mtech', 'master of technology'],
    'msc': ['m.sc', 'msc', 'master of science'],
    'mcom': ['m.com', 'mcom', 'master of commerce'],
    'mba': ['mba', 'master of business administration'],
    'ma': ['m.a', 'ma', 'master of arts'],
}

KNOWN_SPECIALIZATIONS = {
    'mscs': ['mscs', 'mathematics, statistics & computer science', 'maths stat cs'],
    'mpc': ['mpc', 'mathematics, physics & chemistry'],
    'bipc': ['bipc', 'botany, zoology & chemistry', 'life science'],
    'general': ['general'],
    'compapps': ['computer applications'],
    'honours': ['honours', 'hons'],
    'busanalytics': ['business analytics'],
}

KNOWN_UNIVERSITIES = [
    'osmania university', 'university of hyderabad',
    'jawaharlal nehru technological university', 'jntu',
    'kakatiya university', 'palamuru university',
    'satavahana university', 'telangana university',
]

KNOWN_EXAM_TYPES = {
    'final': ['final exam', 'final examination', 'end semester', 'end exam'],
    'midterm': ['mid term', 'midterm', 'mid semester', 'internal assessment', 'ia exam'],
    'quiz': ['quiz', 'class test'],
    'assignment': ['assignment', 'homework'],
    'practical': ['practical', 'lab exam', 'viva voce'],
}

# Semester patterns
SEMESTER_RE = re.compile(
    r'(?i)(?:semester|sem|semster)\s*(\d{1,2})', re.IGNORECASE
)
SEMESTER_ROMAN_RE = re.compile(
    r'(?i)(?:semester|sem)\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\s*$',
    re.IGNORECASE
)
YEAR_RE = re.compile(
    r'(?i)(?:20[12]\d(?:\s*[-–/]\s*20[12]\d)?)'
)
MARKS_RE = re.compile(
    r'(?i)(?:max(?:imum)?[\s.]*(?:marks?|score)|total\s*marks?)\s*[:=]?\s*(\d{1,4})',
    re.IGNORECASE
)
DURATION_RE = re.compile(
    r'(?i)(?:time|duration)\s*(?:[:=]?\s*)?(\d{1,3})\s*(?:min(?:ute)?s?|hrs?\.?|hours?)',
    re.IGNORECASE
)
SUBJECT_RE = re.compile(
    r'(?i)(?:subject|paper|course)\s*[:=]?\s*(.+?)(?:\n|$)',
    re.IGNORECASE
)
TITLE_RE = re.compile(
    r'(?i)(?:exam(?:ination)?\s*(?:paper|question\s*paper))\s*[:=]?\s*(.+?)(?:\n|$)',
    re.IGNORECASE
)
SECTION_RE = re.compile(
    r'(?i)(?:section|part)\s*[-–]?\s*([a-zA-Z\d]+)',
    re.IGNORECASE
)


# ─── Text Extraction ─────────────────────────────────────────────────────────

def extract_text_from_pdf(pdf_path: str) -> Tuple[str, int]:
    """
    Extract text from a PDF file.
    Tries PyMuPDF first (fast), then pdfplumber as fallback.
    Returns (text, page_count).
    """
    page_count = 0

    # Try PyMuPDF first
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(pdf_path)
        page_count = len(doc)
        text_parts = []
        for page in doc:
            text = page.get_text("text")
            if text and text.strip():
                text_parts.append(text)
        doc.close()
        full_text = "\n\n".join(text_parts)
        if full_text.strip():
            return full_text, page_count
    except ImportError:
        logger.warning("PyMuPDF not available")
    except Exception as e:
        logger.warning(f"PyMuPDF extraction failed: {e}")

    # Fallback to pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            page_count = len(pdf.pages)
            text_parts = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            full_text = "\n\n".join(text_parts)
            return full_text, page_count
    except ImportError:
        logger.warning("pdfplumber not available")
    except Exception as e:
        logger.warning(f"pdfplumber extraction failed: {e}")

    return "", page_count


def ocr_pdf_page(pdf_path: str, page_num: int) -> str:
    """OCR a single page of a PDF by converting it to image first."""
    try:
        import fitz
        doc = fitz.open(pdf_path)
        if page_num >= len(doc):
            doc.close()
            return ""
        page = doc[page_num]
        # Render page to image (higher DPI for better OCR)
        mat = fitz.Matrix(2, 2)  # 2x zoom for better quality
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        doc.close()

        # Save to temp file and OCR
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            tmp.write(img_data)
            tmp_path = tmp.name

        try:
            text = ocr_image(tmp_path)
            return text
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        logger.warning(f"OCR failed for PDF page {page_num}: {e}")
        return ""


def ocr_pdf(pdf_path: str) -> Tuple[str, int]:
    """
    OCR all pages of a scanned/image-based PDF.
    Returns (text, page_count).
    """
    try:
        import fitz
        doc = fitz.open(pdf_path)
        page_count = len(doc)
        doc.close()
    except Exception:
        page_count = 0

    text_parts = []
    for i in range(page_count):
        page_text = ocr_pdf_page(pdf_path, i)
        if page_text.strip():
            text_parts.append(page_text)

    return "\n\n".join(text_parts), page_count


def ocr_image(image_path: str) -> str:
    """OCR an image file using pytesseract."""
    try:
        from PIL import Image
        import pytesseract

        img = Image.open(image_path)

        # Handle common image issues
        if img.mode == 'RGBA':
            # Convert RGBA to RGB with white background
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Auto-orient if possible
        try:
            from PIL import ImageOps
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # OCR with pytesseract
        custom_config = r'--oem 3 --psm 6'
        text = pytesseract.image_to_string(img, config=custom_config)
        return text
    except ImportError:
        logger.error("pytesseract not available")
        raise ValueError("OCR processing requires pytesseract. Please install it.")
    except Exception as e:
        logger.error(f"Image OCR failed: {e}")
        raise ValueError(f"Failed to process image: {str(e)}")


def extract_text_from_image(image_path: str) -> Tuple[str, int]:
    """Extract text from an image file via OCR. Returns (text, page_count)."""
    text = ocr_image(image_path)
    return text, 1


# ─── Metadata Detection ──────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    """Clean extracted text for analysis."""
    # Remove common header/footer noise
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        s = line.strip()
        if not s:
            cleaned.append('')
            continue
        # Skip page numbers, copyright notices, etc.
        if re.match(r'^(page\s*\d+|copyright|all rights|printed\s*on|turn\s*over)', s, re.I):
            continue
        if re.match(r'^\d+$', s):
            continue
        cleaned.append(s)
    return '\n'.join(cleaned)


def detect_stream(text: str) -> str:
    """Detect the academic stream from text."""
    lower = text.lower()
    for stream_key, aliases in KNOWN_STREAMS.items():
        for alias in aliases:
            if alias in lower:
                return stream_key.upper() if stream_key in ('bsc', 'bcom', 'bca', 'bba', 'ba') else stream_key.upper()
    return ""


def detect_specialization(text: str) -> str:
    """Detect specialization from text."""
    lower = text.lower()
    for spec_key, aliases in KNOWN_SPECIALIZATIONS.items():
        for alias in aliases:
            if alias in lower:
                return spec_key
    return ""


def detect_university(text: str) -> str:
    """Detect university from text."""
    lower = text.lower()
    for uni in KNOWN_UNIVERSITIES:
        if uni in lower:
            # Return proper case
            uni_map = {
                'osmania university': 'Osmania University',
                'university of hyderabad': 'University of Hyderabad',
                'jawaharlal nehru technological university': 'Jawaharlal Nehru Technological University',
                'jntu': 'Jawaharlal Nehru Technological University',
                'kakatiya university': 'Kakatiya University',
                'palamuru university': 'Palamuru University',
                'satavahana university': 'Satavahana University',
                'telangana university': 'Telangana University',
            }
            return uni_map.get(uni, uni.title())
    return ""


def detect_year(text: str) -> int:
    """Detect exam year from text."""
    matches = YEAR_RE.findall(text)
    if matches:
        years = []
        for m in matches:
            # Extract just the year numbers
            nums = re.findall(r'20[12]\d', m)
            for n in nums:
                y = int(n)
                if 2015 <= y <= 2030:
                    years.append(y)
        if years:
            return max(years)  # Most recent year found
    return 0


def detect_semester(text: str) -> str:
    """Detect semester from text."""
    m = SEMESTER_RE.search(text)
    if m:
        num = int(m.group(1))
        if 1 <= num <= 10:
            return f"sem{num}"

    # Try Roman numerals
    roman_map = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5,
                 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10}
    m = SEMESTER_ROMAN_RE.search(text)
    if m:
        roman = m.group(1).lower()
        if roman in roman_map:
            return f"sem{roman_map[roman]}"

    return ""


def detect_subject(text: str) -> str:
    """Detect subject from text."""
    m = SUBJECT_RE.search(text)
    if m:
        subject = m.group(1).strip()
        # Clean up common suffixes
        subject = re.sub(r'\s*[-–]\s*(?:paper|exam|question).*$', '', subject, flags=re.I)
        return subject.strip()
    return ""


def detect_title(text: str) -> str:
    """Detect a title from text."""
    # Try explicit title/exam paper header
    m = TITLE_RE.search(text)
    if m:
        return m.group(1).strip()

    # Try first non-trivial line that looks like a header
    lines = text.split('\n')
    for line in lines[:15]:
        s = line.strip()
        if not s or len(s) < 5:
            continue
        # Skip lines that are just numbers or common non-title text
        if re.match(r'^\d+$', s):
            continue
        if re.match(r'^(university|college|department|instructions|note|time|max|total)', s, re.I):
            continue
        # If the line is short and looks like a heading
        if len(s) < 120 and any(kw in s.lower() for kw in [
            'exam', 'paper', 'question', 'question paper',
            'end semester', 'mid term', 'annual', 'supplementary'
        ]):
            return s
    return ""


def detect_exam_type(text: str) -> str:
    """Detect exam type from text."""
    lower = text.lower()
    for exam_type, keywords in KNOWN_EXAM_TYPES.items():
        for kw in keywords:
            if kw in lower:
                return exam_type
    return "final"  # Default


def detect_marks(text: str) -> Optional[int]:
    """Detect maximum marks from text."""
    m = MARKS_RE.search(text)
    if m:
        marks = int(m.group(1))
        if 10 <= marks <= 200:
            return marks
    return None


def detect_duration(text: str) -> Optional[int]:
    """Detect exam duration in minutes from text."""
    m = DURATION_RE.search(text)
    if m:
        val = int(m.group(1))
        if 10 <= val <= 360:
            return val
    return None


def extract_metadata(text: str) -> DetectedMetadata:
    """Extract all metadata from the raw text of a question paper."""
    cleaned = _clean_text(text)

    metadata = DetectedMetadata()
    metadata.stream = detect_stream(cleaned)
    metadata.specialization = detect_specialization(cleaned)
    metadata.university = detect_university(cleaned)
    metadata.year = detect_year(cleaned)
    metadata.semester = detect_semester(cleaned)
    metadata.subject = detect_subject(cleaned)
    metadata.title = detect_title(cleaned)
    metadata.exam_type = detect_exam_type(cleaned)
    metadata.max_marks = detect_marks(cleaned)
    metadata.duration_minutes = detect_duration(cleaned)

    # If no title was detected, construct one from available metadata
    if not metadata.title:
        parts = []
        if metadata.subject:
            parts.append(metadata.subject)
        if metadata.exam_type and metadata.exam_type != 'other':
            parts.append(metadata.exam_type.replace('_', ' ').title())
        if metadata.year:
            parts.append(str(metadata.year))
        metadata.title = " - ".join(parts) if parts else "Untitled Question Paper"

    # Calculate confidence
    fields_found = sum(1 for v in [
        metadata.stream, metadata.subject, metadata.year,
        metadata.semester, metadata.university
    ] if v)
    metadata.confidence = round(min(fields_found / 5.0, 1.0), 2)

    return metadata


# ─── Question Extraction ─────────────────────────────────────────────────────

def detect_sections(text: str) -> List[str]:
    """Detect section names from text."""
    sections = []
    for m in SECTION_RE.finditer(text):
        section_name = f"Section {m.group(1).strip()}"
        if section_name not in sections:
            sections.append(section_name)
    return sections


def extract_questions(text: str) -> List[DetectedQuestion]:
    """
    Extract questions from the text.
    Uses multiple patterns to handle different formatting styles.
    """
    cleaned = _clean_text(text)
    questions: List[DetectedQuestion] = []
    current_section = ""

    # Detect sections
    section_positions = []
    for m in SECTION_RE.finditer(cleaned):
        section_positions.append((m.start(), f"Section {m.group(1).strip()}"))

    def get_section_for_position(pos: int) -> str:
        section = ""
        for sp, sn in section_positions:
            if sp <= pos:
                section = sn
            else:
                break
        return section

    # Pattern 1: Q1. / Q1) format
    p1 = re.compile(
        r'(?i)(?:^|\n)\s*Q\.?\s*(\d+)[\.\)\]:\s]+(.+?)(?=(?:\n\s*Q\.?\s*\d+[\.\)\]:\s])|$)',
        re.DOTALL
    )
    matches = list(p1.finditer(cleaned))

    if matches:
        for m in matches:
            q_text = m.group(2).strip()
            section = get_section_for_position(m.start())
            mm = MARKS_RE.search(q_text) or re.search(r'\((\d+)\s*(?:marks?|m)\s*\)', q_text, re.I)
            marks = int(mm.group(1)) if mm else None
            questions.append(DetectedQuestion(
                question_number=m.group(1),
                question_text=q_text,
                section=section,
                marks=marks,
                question_type=_detect_question_type(q_text),
            ))
        return questions

    # Pattern 2: 1. / 1) / 1: format
    p2 = re.compile(
        r'(?:^|\n)\s*(\d+)[\.\)\]:\s]+(.+?)(?=(?:\n\s*\d+[\.\)\]:\s])|$)',
        re.DOTALL
    )
    for m in p2.finditer(cleaned):
        q_text = m.group(2).strip()
        if len(q_text) < 10:
            continue
        section = get_section_for_position(m.start())
        mm = MARKS_RE.search(q_text) or re.search(r'\((\d+)\s*(?:marks?|m)\s*\)', q_text, re.I)
        marks = int(mm.group(1)) if mm else None
        questions.append(DetectedQuestion(
            question_number=m.group(1),
            question_text=q_text,
            section=section,
            marks=marks,
            question_type=_detect_question_type(q_text),
        ))

    if questions:
        return questions

    # Pattern 3: Paragraph-based fallback
    paras = [p.strip() for p in re.split(r'\n\s*\n', cleaned)
             if p.strip() and len(p.strip()) > 20]
    idx = 0
    for p in paras:
        if re.match(r'^(university|college|department|exam|paper|instructions|note|time|max|total|turn)', p, re.I):
            continue
        idx += 1
        mm = MARKS_RE.search(p) or re.search(r'\((\d+)\s*(?:marks?|m)\s*\)', p, re.I)
        marks = int(mm.group(1)) if mm else None
        questions.append(DetectedQuestion(
            question_number=str(idx),
            question_text=p,
            marks=marks,
            question_type=_detect_question_type(p),
        ))

    return questions


def _detect_question_type(text: str) -> str:
    """Detect the type of a question."""
    t = text.lower()
    if 'choose' in t and ('correct' in t or 'best' in t):
        return "mcq"
    if 'multiple choice' in t:
        return "mcq"
    if any(w in t for w in ['true or false', 'true/false']):
        return "true_false"
    if any(w in t for w in ['define', 'what is', 'what are']):
        return "short_answer"
    if any(w in t for w in ['explain', 'describe', 'discuss', 'elaborate']):
        return "descriptive"
    if any(w in t for w in ['write a program', 'code', 'implement', 'algorithm']):
        return "programming"
    if any(w in t for w in ['compare', 'differentiate', 'contrast']):
        return "comparison"
    return "descriptive"


# ─── Main Analysis Function ──────────────────────────────────────────────────

def analyze_document(file_path: str, filename: str = "") -> AnalysisResult:
    """
    Analyze a PDF or image file and extract metadata and questions.

    Args:
        file_path: Path to the file on disk
        filename: Original filename (used for extension detection)

    Returns:
        AnalysisResult with extracted data
    """
    result = AnalysisResult()

    # Determine file type
    ext = os.path.splitext(filename or file_path)[1].lower()

    if ext in SUPPORTED_PDF_EXTENSIONS:
        result.file_type = "pdf"
    elif ext in SUPPORTED_IMAGE_EXTENSIONS:
        result.file_type = "image"
    else:
        result.error = f"Unsupported file type: {ext}"
        return result

    try:
        # Extract text
        if result.file_type == "pdf":
            raw_text, page_count = extract_text_from_pdf(file_path)
            result.page_count = page_count

            # If text extraction yielded little or no text, try OCR
            if len(raw_text.strip()) < 50:
                logger.info("PDF has little extractable text, attempting OCR...")
                ocr_text, _ = ocr_pdf(file_path)
                if len(ocr_text.strip()) > len(raw_text.strip()):
                    raw_text = ocr_text
                    logger.info(f"OCR yielded {len(ocr_text)} characters")
                else:
                    logger.warning("OCR did not improve extraction")
        else:
            raw_text, page_count = extract_text_from_image(file_path)
            result.page_count = page_count

        result.raw_text = raw_text

        if not raw_text.strip():
            result.error = "Could not extract any text from the document. The file may be corrupted or the image quality too low for OCR."
            return result

        # Extract metadata
        result.metadata = extract_metadata(raw_text)

        # Extract questions
        result.questions = extract_questions(raw_text)

        # Detect sections
        result.sections = detect_sections(raw_text)

        # Calculate overall confidence
        confidences = [result.metadata.confidence]
        if result.questions:
            confidences.append(0.8)  # Bonus for finding questions
        if result.sections:
            confidences.append(0.9)
        result.confidence = round(sum(confidences) / len(confidences), 2)

        result.success = True
        logger.info(
            f"Analysis complete: {len(result.questions)} questions, "
            f"metadata confidence={result.metadata.confidence}, "
            f"sections={len(result.sections)}"
        )

    except Exception as e:
        logger.error(f"Document analysis failed: {e}", exc_info=True)
        result.error = f"Analysis failed: {str(e)}"

    return result


def validate_file(file_content: bytes, filename: str) -> Dict[str, Any]:
    """
    Validate an uploaded file before processing.

    Args:
        file_content: Raw file bytes
        filename: Original filename

    Returns:
        Dict with 'valid' bool and 'error' message if invalid
    """
    if not filename:
        return {"valid": False, "error": "No filename provided"}

    ext = os.path.splitext(filename)[1].lower()

    if ext not in SUPPORTED_EXTENSIONS:
        supported = ', '.join(sorted(SUPPORTED_EXTENSIONS))
        return {
            "valid": False,
            "error": f"Unsupported file type '{ext}'. Supported formats: {supported}"
        }

    if len(file_content) == 0:
        return {"valid": False, "error": "The file is empty. Please upload a valid file."}

    if len(file_content) > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE // (1024 * 1024)
        return {
            "valid": False,
            "error": f"File size exceeds {max_mb}MB limit. Please upload a smaller file."
        }

    # Check for corrupted files by verifying magic bytes
    if ext in SUPPORTED_PDF_EXTENSIONS:
        if not file_content[:5] == b'%PDF-':
            return {"valid": False, "error": "The file does not appear to be a valid PDF."}
    elif ext in SUPPORTED_IMAGE_EXTENSIONS:
        # Check common image magic bytes
        valid_magic = False
        if ext in ('.jpg', '.jpeg'):
            valid_magic = file_content[:2] == b'\xff\xd8'
        elif ext == '.png':
            valid_magic = file_content[:8] == b'\x89PNG\r\n\x1a\n'
        elif ext == '.webp':
            valid_magic = file_content[:4] == b'RIFF' and file_content[8:12] == b'WEBP'
        if not valid_magic:
            return {"valid": False, "error": "The file appears to be corrupted or is not a valid image."}

    return {"valid": True, "error": None}
