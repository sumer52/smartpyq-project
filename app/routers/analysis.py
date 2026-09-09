"""Analysis, questions, bookmarks, and practice API endpoints."""

import logging
import os
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user
from app.models.user import User
from app.models.paper import Paper
from app.models.question import (
    Question, QuestionGroup, QuestionGroupMember,
    AnalysisResult, AnalysisStatus, SimilarityMethod, PracticeAttempt,
)
from app.models.bookmark import Bookmark
from app.utils.cache import app_cache


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/analyze")
async def start_analysis(
    paper_ids: List[int],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    result = await db.execute(select(Paper).filter(Paper.id.in_(paper_ids)))
    papers = result.scalars().all()
    if not papers:
        raise HTTPException(status_code=404, detail="No papers found")
    ar = AnalysisResult(user_id=current_user.id, paper_ids=paper_ids,
        paper_count=len(papers), subject=papers[0].subject if papers else None,
        status=AnalysisStatus.PENDING)
    db.add(ar); await db.flush()
    try:
        from app.services.question_extractor import extract_questions_from_pdf
        from app.core.config import settings

        def _resolve_pdf(paper):
            """Resolve a paper's stored file_url to (local_pdf_path, is_temp),
            or (None, False). is_temp marks a downloaded Supabase file that the
            caller must delete after extraction.

            file_url formats seen in the wild: a full URL with /files/<key>,
            a "/files/<key>" path, or a bare storage key like "6/<hash>.pdf".
            Files live under LOCAL_STORAGE_PATH or the ./uploads fallback
            (same lookup order as main.py's /files/ serving). The directory
            prefix in file_url can drift from where the file physically landed
            (it stores the uploader id), so fall back to a basename scan.
            """
            if not paper.file_url or (paper.file_type or "") != "application/pdf":
                return None, False
            url = paper.file_url
            if url.startswith("http"):
                m = re.search(r"/files/(.+)$", url)
                rel = m.group(1) if m else None
            elif url.startswith("/files/"):
                rel = url[len("/files/"):]
            else:
                rel = url
            if not rel:
                return None, False
            for base in (settings.LOCAL_STORAGE_PATH or "./storage", "./uploads"):
                path = os.path.join(base, rel)
                if os.path.exists(path):
                    return path, False
            basename = os.path.basename(rel)
            for base in (settings.LOCAL_STORAGE_PATH or "./storage", "./uploads"):
                if not os.path.isdir(base):
                    continue
                for root, _dirs, files in os.walk(base):
                    if basename in files:
                        return os.path.join(root, basename), False
            # Not local: uploaded to Supabase Storage — download to a temp file
            # (caller deletes it after extraction).
            try:
                from app.utils.supabase_client import is_supabase_storage_enabled, get_supabase_admin
                if is_supabase_storage_enabled():
                    admin = get_supabase_admin()
                    if admin:
                        data = admin.storage.from_(settings.SUPABASE_STORAGE_BUCKET).download(rel)
                        if data:
                            import tempfile
                            fd, tmp = tempfile.mkstemp(suffix=".pdf")
                            with os.fdopen(fd, "wb") as f:
                                f.write(data)
                            return tmp, True
            except Exception as dl_err:
                logger.warning(f"Analysis: Supabase download failed for {rel}: {dl_err}")
            return None, False

        for pid in paper_ids:
            pr = await db.execute(select(Paper).filter(Paper.id == pid))
            paper = pr.scalar_one_or_none()
            if not paper:
                continue
            # Idempotent: papers already extracted keep their questions, so
            # re-running an analysis never duplicates rows or groups.
            qcnt = (await db.execute(select(func.count(Question.id)).filter(Question.paper_id == pid))).scalar() or 0
            if qcnt > 0:
                continue
            pdf_path, is_temp = _resolve_pdf(paper)
            if not pdf_path:
                logger.warning(f"Analysis: no readable PDF for paper {pid} (file_type={paper.file_type})")
                continue
            try:
                extracted, _meta, _pages = extract_questions_from_pdf(pdf_path)
            except Exception as ext_err:
                # One unreadable paper must not fail the whole batch.
                logger.warning(f"Analysis: extraction failed for paper {pid}: {ext_err}")
                continue
            finally:
                if is_temp:
                    try:
                        os.remove(pdf_path)
                    except OSError:
                        pass
            for eq in extracted:
                db.add(Question(paper_id=paper.id, question_number=eq.question_number,
                    question_text=eq.original_text, original_question_text=eq.original_text,
                    normalized_question_text=eq.normalized_text,
                    section=eq.section, marks=eq.marks, question_type=eq.question_type,
                    topic=eq.topic, subject=paper.subject or "Unknown"))
            await db.flush()

        # Backfill topic/type on questions extracted before these fields existed
        # (idempotent: only fills NULLs, never overwrites).
        from app.services.question_extractor import detect_question_type, guess_topic
        stale = (await db.execute(select(Question).filter(
            Question.paper_id.in_(paper_ids), (Question.topic.is_(None)) | (Question.question_type == "descriptive")
        ))).scalars().all()
        for q in stale:
            if q.topic is None:
                q.topic = guess_topic(q.question_text or "")
            if q.question_type == "descriptive":
                q.question_type = detect_question_type(q.question_text or "")
        await db.flush()

        cnt = await db.execute(select(func.count(Question.id)).filter(Question.paper_id.in_(paper_ids)))
        ar.questions_extracted = cnt.scalar() or 0

        # Group exact duplicates across all subjects
        from sqlalchemy import text
        placeholders = ",".join([":" + str(i) for i in range(len(paper_ids))])
        params = {str(i): pid for i, pid in enumerate(paper_ids)}
        sql = text(f"SELECT normalized_question_text, subject, COUNT(*) as cnt FROM questions WHERE paper_id IN ({placeholders}) AND LENGTH(normalized_question_text) > 10 GROUP BY normalized_question_text HAVING COUNT(*) >= 2")
        dups = (await db.execute(sql, params)).fetchall()
        total_groups = 0
        member_qids = set()
        for row in dups:
            norm_text = row[0]
            subj = row[1]
            cnt = row[2]
            # Idempotent: reuse the existing group for this text instead of
            # creating a duplicate on re-analysis.
            eg = (await db.execute(select(QuestionGroup).filter(
                QuestionGroup.normalized_text == str(norm_text),
                QuestionGroup.similarity_method == SimilarityMethod.EXACT,
            ))).scalar_one_or_none()
            if eg:
                g = eg
                g.frequency = cnt
            else:
                g = QuestionGroup(representative_text=str(norm_text)[:500], normalized_text=str(norm_text), subject=subj, frequency=cnt, similarity_method=SimilarityMethod.EXACT, confidence=1.0)
                db.add(g)
                # autoflush is disabled: flush now so g.id exists before members reference it
                await db.flush()
            qr = await db.execute(select(Question).filter(Question.normalized_question_text == str(norm_text), Question.paper_id.in_(paper_ids)))
            for q in qr.scalars().all():
                if q.id in member_qids:
                    continue
                member_qids.add(q.id)
                # Skip if this question is already a member of this group
                # (exact + tfidf passes can overlap on the same text).
                dup_m = (await db.execute(select(QuestionGroupMember).filter(
                    QuestionGroupMember.question_id == q.id, QuestionGroupMember.group_id == g.id
                ))).scalar_one_or_none()
                if dup_m:
                    continue
                m = QuestionGroupMember(question_id=q.id, group_id=g.id, similarity_score=1.0, is_exact_match=True)
                db.add(m)
            total_groups += 1
            await db.flush()
        # TF-IDF similar question grouping per subject
        try:
            from app.services.analysis_service import group_similar
            # Get distinct subjects
            subj_r = await db.execute(select(Question.subject).filter(Question.paper_id.in_(paper_ids)).distinct())
            subjects = [s for (s,) in subj_r.all() if s]
            for subj in subjects:
                tfidf_groups = await group_similar(db, subj, 0.65)
                total_groups += tfidf_groups
        except Exception as tfidf_err:
            logger.warning(f"TF-IDF grouping skipped: {tfidf_err}")
        ar.repeated_groups = total_groups
        ar.status = AnalysisStatus.COMPLETED; await db.commit()
        # Invalidate repeated-questions cache so fresh data is served
        app_cache.clear_prefix("repeated_q:")
    except Exception as e:
        logger.exception("Analysis failed")
        # Discard the poisoned transaction first; committing it as-is raises and
        # surfaces as a raw 500. Re-add ar so the failed status is still recorded.
        await db.rollback()
        ar.status = AnalysisStatus.FAILED
        ar.error_message = str(e)
        db.add(ar)
        await db.commit()
    await db.refresh(ar)
    return {"id": ar.id, "status": ar.status.value,
        "questions_extracted": ar.questions_extracted, "repeated_groups": ar.repeated_groups,
        "error_message": ar.error_message}

@router.get("/analyses")
async def list_analyses(db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    r = await db.execute(select(AnalysisResult).filter(AnalysisResult.user_id == cu.id).order_by(desc(AnalysisResult.created_at)))
    return [{"id": x.id, "subject": x.subject, "paper_count": x.paper_count, "questions_extracted": x.questions_extracted, "repeated_groups": x.repeated_groups, "status": x.status.value, "created_at": x.created_at.isoformat() if x.created_at else None} for x in r.scalars().all()]

@router.get("/analyses/{aid}")
async def get_analysis(aid: int, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    r = await db.execute(select(AnalysisResult).filter(AnalysisResult.id == aid, AnalysisResult.user_id == cu.id))
    ar = r.scalar_one_or_none()
    if not ar: raise HTTPException(404, "Analysis not found")
    return {"id": ar.id, "subject": ar.subject, "paper_ids": ar.paper_ids, "questions_extracted": ar.questions_extracted, "repeated_groups": ar.repeated_groups, "status": ar.status.value, "error_message": ar.error_message}

@router.get("/analyses/{aid}/insights")
async def get_analysis_insights(aid: int, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    r = await db.execute(select(AnalysisResult).filter(AnalysisResult.id == aid, AnalysisResult.user_id == cu.id))
    ar = r.scalar_one_or_none()
    if not ar: raise HTTPException(404, "Analysis not found")
    from app.services.insights_service import build_insights
    return await build_insights(db, ar.paper_ids or [], analysis_id=aid)

@router.delete("/analyses/{aid}")
async def delete_analysis(aid: int, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    r = await db.execute(select(AnalysisResult).filter(AnalysisResult.id == aid, AnalysisResult.user_id == cu.id))
    ar = r.scalar_one_or_none()
    if not ar: raise HTTPException(404, "Analysis not found")
    await db.delete(ar); await db.commit()
    return {"message": "Analysis deleted"}

@router.get("/questions")
async def list_questions(subject: Optional[str] = None, paper_id: Optional[int] = None, skip: int = 0, limit: int = 50, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    q = select(Question)
    if subject: q = q.filter(Question.subject == subject)
    if paper_id: q = q.filter(Question.paper_id == paper_id)
    r = await db.execute(q.order_by(Question.id).offset(skip).limit(limit))
    return [{"id": x.id, "paper_id": x.paper_id, "question_number": x.question_number, "question_text": x.question_text, "section": x.section, "marks": x.marks, "question_type": x.question_type, "subject": x.subject} for x in r.scalars().all()]

@router.get("/questions/search")
async def search_questions(q: str = "", subject: Optional[str] = None, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    query = select(Question)
    if q: query = query.filter(Question.normalized_question_text.ilike("%" + q + "%"))
    if subject: query = query.filter(Question.subject == subject)
    r = await db.execute(query.limit(50))
    return [{"id": x.id, "question_text": x.question_text, "subject": x.subject, "marks": x.marks} for x in r.scalars().all()]

@router.get("/repeated-questions")
async def get_repeated_questions(subject: Optional[str] = None, min_frequency: int = 2, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    cache_key = f"repeated_q:{cu.tenant_id}:{subject}:{min_frequency}"
    cached = app_cache.get(cache_key)
    if cached is not None:
        return cached
    q = select(QuestionGroup).filter(QuestionGroup.frequency >= min_frequency)
    if subject: q = q.filter(QuestionGroup.subject == subject)
    r = await db.execute(q.order_by(desc(QuestionGroup.frequency)))
    result = [{"id": g.id, "representative_text": g.representative_text, "subject": g.subject, "frequency": g.frequency, "similarity_method": g.similarity_method.value if g.similarity_method else None} for g in r.scalars().all()]
    app_cache.set(cache_key, result, ttl=120)
    return result

@router.get("/repeated-questions/{gid}")
async def get_repeated_question_detail(gid: int, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    from sqlalchemy.orm import selectinload
    r = await db.execute(
        select(QuestionGroup)
        .filter(QuestionGroup.id == gid)
        .options(
            selectinload(QuestionGroup.members).selectinload(QuestionGroupMember.question).selectinload(Question.paper)
        )
    )
    g = r.scalars().unique().one_or_none()
    if not g: raise HTTPException(404, "Question group not found")
    evidence = []
    for m in g.members:
        q = m.question
        p = q.paper if q else None
        if q:
            evidence.append({"question_id": q.id, "question_text": q.question_text, "paper_year": p.year if p else None, "paper_title": p.title if p else None, "similarity_score": m.similarity_score, "is_exact_match": m.is_exact_match})
    evidence.sort(key=lambda x: x.get("paper_year") or 0)
    return {"id": g.id, "representative_text": g.representative_text, "subject": g.subject, "frequency": g.frequency, "evidence": evidence, "years": [e["paper_year"] for e in evidence if e.get("paper_year")]}

@router.post("/bookmarks")
async def create_bookmark(question_id: Optional[int] = None, paper_id: Optional[int] = None, group_id: Optional[int] = None, bookmark_type: str = "question", db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    existing = None
    if question_id:
        er = await db.execute(select(Bookmark).filter(Bookmark.user_id == cu.id, Bookmark.question_id == question_id))
        existing = er.scalar_one_or_none()
    if existing:
        return {"id": existing.id, "message": "Already bookmarked"}
    bm = Bookmark(user_id=cu.id, question_id=question_id, paper_id=paper_id, group_id=group_id, bookmark_type=bookmark_type)
    db.add(bm); await db.commit(); await db.refresh(bm)
    return {"id": bm.id, "message": "Bookmarked"}

@router.get("/bookmarks")
async def list_bookmarks(db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    from sqlalchemy.orm import selectinload
    r = await db.execute(
        select(Bookmark)
        .filter(Bookmark.user_id == cu.id)
        .options(selectinload(Bookmark.question))
        .order_by(desc(Bookmark.created_at))
    )
    items = []
    for bm in r.scalars().unique().all():
        item = {"id": bm.id, "bookmark_type": bm.bookmark_type}
        if bm.question:
            item["question"] = {"id": bm.question.id, "question_text": bm.question.question_text, "subject": bm.question.subject}
        items.append(item)
    return items

@router.delete("/bookmarks/{bid}")
async def delete_bookmark(bid: int, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    r = await db.execute(select(Bookmark).filter(Bookmark.id == bid, Bookmark.user_id == cu.id))
    bm = r.scalar_one_or_none()
    if not bm: raise HTTPException(404, "Bookmark not found")
    await db.delete(bm); await db.commit()
    return {"message": "Bookmark removed"}

@router.post("/practice")
async def start_practice(question_id: int, group_id: Optional[int] = None, db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    at = PracticeAttempt(user_id=cu.id, question_id=question_id, group_id=group_id, status="attempted")
    db.add(at); await db.commit(); await db.refresh(at)
    return {"id": at.id, "status": at.status}

@router.get("/practice/history")
async def practice_history(db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    from sqlalchemy.orm import selectinload
    r = await db.execute(
        select(PracticeAttempt)
        .filter(PracticeAttempt.user_id == cu.id)
        .options(selectinload(PracticeAttempt.question))
        .order_by(desc(PracticeAttempt.created_at))
        .limit(100)
    )
    items = []
    for at in r.scalars().unique().all():
        q = at.question
        items.append({"id": at.id, "question_id": at.question_id, "question_text": q.question_text if q else None, "subject": q.subject if q else None, "status": at.status})
    return items

@router.put("/practice/{aid}")
async def update_practice(aid: int, new_status: str = "reviewed", db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    r = await db.execute(select(PracticeAttempt).filter(PracticeAttempt.id == aid, PracticeAttempt.user_id == cu.id))
    at = r.scalar_one_or_none()
    if not at: raise HTTPException(404, "Practice attempt not found")
    at.status = new_status; await db.commit()
    return {"message": "Updated"}

@router.get("/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db), cu: User = Depends(get_current_active_user)):
    cache_key = f"dashboard:{cu.id}"
    cached = app_cache.get(cache_key)
    if cached is not None:
        return cached
    pc = (await db.execute(select(func.count(Paper.id)).filter(Paper.uploader_id == cu.id))).scalar() or 0
    qc = (await db.execute(select(func.count(Question.id)).join(Paper).filter(Paper.uploader_id == cu.id))).scalar() or 0
    rc = (await db.execute(select(func.count(QuestionGroup.id)).filter(QuestionGroup.frequency >= 2))).scalar() or 0
    mr = await db.execute(select(QuestionGroup).filter(QuestionGroup.frequency >= 2).order_by(desc(QuestionGroup.frequency)).limit(5))
    result = {"papers_analyzed": pc, "questions_extracted": qc, "repeated_groups": rc, "most_repeated": [{"id": g.id, "text": g.representative_text, "frequency": g.frequency, "subject": g.subject} for g in mr.scalars().all()]}
    app_cache.set(cache_key, result, ttl=60)
    return result

