"""Analysis, questions, bookmarks, and practice API endpoints."""

import logging
import os
import re
from typing import List, Optional

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_active_user, require_roles
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

# Dedicated limiter for the public analysis endpoint. The RateLimitExceeded
# exception is handled globally by main.py's registered handler.
from slowapi import Limiter
from slowapi.util import get_remote_address as _get_remote_address
limiter = Limiter(key_func=_get_remote_address)

# Internal attribution account for anonymous public analyses (AnalysisResult.
# user_id is NOT NULL + FK). Created lazily once; never used for login.
SYSTEM_ANALYSIS_EMAIL = "analysis-system@smartpyq.internal"


async def _get_system_user_id(db: AsyncSession) -> int:
    from app.models.user import User, UserRole, UserStatus
    r = await db.execute(select(User).filter(User.email == SYSTEM_ANALYSIS_EMAIL))
    u = r.scalar_one_or_none()
    if u:
        return u.id
    u = User(
        email=SYSTEM_ANALYSIS_EMAIL,
        username="analysis-system",
        full_name="Analysis System",
        password_hash="",  # never used for authentication
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,
        tenant_id=1,
        is_email_verified=True,
        preferences={},
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u.id


@router.post("/analyze")
async def start_analysis(
    paper_ids: List[int],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(["admin", "tenant_admin"])),
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
        from app.services.question_extractor import extract_questions_from_file
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
            file_type = (paper.file_type or "").lower()
            if file_type != "application/pdf" and not file_type.startswith("image/"):
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
                            ext = os.path.splitext(rel)[1].lower() or ".pdf"
                            fd, tmp = tempfile.mkstemp(suffix=ext)
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
                extracted, _meta, _pages = extract_questions_from_file(pdf_path)
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

# ---------------------------------------------------------------------------
# Public, rate-limited analysis for the PYQ Hub multi-year flow
# ---------------------------------------------------------------------------

@router.post("/analyze-public")
@limiter.limit("10/hour")
async def analyze_public(
    request: Request,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Run PYQ analysis for user-selected papers (public, rate-limited).

    Constraints:
    - 1..6 papers per request (CPU-heavy extraction) and every paper must
      exist and be APPROVED.
    - Reuses an existing COMPLETED analysis for the identical paper set
      (spec section 19) instead of reprocessing.
    - Degrades gracefully: unreadable papers are skipped; an error is only
      raised when zero questions could be extracted from everything.
    Returns {analysis_id, reused, insights} in one response.
    """
    from app.services.analysis_service import (
        run_analysis_for_papers, AnalysisError, canonical_paper_set,
    )
    from app.services.insights_service import build_insights
    from app.models.paper import PaperStatus

    raw_ids = (body or {}).get("paper_ids") or []
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=422, detail="paper_ids must be a non-empty list")
    try:
        paper_ids = canonical_paper_set(raw_ids)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="paper_ids must be a list of integers")
    if len(paper_ids) > 6:
        raise HTTPException(status_code=422, detail="Analyze at most 6 papers at a time")

    papers = (await db.execute(select(Paper).filter(Paper.id.in_(paper_ids)))).scalars().all()
    found_ids = {p.id for p in papers}
    missing = [pid for pid in paper_ids if pid not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Paper(s) not found: {missing}")
    not_approved = [p.id for p in papers if p.status != PaperStatus.APPROVED]
    if not_approved:
        raise HTTPException(status_code=422, detail=f"Paper(s) are not available for analysis: {not_approved}")

    system_user_id = await _get_system_user_id(db)
    try:
        ar, reused = await run_analysis_for_papers(db, paper_ids, user_id=system_user_id)
    except AnalysisError as e:
        raise HTTPException(status_code=422, detail=str(e))

    insights = await build_insights(db, paper_ids, analysis_id=ar.id)
    return {
        "analysis_id": ar.id,
        "reused": reused,
        "status": ar.status.value if hasattr(ar.status, "value") else str(ar.status),
        "insights": insights,
        "paper_ids": paper_ids,
    }


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
async def get_analysis_insights(aid: int, db: AsyncSession = Depends(get_db)):
    """Insights for an analysis (public read).

    Exposes only aggregate analysis data over already-public papers — the
    same class of data as the public GET /questions and /repeated-questions
    endpoints. User-specific endpoints (practice history, bookmarks) remain
    authenticated.
    """
    r = await db.execute(select(AnalysisResult).filter(AnalysisResult.id == aid))
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
async def list_questions(
    subject: Optional[str] = None,
    paper_id: Optional[int] = None,
    paper_ids: Optional[str] = None,   # comma-separated list (explorer)
    topic: Optional[str] = None,
    question_type: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Question explorer (public): filter by papers/topic/type/search.

    Each row carries its group-recurrence evidence when the question belongs
    to a repeated-question group: frequency, years asked, group priority.
    The priority denominator is the analyzed paper set when ``paper_ids`` is
    given, else the count of approved papers for that subject ("appeared in
    X of Y available papers").
    """
    from app.models.paper import Paper as PaperModel, PaperStatus
    from app.services.insights_service import PRIORITY_LABELS, history_priority

    q = select(Question)
    if subject: q = q.filter(Question.subject == subject)
    if paper_id: q = q.filter(Question.paper_id == paper_id)
    if paper_ids:
        try:
            ids = [int(x) for x in paper_ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=422, detail="paper_ids must be comma-separated integers")
        if ids:
            q = q.filter(Question.paper_id.in_(ids))
    if topic: q = q.filter(Question.topic == topic)
    if question_type: q = q.filter(Question.question_type == question_type)
    if search:
        q = q.filter(Question.normalized_question_text.ilike("%" + search + "%"))
    rows = (await db.execute(q.order_by(Question.id).offset(skip).limit(min(limit, 300)))).scalars().all()

    if not rows:
        return []

    # Group membership for recurrence evidence.
    qids = [x.id for x in rows]
    member_rows = (await db.execute(
        select(QuestionGroupMember, QuestionGroup)
        .join(QuestionGroup, QuestionGroupMember.group_id == QuestionGroup.id)
        .filter(QuestionGroupMember.question_id.in_(qids))
    )).all()
    member_by_qid = {m.question_id: (m, g) for m, g in member_rows}

    # Group member -> paper/year mapping for years_asked.
    all_group_ids = list({g.id for _m, g in member_by_qid.values()})
    group_members = (await db.execute(
        select(QuestionGroupMember, Question)
        .join(Question, QuestionGroupMember.question_id == Question.id)
        .filter(QuestionGroupMember.group_id.in_(all_group_ids or [0]))
    )).all()
    group_year_map = defaultdict(list)
    group_paper_hit_map = defaultdict(set)
    paper_years = {}
    paper_ids_needed = {q.paper_id for _m, q in group_members}
    if paper_ids_needed:
        prows = (await db.execute(select(PaperModel).filter(PaperModel.id.in_(paper_ids_needed)))).scalars().all()
        paper_years = {p.id: p.year for p in prows}
    for _m, q in group_members:
        y = paper_years.get(q.paper_id)
        group_year_map[_m.group_id].append(y)
        group_paper_hit_map[_m.group_id].add(q.paper_id)

    out = []
    # Denominator for historical priority: the analyzed set when given,
    # otherwise all approved papers of the row's subject.
    analyzed_ids = set()
    if paper_ids:
        try:
            analyzed_ids = {int(x) for x in paper_ids.split(",") if x.strip()}
        except ValueError:
            analyzed_ids = set()
    subject_denominators = {}
    if not analyzed_ids:
        for subj in {x.subject for x in rows if x.subject}:
            subject_denominators[subj] = (await db.execute(
                select(func.count(PaperModel.id)).filter(
                    PaperModel.subject == subj,
                    PaperModel.status == PaperStatus.APPROVED,
                )
            )).scalar() or 1
    for x in rows:
        item = {
            "id": x.id, "paper_id": x.paper_id, "question_number": x.question_number,
            "question_text": x.question_text, "section": x.section, "marks": x.marks,
            "question_type": x.question_type, "subject": x.subject, "topic": x.topic,
            "frequency": 1, "years_asked": [], "group_id": None,
            "priority": None, "priority_label": None,
        }
        m = member_by_qid.get(x.id)
        if m:
            _mem, g = m
            hits = group_paper_hit_map.get(g.id, set())
            freq = len(group_year_map.get(g.id, [])) or g.frequency
            item["frequency"] = freq
            item["years_asked"] = sorted({y for y in group_year_map.get(g.id, []) if y})
            item["group_id"] = g.id
            denom = len(analyzed_ids) if analyzed_ids else subject_denominators.get(x.subject, 1)
            priority = history_priority(len(hits) / max(1, denom), freq)
            item["priority"] = priority
            item["priority_label"] = PRIORITY_LABELS[priority]
        # Teacher answer availability (Exam Practice Mode). The answer content
        # itself is fetched via /questions/{qid}/detail or the answers router.
        if x.answer_type:
            item["answer_type"] = x.answer_type
            item["has_answer"] = True
        else:
            item["has_answer"] = False
        out.append(item)
    return out

def _answer_block(question, paper) -> dict:
    """Teacher-answer serialization for question detail responses.

    Text answers return the text; image/pdf answers return a served-file URL
    only when the parent paper is approved (public visibility rule identical
    to paper downloads).
    """
    approved = paper is not None and str(
        getattr(paper.status, "value", paper.status) or ""
    ).lower() == "approved"
    block = {
        "answer_type": question.answer_type,
        "answer_text": None,
        "answer_file_name": None,
        "answer_file_size": None,
        "answer_file_mime": None,
        "answer_url": None,
    }
    if not question.answer_type:
        return block
    if question.answer_type == "text":
        block["answer_text"] = question.answer_text
    elif question.answer_file_url and approved:
        block["answer_file_name"] = question.answer_file_name
        block["answer_file_size"] = question.answer_file_size
        block["answer_file_mime"] = question.answer_file_mime
        block["answer_url"] = f"/api/v1/questions/{question.id}/answer-file"
    return block


@router.get("/questions/{qid}/detail")
async def question_detail(qid: int, papers: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Question detail (public): topic, asked-in years, priority, related.

    ``papers`` (comma-separated analyzed-paper ids) gives the priority
    denominator; without it the count of approved papers for the question's
    subject is used.
    """
    from app.models.paper import PaperStatus
    from app.services.insights_service import PRIORITY_LABELS, history_priority
    x = (await db.execute(select(Question).filter(Question.id == qid))).scalar_one_or_none()
    if not x:
        raise HTTPException(status_code=404, detail="Question not found")
    paper = (await db.execute(select(Paper).filter(Paper.id == x.paper_id))).scalar_one_or_none()

    # A question can theoretically appear in more than one group (e.g. it was
    # first grouped by TF-IDF and later matched exactly). Prefer the exact
    # match group, then the earliest — never crash on multiple memberships.
    mem_row = (await db.execute(
        select(QuestionGroupMember)
        .filter(QuestionGroupMember.question_id == x.id)
        .order_by(QuestionGroupMember.is_exact_match.desc(), QuestionGroupMember.group_id.asc())
        .limit(1)
    )).scalar_one_or_none()
    mem = mem_row
    related = []
    frequency = 1
    years_asked = []
    group_id = None
    priority = None
    priority_label = None
    group_paper_hits = set()
    if mem:
        g = (await db.execute(select(QuestionGroup).filter(QuestionGroup.id == mem.group_id))).scalar_one_or_none()
        siblings = (await db.execute(
            select(QuestionGroupMember, Question)
            .join(Question, QuestionGroupMember.question_id == Question.id)
            .filter(QuestionGroupMember.group_id == mem.group_id)
        )).all()
        paper_rows = (await db.execute(select(Paper).filter(Paper.id.in_({q.paper_id for _m, q in siblings} or {0})))).scalars().all()
        pmap = {p.id: p for p in paper_rows}
        for _m, q in siblings:
            p = pmap.get(q.paper_id)
            group_paper_hits.add(q.paper_id)
            if p and p.year:
                years_asked.append(p.year)
            related.append({
                "question_id": q.id,
                "question_text": q.original_question_text or q.question_text,
                "year": p.year if p else None,
                "paper_title": p.title if p else None,
                "is_exact_match": _m.is_exact_match,
            })
        frequency = len(related)
        years_asked = sorted(set(years_asked))
        group_id = mem.group_id
        analyzed_ids = set()
        if papers:
            try:
                analyzed_ids = {int(v) for v in papers.split(",") if v.strip()}
            except ValueError:
                analyzed_ids = set()
        if analyzed_ids:
            denom = len(analyzed_ids)
        else:
            denom = (await db.execute(
                select(func.count(Paper.id)).filter(
                    Paper.subject == x.subject,
                    Paper.status == PaperStatus.APPROVED,
                )
            )).scalar() or 1
        priority = history_priority(len(group_paper_hits) / max(1, denom), frequency)
        priority_label = PRIORITY_LABELS[priority]
    related.sort(key=lambda r: (r["year"] is None, r["year"] or 0))

    return {
        "id": x.id,
        "question_text": x.original_question_text or x.question_text,
        "question_number": x.question_number,
        "topic": x.topic,
        "subject": x.subject,
        "marks": x.marks,
        "question_type": x.question_type,
        "paper_id": x.paper_id,
        "paper_year": paper.year if paper else None,
        "paper_title": paper.title if paper else None,
        "group_id": group_id,
        "frequency": frequency,
        "years_asked": years_asked,
        "priority": priority,
        "priority_label": priority_label,
        "related": related,
        # Teacher answer (read-only). File answers get a served URL only when
        # the parent paper is approved — mirrors paper download visibility.
        **_answer_block(x, paper),
    }

@router.get("/questions/search")
async def search_questions(q: str = "", subject: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Question)
    if q: query = query.filter(Question.normalized_question_text.ilike("%" + q + "%"))
    if subject: query = query.filter(Question.subject == subject)
    r = await db.execute(query.limit(50))
    return [{"id": x.id, "question_text": x.question_text, "subject": x.subject, "marks": x.marks} for x in r.scalars().all()]

@router.get("/repeated-questions")
async def get_repeated_questions(subject: Optional[str] = None, min_frequency: int = 2, db: AsyncSession = Depends(get_db)):
    cache_key = f"repeated_q:public:{subject}:{min_frequency}"
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
async def get_repeated_question_detail(gid: int, db: AsyncSession = Depends(get_db)):
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

