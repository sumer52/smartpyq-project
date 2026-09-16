"""Analysis service - orchestrates extraction, grouping, and similarity.

Async SQLAlchemy 2.x implementation. The AsyncSession is NEVER passed into a
worker thread: database access uses ``select()`` + ``await`` on the event loop,
while only pure-CPU work (TF-IDF matrix, cosine similarity, union-find) is
offloaded to a thread via ``asyncio.to_thread``. The worker function receives
plain Python lists and returns plain results — no session, no ORM objects.
"""

import asyncio
import logging
import os
import re
import tempfile
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.paper import Paper
from app.models.question import (
    Question, QuestionGroup, QuestionGroupMember,
    AnalysisResult, AnalysisStatus, SimilarityMethod,
)
from app.services.question_extractor import extract_questions_from_pdf

logger = logging.getLogger(__name__)


def _normalize_for_exact(text: str) -> str:
    """Produce a canonical form for exact matching."""
    n = (text or "").lower().strip()
    n = re.sub(r"\s+", " ", n)
    return n


# ---------------------------------------------------------------------------
# Pure-CPU similarity helpers (no DB access — safe inside asyncio.to_thread)
# ---------------------------------------------------------------------------

def _cluster_similar(texts: List[str], threshold: float) -> List[List[int]]:
    """TF-IDF + cosine + union-find clustering over plain texts.

    Returns a list of clusters, each a list of indexes into ``texts`` with
    at least 2 members. Returns [] when scikit-learn is unavailable so the
    caller can degrade clearly instead of silently doing nothing.
    """
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
    except ImportError:
        logger.warning(
            "scikit-learn not installed - TF-IDF similarity disabled "
            "(add scikit-learn to requirements.txt to enable similar-question grouping)"
        )
        return []

    vec = TfidfVectorizer(max_features=5000, stop_words="english")
    mat = vec.fit_transform(texts)
    sim = cosine_similarity(mat)

    parent = list(range(len(texts)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    n = len(texts)
    for i in range(n):
        for j in range(i + 1, n):
            if sim[i][j] >= threshold:
                union(i, j)

    clusters = defaultdict(list)
    for i in range(n):
        clusters[find(i)].append(i)
    return [members for members in clusters.values() if len(members) >= 2]


# ---------------------------------------------------------------------------
# PDF resolution (mirrors routers/analysis.py _resolve_pdf semantics)
# ---------------------------------------------------------------------------

def _resolve_pdf_path(paper: Paper) -> Tuple[Optional[str], bool]:
    """Resolve a paper's stored file_url to (local_pdf_path, is_temp).

    is_temp marks a downloaded Supabase file that the caller MUST delete
    after extraction (use try/finally). Returns (None, False) when the
    file cannot be located or downloaded.
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
        rel = url  # bare storage key, e.g. "6/<hash>.pdf"
    if not rel:
        return None, False

    # Normalize to a forward-slash key and refuse path traversal.
    rel = rel.replace("\\", "/")
    if ".." in rel.split("/"):
        logger.warning(f"Refusing suspicious storage key for paper {paper.id}: {rel}")
        return None, False

    for base in (settings.LOCAL_STORAGE_PATH or "./storage", "./uploads"):
        path = os.path.join(base, rel)
        if os.path.exists(path):
            return path, False

    # Directory prefixes can drift (file_url stores the uploader id); fall
    # back to a basename scan of local storage.
    basename = os.path.basename(rel)
    for base in (settings.LOCAL_STORAGE_PATH or "./storage", "./uploads"):
        if not os.path.isdir(base):
            continue
        for root, _dirs, files in os.walk(base):
            if basename in files:
                return os.path.join(root, basename), False

    # Not local: fetch the private Supabase object into a temp file.
    try:
        from app.utils.supabase_client import is_supabase_storage_enabled, get_supabase_admin
        if is_supabase_storage_enabled():
            admin = get_supabase_admin()
            if admin:
                data = admin.storage.from_(settings.SUPABASE_STORAGE_BUCKET).download(rel)
                if data:
                    fd, tmp = tempfile.mkstemp(suffix=".pdf")
                    with os.fdopen(fd, "wb") as f:
                        f.write(data)
                    return tmp, True
    except Exception as dl_err:
        logger.warning(f"Analysis: Supabase download failed for {rel}: {dl_err}")

    return None, False


# ---------------------------------------------------------------------------
# Async pipeline
# ---------------------------------------------------------------------------

async def extract_and_store(db: AsyncSession, paper: Paper) -> int:
    """Extract questions from a paper's PDF and store them. Returns count."""
    pdf_path, is_temp = await asyncio.to_thread(_resolve_pdf_path, paper)
    if not pdf_path:
        raise FileNotFoundError(f"PDF not found for paper {paper.id}: {paper.file_url}")

    try:
        extracted, _meta, _pages = await asyncio.to_thread(extract_questions_from_pdf, pdf_path)
    finally:
        if is_temp:
            try:
                os.remove(pdf_path)
            except OSError:
                pass

    subject = paper.subject or "Unknown"
    for eq in extracted:
        db.add(Question(
            paper_id=paper.id,
            question_number=eq.question_number,
            question_text=eq.original_text,
            original_question_text=eq.original_text,
            normalized_question_text=eq.normalized_text,
            section=eq.section,
            marks=eq.marks,
            question_type=eq.question_type,
            topic=eq.topic,
            subject=subject,
        ))
    await db.commit()
    return len(extracted)


async def group_exact(db: AsyncSession, subject: str) -> int:
    """Find exact-duplicate questions and create groups. Returns new group count."""
    rows = (await db.execute(
        select(Question.id, Question.original_question_text, Question.normalized_question_text)
        .filter(Question.subject == subject)
    )).all()
    grouped_ids = {qid for (qid,) in (await db.execute(select(QuestionGroupMember.question_id))).all()}

    norm_map = defaultdict(list)
    for qid, original, normalized in rows:
        if qid in grouped_ids:
            continue
        norm = _normalize_for_exact(normalized)
        if len(norm) < 10:
            continue
        norm_map[norm].append((qid, original, normalized))

    new_groups = 0
    for norm_text, qs in norm_map.items():
        if len(qs) < 2:
            continue
        group = QuestionGroup(
            representative_text=(qs[0][1] or qs[0][2])[:500],
            normalized_text=norm_text,
            subject=subject,
            frequency=len(qs),
            similarity_method=SimilarityMethod.EXACT,
            confidence=1.0,
        )
        db.add(group)
        # Flush now so group.id exists before members reference it
        # (insert with group_id=None raises IntegrityError otherwise).
        await db.flush()
        for qid, _original, _normalized in qs:
            db.add(QuestionGroupMember(
                question_id=qid,
                group_id=group.id,
                similarity_score=1.0,
                is_exact_match=True,
            ))
        new_groups += 1

    await db.commit()
    return new_groups


async def group_similar(db: AsyncSession, subject: str, threshold: float = 0.65) -> int:
    """TF-IDF based similar-question grouping. Returns new group count.

    DB reads/writes happen on the event loop; the CPU-bound TF-IDF +
    cosine + clustering step runs in a worker thread on plain lists.
    """
    rows = (await db.execute(
        select(Question.id, Question.original_question_text, Question.normalized_question_text)
        .filter(Question.subject == subject)
    )).all()
    grouped_ids = {qid for (qid,) in (await db.execute(select(QuestionGroupMember.question_id))).all()}

    ungrouped = [
        (qid, normalized, original)
        for (qid, original, normalized) in rows
        if qid not in grouped_ids and normalized and len(normalized) >= 10
    ]
    if len(ungrouped) < 2:
        return 0

    texts = [u[1] for u in ungrouped]
    clusters = await asyncio.to_thread(_cluster_similar, texts, threshold)
    if not clusters:
        return 0

    new_groups = 0
    for member_idxs in clusters:
        qs = [ungrouped[i] for i in member_idxs]
        group = QuestionGroup(
            representative_text=(qs[0][2] or qs[0][1])[:500],
            normalized_text=qs[0][1],
            subject=subject,
            frequency=len(qs),
            similarity_method=SimilarityMethod.TFIDF,
            confidence=threshold,
        )
        db.add(group)
        await db.flush()
        for qid, _normalized, _original in qs:
            db.add(QuestionGroupMember(
                question_id=qid,
                group_id=group.id,
                similarity_score=1.0,
                is_exact_match=False,
            ))
        new_groups += 1

    await db.commit()
    return new_groups


def canonical_paper_set(paper_ids: List[int]) -> List[int]:
    """Deduplicated, order-independent paper-id list for an analysis."""
    return sorted({int(p) for p in paper_ids})


async def find_completed_analysis(db: AsyncSession, paper_ids: List[int]) -> Optional[AnalysisResult]:
    """Return a COMPLETED AnalysisResult covering exactly this paper set.

    Spec section 19: stored analysis results are reused so the same papers
    are not reprocessed. A changed paper set naturally produces a new
    analysis (the set itself is the invalidation key).
    """
    ids = canonical_paper_set(paper_ids)
    rows = (await db.execute(
        select(AnalysisResult).filter(
            AnalysisResult.status == AnalysisStatus.COMPLETED,
            AnalysisResult.paper_count == len(ids),
        )
    )).scalars().all()
    for ar in rows:
        try:
            stored = sorted(int(x) for x in (ar.paper_ids or []))
        except (TypeError, ValueError):
            continue
        if stored == ids:
            return ar
    return None


class AnalysisError(Exception):
    """Raised when the analysis pipeline cannot produce any usable result."""


async def run_analysis_for_papers(
    db: AsyncSession, paper_ids: List[int], user_id: int
) -> Tuple[AnalysisResult, bool]:
    """Run extraction + grouping for a paper set (synchronously).

    Returns (AnalysisResult, reused). Reuses an existing COMPLETED analysis
    for the identical paper set. Idempotent: papers that already have
    extracted questions are not re-extracted, so re-running never
    duplicates rows or groups. Raises AnalysisError only when NOTHING
    could be extracted from ANY paper; partial failures degrade to a
    smaller analysis (logged, not fatal).
    """
    ids = canonical_paper_set(paper_ids)

    existing = await find_completed_analysis(db, ids)
    if existing is not None:
        return existing, True

    papers = (await db.execute(select(Paper).filter(Paper.id.in_(ids)))).scalars().all()
    if not papers:
        raise AnalysisError("No papers found for the selected ids")

    ar = AnalysisResult(
        user_id=user_id,
        paper_ids=ids,
        paper_count=len(papers),
        subject=papers[0].subject if papers else None,
        status=AnalysisStatus.PENDING,
    )
    db.add(ar)
    await db.flush()

    try:
        ar.status = AnalysisStatus.EXTRACTING
        await db.commit()

        extracted_any = False
        for pid in ids:
            paper = (await db.execute(select(Paper).filter(Paper.id == pid))).scalar_one_or_none()
            if not paper:
                continue
            qcnt = (await db.execute(
                select(func.count(Question.id)).filter(Question.paper_id == pid)
            )).scalar() or 0
            if qcnt > 0:
                extracted_any = True
                continue  # idempotent: already extracted
            pdf_path, is_temp = await asyncio.to_thread(_resolve_pdf_path, paper)
            if not pdf_path:
                logger.warning(
                    f"Analysis: no readable PDF for paper {pid} "
                    f"(file_type={paper.file_type})"
                )
                continue
            try:
                extracted, _meta, _pages = await asyncio.to_thread(
                    extract_questions_from_pdf, pdf_path
                )
                subject = paper.subject or "Unknown"
                for eq in extracted:
                    db.add(Question(
                        paper_id=paper.id,
                        question_number=eq.question_number,
                        question_text=eq.original_text,
                        original_question_text=eq.original_text,
                        normalized_question_text=eq.normalized_text,
                        section=eq.section,
                        marks=eq.marks,
                        question_type=eq.question_type,
                        topic=eq.topic,
                        subject=subject,
                    ))
                await db.flush()
                if extracted:
                    extracted_any = True
            except Exception as ext_err:
                # One unreadable paper must not fail the whole batch.
                logger.warning(f"Analysis: extraction failed for paper {pid}: {ext_err}")
                await db.rollback()
                # Re-fetch the analysis row after the rollback that discarded
                # the poisoned transaction (it carries our progress state).
                ar = (await db.execute(
                    select(AnalysisResult).filter(AnalysisResult.id == ar.id)
                )).scalar_one()
                ar.status = AnalysisStatus.EXTRACTING
                await db.commit()
            finally:
                if is_temp:
                    try:
                        os.remove(pdf_path)
                    except OSError:
                        pass

        if not extracted_any:
            raise AnalysisError(
                "No questions could be extracted from the selected papers. "
                "The files may be missing, unreadable, or scanned images "
                "without a text layer."
            )

        ar.questions_extracted = (await db.execute(
            select(func.count(Question.id)).filter(Question.paper_id.in_(ids))
        )).scalar() or 0
        ar.status = AnalysisStatus.ANALYZING
        await db.commit()

        # Backfill topic/type on questions extracted before these fields
        # existed (idempotent: only fills NULLs/defaults, never overwrites).
        from app.services.question_extractor import detect_question_type, guess_topic
        stale = (await db.execute(select(Question).filter(
            Question.paper_id.in_(ids),
            (Question.topic.is_(None)) | (Question.question_type == "descriptive"),
        ))).scalars().all()
        for q in stale:
            if q.topic is None:
                q.topic = guess_topic(q.question_text or "")
            if q.question_type == "descriptive":
                q.question_type = detect_question_type(q.question_text or "")
        await db.flush()

        # ---- exact duplicates (normalized text equality) -----------------
        from sqlalchemy import text as _text
        placeholders = ",".join([":" + str(i) for i in range(len(ids))])
        params = {str(i): pid for i, pid in enumerate(ids)}
        sql = _text(
            f"SELECT normalized_question_text, subject, COUNT(*) as cnt FROM questions "
            f"WHERE paper_id IN ({placeholders}) AND LENGTH(normalized_question_text) > 10 "
            f"GROUP BY normalized_question_text HAVING COUNT(*) >= 2"
        )
        dups = (await db.execute(sql, params)).fetchall()
        total_groups = 0
        member_qids = set()
        for row in dups:
            norm_text, subj, cnt = row[0], row[1], row[2]
            eg = (await db.execute(select(QuestionGroup).filter(
                QuestionGroup.normalized_text == str(norm_text),
                QuestionGroup.similarity_method == SimilarityMethod.EXACT,
            ))).scalar_one_or_none()
            if eg:
                g = eg
                g.frequency = cnt
            else:
                g = QuestionGroup(
                    representative_text=str(norm_text)[:500],
                    normalized_text=str(norm_text),
                    subject=subj,
                    frequency=cnt,
                    similarity_method=SimilarityMethod.EXACT,
                    confidence=1.0,
                )
                db.add(g)
                await db.flush()
            # Never claim a question that already belongs to a group (e.g. it
            # was matched by TF-IDF in an earlier run): one membership per
            # question keeps group statistics and the question-detail endpoint
            # well-defined.
            qr = await db.execute(
                select(Question)
                .outerjoin(QuestionGroupMember, QuestionGroupMember.question_id == Question.id)
                .filter(
                    Question.normalized_question_text == str(norm_text),
                    Question.paper_id.in_(ids),
                    QuestionGroupMember.id.is_(None),
                )
            )
            for q in qr.scalars().all():
                if q.id in member_qids:
                    continue
                member_qids.add(q.id)
                dup_m = (await db.execute(select(QuestionGroupMember).filter(
                    QuestionGroupMember.question_id == q.id,
                    QuestionGroupMember.group_id == g.id,
                ))).scalar_one_or_none()
                if dup_m:
                    continue
                db.add(QuestionGroupMember(
                    question_id=q.id, group_id=g.id,
                    similarity_score=1.0, is_exact_match=True,
                ))
            total_groups += 1
            await db.flush()

        # ---- TF-IDF semantic grouping per subject ------------------------
        subj_r = await db.execute(
            select(Question.subject).filter(Question.paper_id.in_(ids)).distinct()
        )
        subjects = [s for (s,) in subj_r.all() if s]
        exact_count = 0
        for subj in subjects:
            try:
                total_groups += await group_similar(db, subj, 0.65)
            except Exception as tfidf_err:
                logger.warning(f"TF-IDF grouping skipped for {subj}: {tfidf_err}")
            exact_count += (await db.execute(
                select(func.count(QuestionGroup.id)).filter(
                    QuestionGroup.subject == subj,
                    QuestionGroup.similarity_method == SimilarityMethod.EXACT,
                )
            )).scalar() or 0

        ar.repeated_groups = total_groups
        ar.exact_matches = exact_count
        ar.similar_matches = max(0, total_groups - exact_count)
        ar.status = AnalysisStatus.COMPLETED
        from sqlalchemy.sql import func as _func
        ar.completed_at = _func.now()
        await db.commit()

        # Invalidate repeated-questions cache so fresh data is served.
        from app.utils.cache import app_cache
        app_cache.clear_prefix("repeated_q:")
        return ar, False

    except AnalysisError:
        # Expected degradation path: record the failure and re-raise for the
        # HTTP layer. The error message was already logged upstream.
        try:
            await db.rollback()
            ar = (await db.execute(
                select(AnalysisResult).filter(AnalysisResult.id == ar.id)
            )).scalar_one_or_none()
            if ar:
                ar.status = AnalysisStatus.FAILED
                await db.commit()
        except Exception:
            pass
        raise
    except Exception as e:
        logger.exception(f"Analysis for papers {ids} failed")
        try:
            await db.rollback()
        except Exception:
            pass
        ar = (await db.execute(
            select(AnalysisResult).filter(AnalysisResult.id == ar.id)
        )).scalar_one_or_none()
        if ar:
            ar.status = AnalysisStatus.FAILED
            ar.error_message = str(e)
            await db.commit()
        raise AnalysisError(str(e)) from e


async def run_analysis(db: AsyncSession, analysis_id: int) -> None:
    """Run the full analysis pipeline for a given AnalysisResult record."""
    ar = (await db.execute(
        select(AnalysisResult).filter(AnalysisResult.id == analysis_id)
    )).scalar_one_or_none()
    if not ar:
        return

    try:
        ar.status = AnalysisStatus.EXTRACTING
        await db.commit()

        total_extracted = 0
        for pid in ar.paper_ids:
            paper = (await db.execute(
                select(Paper).filter(Paper.id == pid)
            )).scalar_one_or_none()
            if paper:
                total_extracted += await extract_and_store(db, paper)

        ar.questions_extracted = total_extracted
        ar.status = AnalysisStatus.ANALYZING
        await db.commit()

        subjects = (await db.execute(
            select(Question.subject)
            .filter(Question.paper_id.in_(ar.paper_ids))
            .distinct()
        )).all()

        total_groups = 0
        for (subj,) in subjects:
            if not subj:
                continue
            total_groups += await group_exact(db, subj)
            total_groups += await group_similar(db, subj)

        ar.repeated_groups = total_groups
        exact_count = (await db.execute(
            select(func.count(QuestionGroup.id)).filter(
                QuestionGroup.subject.in_([s for (s,) in subjects]),
                QuestionGroup.similarity_method == SimilarityMethod.EXACT,
            )
        )).scalar() or 0
        ar.exact_matches = exact_count
        ar.similar_matches = total_groups - exact_count
        ar.status = AnalysisStatus.COMPLETED
        await db.commit()

    except Exception as e:
        logger.exception(f"Analysis {analysis_id} failed")
        # Roll back the failed transaction before writing the failure state.
        try:
            await db.rollback()
        except Exception:
            pass
        ar = (await db.execute(
            select(AnalysisResult).filter(AnalysisResult.id == analysis_id)
        )).scalar_one_or_none()
        if ar:
            ar.status = AnalysisStatus.FAILED
            ar.error_message = str(e)
            await db.commit()
