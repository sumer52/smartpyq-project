"""Analysis service - orchestrates extraction, grouping, and similarity."""

import logging
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.paper import Paper
from app.models.question import (
    Question, QuestionGroup, QuestionGroupMember,
    AnalysisResult, AnalysisStatus, SimilarityMethod,
)
from app.services.question_extractor import extract_questions_from_pdf, ExtractedQuestion

logger = logging.getLogger(__name__)


def _normalize_for_exact(text: str) -> str:
    """Produce a canonical form for exact matching."""
    import re
    n = text.lower().strip()
    n = re.sub(r"\s+", " ", n)
    return n


def _build_tfidf_matrix(texts):
    """Return (vectorizer, matrix) or (None, None) if sklearn unavailable."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        vec = TfidfVectorizer(max_features=5000, stop_words="english")
        mat = vec.fit_transform(texts)
        return vec, mat
    except ImportError:
        logger.warning("scikit-learn not installed - TF-IDF similarity disabled")
        return None, None


def _cosine_sim_matrix(mat):
    from sklearn.metrics.pairwise import cosine_similarity
    return cosine_similarity(mat)


def extract_and_store(db: Session, paper: Paper) -> int:
    """Extract questions from a paper's PDF and store them. Returns count."""
    import os
    from app.core.config import get_settings
    settings = get_settings()

    file_path = paper.file_url
    if file_path and file_path.startswith("/files/"):
        rel = file_path[len("/files/"):]
        file_path = os.path.join(settings.LOCAL_STORAGE_DIR, rel.lstrip("/"))

    if not file_path or not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF not found: {file_path}")

    extracted = extract_questions_from_pdf(file_path)
    subject = paper.subject or "Unknown"

    for eq in extracted:
        q = Question(
            paper_id=paper.id,
            question_number=eq.question_number,
            question_text=eq.original_text,
            original_question_text=eq.original_text,
            normalized_question_text=eq.normalized_text,
            section=eq.section,
            marks=eq.marks,
            question_type=eq.question_type,
            subject=subject,
        )
        db.add(q)

    db.commit()
    return len(extracted)


def group_exact(db: Session, subject: str) -> int:
    """Find exact-duplicate questions and create groups. Returns new group count."""
    questions = (
        db.query(Question)
        .filter(Question.subject == subject)
        .all()
    )

    grouped_ids = set(
        m.question_id
        for m in db.query(QuestionGroupMember.question_id).all()
    )

    norm_map = defaultdict(list)
    for q in questions:
        if q.id in grouped_ids:
            continue
        norm = _normalize_for_exact(q.normalized_question_text)
        if len(norm) < 10:
            continue
        norm_map[norm].append(q)

    new_groups = 0
    for norm_text, qs in norm_map.items():
        if len(qs) < 2:
            continue
        group = QuestionGroup(
            representative_text=qs[0].original_question_text,
            normalized_text=norm_text,
            subject=subject,
            frequency=len(qs),
            similarity_method=SimilarityMethod.EXACT,
            confidence=1.0,
        )
        db.add(group)
        db.flush()
        for q in qs:
            member = QuestionGroupMember(
                question_id=q.id,
                group_id=group.id,
                similarity_score=1.0,
                is_exact_match=True,
            )
            db.add(member)
            grouped_ids.add(q.id)
        new_groups += 1

    db.commit()
    return new_groups


def group_similar(db: Session, subject: str, threshold: float = 0.65) -> int:
    """TF-IDF based similar-question grouping. Returns new group count."""
    questions = (
        db.query(Question)
        .filter(Question.subject == subject)
        .all()
    )

    grouped_ids = set(
        m.question_id
        for m in db.query(QuestionGroupMember.question_id).all()
    )

    ungrouped = [q for q in questions if q.id not in grouped_ids and len(q.normalized_question_text) >= 10]
    if len(ungrouped) < 2:
        return 0

    texts = [q.normalized_question_text for q in ungrouped]
    vec, mat = _build_tfidf_matrix(texts)
    if mat is None:
        return 0

    sim = _cosine_sim_matrix(mat)

    parent = list(range(len(ungrouped)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(len(ungrouped)):
        for j in range(i + 1, len(ungrouped)):
            if sim[i][j] >= threshold:
                union(i, j)

    clusters = defaultdict(list)
    for i in range(len(ungrouped)):
        clusters[find(i)].append(i)

    new_groups = 0
    for members in clusters.values():
        if len(members) < 2:
            continue
        qs = [ungrouped[i] for i in members]
        group = QuestionGroup(
            representative_text=qs[0].original_question_text,
            normalized_text=qs[0].normalized_question_text,
            subject=subject,
            frequency=len(qs),
            similarity_method=SimilarityMethod.TFIDF,
            confidence=threshold,
        )
        db.add(group)
        db.flush()
        for q in qs:
            member = QuestionGroupMember(
                question_id=q.id,
                group_id=group.id,
                similarity_score=1.0,
                is_exact_match=False,
            )
            db.add(member)
            grouped_ids.add(q.id)
        new_groups += 1

    db.commit()
    return new_groups


def run_analysis(db: Session, analysis_id: int) -> None:
    """Run the full analysis pipeline for a given AnalysisResult record."""
    ar = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_id).first()
    if not ar:
        return

    try:
        ar.status = AnalysisStatus.EXTRACTING
        db.commit()

        total_extracted = 0
        for pid in ar.paper_ids:
            paper = db.query(Paper).filter(Paper.id == pid).first()
            if paper:
                count = extract_and_store(db, paper)
                total_extracted += count

        ar.questions_extracted = total_extracted
        ar.status = AnalysisStatus.ANALYZING
        db.commit()

        subjects = (
            db.query(Question.subject)
            .filter(Question.paper_id.in_(ar.paper_ids))
            .distinct()
            .all()
        )

        total_groups = 0
        for (subj,) in subjects:
            if not subj:
                continue
            total_groups += group_exact(db, subj)
            total_groups += group_similar(db, subj)

        ar.repeated_groups = total_groups
        ar.exact_matches = (
            db.query(QuestionGroup)
            .filter(
                QuestionGroup.subject.in_([s for (s,) in subjects]),
                QuestionGroup.similarity_method == SimilarityMethod.EXACT,
            ).count()
        )
        ar.similar_matches = total_groups - ar.exact_matches
        ar.status = AnalysisStatus.COMPLETED
        db.commit()

    except Exception as e:
        logger.exception(f"Analysis {analysis_id} failed")
        ar.status = AnalysisStatus.FAILED
        ar.error_message = str(e)
        db.commit()
