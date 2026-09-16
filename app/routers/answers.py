"""Answer management for Exam Practice Mode.

Teachers (admin / tenant_admin) attach answers to extracted questions in their
original format (text / image / pdf). Students read answers read-only through
the questions APIs; answer FILES are served here with visibility enforced
server-side: the parent paper must be APPROVED for public access, matching the
paper download rules.
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, get_current_user_optional, require_roles
from app.models.paper import Paper, PaperStatus
from app.models.question import Question
from app.models.user import User
from app.utils import answer_storage

logger = logging.getLogger(__name__)
router = APIRouter()


def _answer_payload(q: Question, paper_approved: bool) -> dict:
    """Serialize the answer part of a question for API responses."""
    has_file = bool(q.answer_type in ("image", "pdf") and q.answer_file_url)
    payload = {
        "answer_type": q.answer_type,
        "answer_text": q.answer_text if q.answer_type == "text" else None,
        "answer_file_name": q.answer_file_name,
        "answer_file_size": q.answer_file_size,
        "answer_file_mime": q.answer_file_mime,
        "answer_updated_at": q.answer_updated_at.isoformat() if q.answer_updated_at else None,
        "answer_url": None,
    }
    if has_file and paper_approved:
        payload["answer_url"] = f"/api/v1/questions/{q.id}/answer-file"
    return payload


async def _paper_for_question(db: AsyncSession, question_id: int) -> Optional[Paper]:
    q = (await db.execute(select(Question).filter(Question.id == question_id))).scalar_one_or_none()
    if not q:
        return None
    return (await db.execute(select(Paper).filter(Paper.id == q.paper_id))).scalar_one_or_none()


@router.post("/questions/{question_id}/answer")
async def set_question_answer(
    question_id: int,
    answer_type: str = Form(..., description="text | image | pdf"),
    answer_text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Create or replace a teacher answer on an extracted question.

    Text answers store formatted text; image/PDF answers store the uploaded
    file UNMODIFIED (replacing any previous answer and deleting its file).
    """
    if answer_type not in Question.ANSWER_TYPES:
        raise HTTPException(status_code=422, detail="answer_type must be one of: text, image, pdf")

    q = (await db.execute(select(Question).filter(Question.id == question_id))).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    # Replace semantics: drop the previous stored file up front.
    old_key = q.answer_file_url if q.answer_type in ("image", "pdf") else None

    try:
        if answer_type == "text":
            text = (answer_text or "").strip()
            if not text:
                raise HTTPException(status_code=422, detail="answer_text is required for text answers")
            if len(text) > 20000:
                raise HTTPException(status_code=422, detail="Text answer is too long (max 20,000 characters).")
            q.answer_type = "text"
            q.answer_text = text
            q.answer_file_url = None
            q.answer_file_name = None
            q.answer_file_size = None
            q.answer_file_mime = None
        else:
            if file is None:
                raise HTTPException(status_code=422, detail="An answer file is required for image/pdf answers")
            data = await file.read()
            ext, mime, error = answer_storage.validate_answer_file(data, file.filename or "", answer_type)
            if error:
                raise HTTPException(status_code=422, detail=error)
            storage_key = answer_storage.save_answer_file(question_id, data, ext)
            if old_key and old_key != storage_key:
                answer_storage.delete_answer_file(old_key)
            q.answer_type = answer_type
            q.answer_text = None
            q.answer_file_url = storage_key
            q.answer_file_name = os.path.basename(file.filename or f"answer{ext}")
            q.answer_file_size = len(data)
            q.answer_file_mime = mime

        from datetime import datetime, timezone
        q.answer_updated_at = datetime.now(timezone.utc)
        q.answer_updated_by = current_user.id
        await db.commit()
        await db.refresh(q)

        paper_approved = True
        paper = (await db.execute(select(Paper).filter(Paper.id == q.paper_id))).scalar_one_or_none()
        if paper:
            paper_status = paper.status.value if hasattr(paper.status, "value") else paper.status
            paper_approved = str(paper_status or "").lower() == "approved"
        return {"message": "Answer saved successfully", "question_id": q.id, **_answer_payload(q, paper_approved)}

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Answer save failed: {type(e).__name__}")
        raise HTTPException(status_code=500, detail="Failed to save answer")


@router.delete("/questions/{question_id}/answer")
async def delete_question_answer(
    question_id: int,
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Remove a teacher answer (and its stored file) from a question."""
    q = (await db.execute(select(Question).filter(Question.id == question_id))).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if q.answer_type in ("image", "pdf") and q.answer_file_url:
        answer_storage.delete_answer_file(q.answer_file_url)
    q.answer_type = None
    q.answer_text = None
    q.answer_file_url = None
    q.answer_file_name = None
    q.answer_file_size = None
    q.answer_file_mime = None
    q.answer_updated_at = None
    q.answer_updated_by = None
    await db.commit()
    return {"message": "Answer deleted"}


@router.get("/questions/{question_id}/answer-file")
async def get_answer_file(
    question_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Serve a stored answer file (inline) with server-side visibility.

    Public only when the parent paper is APPROVED — same rule as paper
    downloads. Pending/draft/rejected papers: admins only.
    """
    q = (await db.execute(select(Question).filter(Question.id == question_id))).scalar_one_or_none()
    if not q or not q.answer_file_url:
        raise HTTPException(status_code=404, detail="Answer file not found")

    paper = (await db.execute(select(Paper).filter(Paper.id == q.paper_id))).scalar_one_or_none()
    paper_status = paper.status.value if hasattr(paper.status, "value") else paper.status if paper else None
    is_public_paper = paper is not None and str(paper_status or "").lower() == "approved"

    if not is_public_paper:
        role = getattr(current_user, "role", None)
        role_str = str(getattr(role, "value", role) or "").lower() if current_user else ""
        is_admin = role_str in ("admin", "tenant_admin", "super_admin")
        if not is_admin:
            # Paper not approved: only admins may see the answer file.
            raise HTTPException(status_code=403 if current_user else 401,
                                detail="This answer is not published yet")

    path = answer_storage.resolve_answer_path(q.answer_file_url)
    if not path:
        raise HTTPException(status_code=404, detail="Answer file not found")

    mime = q.answer_file_mime or "application/octet-stream"
    filename = q.answer_file_name or "answer"
    return FileResponse(path, media_type=mime, filename=filename)


@router.get("/questions/{question_id}/answer")
async def get_question_answer(
    question_id: int,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Read-only answer lookup (used by the admin editor and previews)."""
    q = (await db.execute(select(Question).filter(Question.id == question_id))).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    paper = (await db.execute(select(Paper).filter(Paper.id == q.paper_id))).scalar_one_or_none()
    paper_status = paper.status.value if hasattr(paper.status, "value") else paper.status if paper else None
    is_public_paper = paper is not None and str(paper_status or "").lower() == "approved"
    if not is_public_paper:
        role = getattr(current_user, "role", None)
        role_str = str(getattr(role, "value", role) or "").lower() if current_user else ""
        if role_str not in ("admin", "tenant_admin", "super_admin"):
            raise HTTPException(status_code=403 if current_user else 401,
                                detail="This answer is not published yet")
    return {"question_id": q.id, **_answer_payload(q, True)}

