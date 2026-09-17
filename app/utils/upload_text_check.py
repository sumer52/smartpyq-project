"""Pre-upload readable-text validation.

Before a paper enters the (verification) queue, reject files that cannot
possibly be analyzed later: photos of signatures, blank pages, or scans
with no text. This turns a late, confusing "analysis produced nothing"
failure into an immediate, actionable upload error.

Rules:
- PDF: accept when any page yields a text layer; textless (scanned) PDFs
  get a page-1 OCR attempt.
- Images: OCR directly. A photo of a signature contains almost no
  characters and is rejected; a blurry-but-real paper photo usually still
  yields some words, so the threshold is deliberately low.
- Never hard-fails on OCR infrastructure problems (missing engine,
  unreadable file): the check only rejects when it POSITIVELY read the
  file and found no text. Analysis later may still surface a clearer
  error for those edge cases.
"""

import logging
import os
import threading
from typing import Optional, Union

logger = logging.getLogger(__name__)

# Sentinel: OCR infrastructure unavailable (engine missing, numpy error).
# ``has_readable_text`` must NOT block the upload in that case.
OCR_UNAVAILABLE = object()

# Minimum characters of OCR/text output for the file to count as readable.
# Real question papers produce hundreds of characters; a signature or a
# blank page produces fewer than a handful.
MIN_TEXT_CHARS = 12

# OCR the first N pages of a PDF (enough to catch a scanned paper while
# keeping the upload request fast).
MAX_OCR_PAGES = 1

_ocr_lock = threading.Lock()
_ocr_engine = None


def _get_ocr_engine():
    """Return the RapidOCR engine (initialized once per process), or None."""
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine
    with _ocr_lock:
        if _ocr_engine is not None:
            return _ocr_engine
        try:
            from rapidocr_onnxruntime import RapidOCR

            _ocr_engine = RapidOCR()
            return _ocr_engine
        except Exception as exc:  # pragma: no cover - depends on env
            logger.warning(f"OCR engine unavailable for upload check: {exc}")
            return None


def _ocr_array_to_text(result) -> str:
    """Flatten a RapidOCR result ([[box, text, conf], ...]) into text."""
    if not result:
        return ""
    lines = [row[1] for row in result if len(row) >= 2 and row[1]]
    return "\n".join(lines)


def _ocr_image_file(path: str) -> Union[str, object, None]:
    """OCR an image file.

    Returns extracted text, OCR_UNAVAILABLE when the engine is missing,
    or an empty string when the image was read but contains no text
    (including files that cannot be decoded at all - a corrupt or
    garbage image is not a question paper).
    """
    engine = _get_ocr_engine()
    if engine is None:
        return OCR_UNAVAILABLE
    try:
        import numpy as np
        from PIL import Image, ImageOps

        img = Image.open(path)
        img.load()  # force full decode; corrupt files raise here
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        result, _elapsed = engine(np.asarray(img))
        return _ocr_array_to_text(result)
    except Exception as exc:
        # Decode failures and transform errors mean the file itself is bad,
        # not that OCR is missing: treat as "no text found".
        logger.warning(f"Upload text check: image unreadable/OCR failed for {path}: {exc}")
        return ""


def _pdf_page_pixmap_to_text(path: str, page_index: int) -> Union[str, object, None]:
    """Rasterize one PDF page with PyMuPDF and OCR it.

    Returns text, "" when nothing detected, or OCR_UNAVAILABLE when the
    engine is missing. Internal rasterization errors raise to the caller.
    """
    engine = _get_ocr_engine()
    if engine is None:
        return OCR_UNAVAILABLE
    import fitz
    import numpy as np

    with fitz.open(path) as doc:
        if page_index >= doc.page_count:
            return ""
        pix = doc.load_page(page_index).get_pixmap(dpi=150)
        img = Image_from_pixmap(pix)
        result, _elapsed = engine(np.asarray(img))
        return _ocr_array_to_text(result)


def Image_from_pixmap(pix):
    """Convert a PyMuPDF pixmap to a PIL RGB image (small local helper)."""
    import io

    from PIL import Image

    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def has_readable_text(path: str) -> bool:
    """True when the file at ``path`` contains readable text.

    - PDFs: text layer on any page, else page-1 OCR.
    - Images: OCR.
    - Anything else / OCR unavailable: True (never block on infra failure).
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == ".pdf":
        # 1) Native text layer (any page).
        try:
            import fitz

            with fitz.open(path) as doc:
                for page in doc:
                    text = page.get_text("text") or ""
                    if len(text.strip()) >= MIN_TEXT_CHARS:
                        return True
        except Exception as exc:
            logger.warning(f"Upload text check: PDF text layer read failed: {exc}")
            return True  # cannot judge - do not block
        # 2) Scanned PDF: OCR the first page.
        text = _pdf_page_pixmap_to_text(path, 0)
        if text is OCR_UNAVAILABLE:
            return True  # OCR unavailable - do not block
        return len((text or "").strip()) >= MIN_TEXT_CHARS

    if ext in {".jpg", ".jpeg", ".png", ".webp", ".bmp"}:
        text = _ocr_image_file(path)
        if text is OCR_UNAVAILABLE:
            return True  # OCR unavailable - do not block
        return len((text or "").strip()) >= MIN_TEXT_CHARS

    return True


def check_upload_readable(path: str) -> Optional[str]:
    """Return a user-facing rejection reason, or None when the file is fine."""
    if not os.path.exists(path):
        return None  # storage layer will surface its own error
    if not has_readable_text(path):
        return (
            "This file does not look like a question paper - no readable text "
            "was found (it may be a photo of a signature, a blank page, or too "
            "blurry to read). Please upload a clear photo or PDF of the paper."
        )
    return None
