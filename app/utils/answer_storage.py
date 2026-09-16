"""Answer file storage for Exam Practice Mode.

Teacher answers can be text, an image (jpg/jpeg/png/webp), or a PDF. Files are
stored UNMODIFIED under {LOCAL_STORAGE_PATH}/answers/{question_id}/{sha256}{ext}
so the student always sees exactly what the teacher uploaded.

The serving path-traversal guard and magic-byte MIME sniffing mirror the paper
upload pipeline (PaperService._sniff_mime) so disguised uploads are rejected.
"""

import hashlib
import logging
import os
import re
from typing import Optional, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)

# ext -> (sniffed MIME, max bytes)
IMAGE_TYPES = {
    ".jpg": ("image/jpeg", 10 * 1024 * 1024),
    ".jpeg": ("image/jpeg", 10 * 1024 * 1024),
    ".png": ("image/png", 10 * 1024 * 1024),
    ".webp": ("image/webp", 10 * 1024 * 1024),
}
PDF_TYPES = {".pdf": ("application/pdf", 25 * 1024 * 1024)}

_ALLOWED = {**IMAGE_TYPES, **PDF_TYPES}


def sniff_mime(data: bytes) -> Optional[str]:
    """Detect real MIME type from magic bytes (same rules as paper uploads)."""
    if not data or len(data) < 12:
        return None
    if data[:5] == b"%PDF-":
        return "application/pdf"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_answer_file(data: bytes, filename: str, answer_type: str) -> Tuple[str, str, str]:
    """Validate an uploaded answer file.

    Returns (ext, mime, error). error is empty when valid.
    """
    if not data:
        return "", "", "The uploaded file is empty."
    ext = os.path.splitext((filename or "").lower())[1]
    if ext not in _ALLOWED:
        return "", "", "Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, PDF."
    expected_mime, max_size = _ALLOWED[ext]
    if answer_type == "image" and ext not in IMAGE_TYPES:
        return "", "", "Expected an image (JPG, JPEG, PNG, WEBP)."
    if answer_type == "pdf" and ext not in PDF_TYPES:
        return "", "", "Expected a PDF document."
    sniffed = sniff_mime(data)
    if sniffed != expected_mime:
        return "", "", "File content does not match its extension. Please upload a genuine file."
    if len(data) > max_size:
        limit_mb = max_size // (1024 * 1024)
        return "", "", f"File is too large. Maximum size is {limit_mb} MB."
    return ext, expected_mime, ""


def _answers_root() -> str:
    return os.path.join(settings.LOCAL_STORAGE_PATH or "./storage", "answers")


def save_answer_file(question_id: int, data: bytes, ext: str) -> str:
    """Write the answer bytes unmodified; returns the storage key (relative)."""
    digest = hashlib.sha256(data).hexdigest()
    key = f"{question_id}/{digest}{ext}"
    path = os.path.join(_answers_root(), *key.split("/"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    logger.info(f"Answer file saved for question {question_id} ({len(data)} bytes)")
    return key


def delete_answer_file(storage_key: Optional[str]) -> None:
    """Remove a stored answer file; ignores missing files silently."""
    if not storage_key:
        return
    path = resolve_answer_path(storage_key)
    if path:
        try:
            os.remove(path)
        except OSError:
            pass


def resolve_answer_path(storage_key: str) -> Optional[str]:
    """Resolve a storage key to an absolute path, blocking path traversal.

    Returns None when the key escapes the answers root or the file is missing.
    """
    if not storage_key or ".." in storage_key or storage_key.startswith(("/", "\\")):
        return None
    if not re.fullmatch(r"[0-9]+/[0-9a-f]{64}(\.[a-z0-9]+)?", storage_key):
        return None  # strict key shape: {qid}/{sha256}{ext}
    root_abs = os.path.abspath(_answers_root())
    candidate = os.path.abspath(os.path.join(root_abs, *storage_key.split("/")))
    if not candidate.startswith(root_abs + os.sep):
        return None
    if not os.path.isfile(candidate):
        return None
    return candidate


def delete_question_answer_dir(question_id: int) -> None:
    """Remove the whole per-question answer directory (after question delete)."""
    path = os.path.join(_answers_root(), str(int(question_id)))
    if os.path.isdir(path):
        import shutil
        shutil.rmtree(path, ignore_errors=True)
