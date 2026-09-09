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
