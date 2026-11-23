"""Public search across papers and their extracted questions.

Replaces the old question-only endpoint (`ILIKE`, `LIMIT 50`, insertion order)
with one entry point that:

- returns **papers** as first-class results, not just question text;
- **ranks** results (title/subject matches beat incidental body matches, and
  repeated questions get a small boost);
- returns a **snippet** with the matched words in context;
- links every result back to **its paper** in the PYQ Hub;
- **logs zero-result queries** so the library's gaps are known.

Scoring runs in Python over a bounded candidate set (`CANDIDATE_CAP`). That is
deliberate: ILIKE prefiltering keeps the row count small, and Python keeps the
ranking identical on SQLite and Postgres without a full-text-search migration.
"""

import json
import logging
import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.limiter import limiter, RATE_LIMITED
from app.models.paper import Paper, PaperStatus
from app.models.question import Question, QuestionGroup, QuestionGroupMember

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])

CANDIDATE_CAP = 400
MAX_RESULTS = 25
SNIPPET_WIDTH = 170

# Zero-result queries land here, one JSON object per line. Same logs/
# convention as support intake; the admin endpoint below aggregates the file.
ZERO_LOG_PATH = Path("logs") / "search_zero_results.jsonl"

# Same query retried (typing, double submit, refresh) is recorded once per
# window rather than flooding the log.
_DEDUPE_WINDOW_SECONDS = 60
_recent_zero: dict = {}


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFKC", value or "").lower()
    return re.sub(r"\s+", " ", text).strip()


def _split_terms(query: str):
    """Query -> (text terms, year filter). A bare 4-digit year is a filter.

    Students type "dbms 2023"; treating the year as a substring match would
    find nothing, since years live in their own column.
    """
    terms, year = [], None
    for token in _normalize(query).split(" "):
        if not token:
            continue
        if token.isdigit() and len(token) == 4 and 2000 <= int(token) <= 2030:
            year = int(token)
            continue
        terms.append(token)
    return terms, year


def _snippet(text: str, terms: List[str], width: int = SNIPPET_WIDTH) -> str:
    """A window of `text` around the first matching term."""
    if not text:
        return ""
    plain = re.sub(r"\s+", " ", text).strip()
    low = plain.lower()
    positions = [low.find(term) for term in terms if term and low.find(term) >= 0]
    if not positions:
        return plain[:width].rstrip() + ("…" if len(plain) > width else "")
    start = max(0, min(positions) - width // 3)
    end = min(len(plain), start + width)
    snippet = plain[start:end].strip()
    if start > 0:
        snippet = "…" + snippet
    if end < len(plain):
        snippet = snippet + "…"
    return snippet


def _paper_haystack(paper: Paper) -> str:
    parts = [
        paper.title, paper.subject, paper.university, paper.stream,
        paper.specialization, paper.semester, str(paper.year or ""),
    ]
    if isinstance(paper.tags, list):
        parts.extend(str(tag) for tag in paper.tags)
    return _normalize(" ".join(p for p in parts if p))


def _paper_href(paper: Optional[Paper]) -> str:
    """Link to this paper's own page.

    Every paper has a stable, indexable URL (`/paper/:id`), so results point at
    the paper itself instead of a filtered PYQ Hub view that can hold several.
    """
    if paper is not None and paper.id:
        return f"/paper/{paper.id}"
    return "/pyq"


def _score_paper(paper: Paper, phrase: str, terms: List[str]) -> float:
    title = _normalize(paper.title)
    subject = _normalize(paper.subject)
    haystack = _paper_haystack(paper)
    if not haystack:
        return 0.0

    score = 0.0
    if phrase:
        if title == phrase:
            score += 120
        elif title.startswith(phrase):
            score += 80
        elif phrase in title:
            score += 55
        if subject == phrase:
            score += 60
        elif subject.startswith(phrase):
            score += 40
        elif phrase in subject:
            score += 28
        elif phrase in haystack:
            score += 14
    for term in terms:
        if term in title:
            score += 8
        elif term in subject:
            score += 5
        elif term in haystack:
            score += 3
        else:
            score -= 6  # one term missing: still relevant, but weaker
    if terms and all(term in haystack for term in terms):
        score += 10
    # Slightly prefer newer papers when relevance ties.
    if paper.year:
        score += min(6.0, max(0.0, (paper.year - 2000) / 5))
    return score


def _score_question(question: Question, paper: Optional[Paper], phrase: str,
                    terms: List[str], frequency: int) -> float:
    text = _normalize(question.normalized_question_text or question.question_text)
    subject = _normalize(question.subject or (paper.subject if paper else ""))
    score = 0.0
    if phrase:
        if phrase in text:
            score += 55
        if subject == phrase:
            score += 30
        elif phrase in subject:
            score += 14
    for term in terms:
        hits = text.count(term)
        if hits:
            score += 10 + min(5, hits - 1) * 2
        elif term in subject:
            score += 8
        else:
            score -= 6
    # A question asked across several papers is worth surfacing.
    score += min(12.0, frequency * 3)
    if paper and paper.year:
        score += min(4.0, max(0.0, (paper.year - 2000) / 8))
    return score


def _record_zero_result(query: str, took_ms: int) -> None:
    """Append a zero-result query, deduped within a short window."""
    key = _normalize(query)
    now = time.time()
    if len(_recent_zero) > 500:
        _recent_zero.clear()
    last = _recent_zero.get(key)
    if last is not None and now - last < _DEDUPE_WINDOW_SECONDS:
        return
    _recent_zero[key] = now
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "query": (query or "").strip()[:200],
        "took_ms": took_ms,
    }
    try:
        ZERO_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(ZERO_LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as exc:
        # Never fail a search because the log file is unwritable.
        logger.warning("Could not record zero-result query: %s", exc)


def read_zero_result_log(limit: int = 20, max_lines: int = 5000) -> dict:
    """Aggregate the zero-result log: [{query, count, last_seen}]."""
    if not ZERO_LOG_PATH.exists():
        return {"total_zero_result_searches": 0, "queries": []}
    try:
        with open(ZERO_LOG_PATH, "r", encoding="utf-8") as handle:
            lines = handle.readlines()[-max_lines:]
    except OSError as exc:
        logger.warning("Could not read zero-result log: %s", exc)
        return {"total_zero_result_searches": 0, "queries": []}

    aggregated: dict = {}
    total = 0
    for line in lines:
        try:
            record = json.loads(line)
        except (ValueError, TypeError):
            continue
        query = (record.get("query") or "").strip()
        if not query:
            continue
        total += 1
        key = _normalize(query)
        entry = aggregated.setdefault(key, {"query": query, "count": 0, "last_seen": None})
        entry["count"] += 1
        entry["last_seen"] = record.get("ts") or entry["last_seen"]

    ordered = sorted(aggregated.values(), key=lambda x: (-x["count"], x["query"]))
    return {"total_zero_result_searches": total, "queries": ordered[:limit]}


@router.get("", responses=RATE_LIMITED)
@limiter.limit("60/minute")
async def search(
    request: Request,
    q: str = Query("", max_length=200, description="Search text, e.g. 'dbms 2023'"),
    limit: int = Query(MAX_RESULTS, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Ranked paper + question results for one query."""
    started = time.perf_counter()
    query = (q or "").strip()
    terms, year = _split_terms(query)
    phrase = " ".join(terms)

    empty = {"query": query, "terms": terms, "papers": [], "questions": []}
    if not terms and year is None:
        return {**empty, "took_ms": 0}
    if not terms:
        # A lone year is a valid filter ("2023") but not a text search.
        phrase = str(year)

    # ---- papers ----------------------------------------------------------
    paper_conditions = [Paper.status == PaperStatus.APPROVED]
    if year is not None:
        paper_conditions.append(Paper.year == year)
    for term in terms:
        like = f"%{term}%"
        paper_conditions.append(or_(
            Paper.title.ilike(like),
            Paper.subject.ilike(like),
            Paper.university.ilike(like),
            Paper.stream.ilike(like),
            Paper.specialization.ilike(like),
            Paper.semester.ilike(like),
        ))
    paper_rows = (await db.execute(
        select(Paper).where(*paper_conditions).limit(CANDIDATE_CAP)
    )).scalars().all()

    scored_papers = []
    for paper in paper_rows:
        score = _score_paper(paper, phrase, terms)
        if score <= 0:
            continue
        scored_papers.append((score, paper))
    scored_papers.sort(key=lambda item: (-item[0], -(item[1].year or 0), item[1].id))

    papers_out = []
    for score, paper in scored_papers[:limit]:
        papers_out.append({
            "id": paper.id,
            "title": paper.title,
            "snippet": _snippet(paper.extracted_text or paper.description or
                                _paper_haystack(paper), terms),
            "subject": paper.subject,
            "stream": paper.stream,
            "specialization": paper.specialization,
            "semester": paper.semester,
            "year": paper.year,
            "exam_type": paper.exam_type.value if paper.exam_type else None,
            "file_size": paper.file_size,
            "href": _paper_href(paper),
            "score": round(score, 1),
        })

    # ---- questions -------------------------------------------------------
    question_conditions = [Paper.status == PaperStatus.APPROVED]
    if year is not None:
        question_conditions.append(Paper.year == year)
    for term in terms:
        like = f"%{term}%"
        question_conditions.append(or_(
            Question.normalized_question_text.ilike(like),
            Question.subject.ilike(like),
            Question.topic.ilike(like),
            Paper.subject.ilike(like),
        ))
    question_rows = (await db.execute(
        select(Question, Paper)
        .join(Paper, Question.paper_id == Paper.id)
        .where(*question_conditions)
        .limit(CANDIDATE_CAP)
    )).all()

    frequencies: dict = {}
    question_ids = [question.id for question, _paper in question_rows]
    if question_ids:
        member_rows = (await db.execute(
            select(QuestionGroupMember.question_id, QuestionGroup.frequency)
            .join(QuestionGroup, QuestionGroupMember.group_id == QuestionGroup.id)
            .where(QuestionGroupMember.question_id.in_(question_ids))
        )).all()
        for question_id, frequency in member_rows:
            frequencies[question_id] = max(frequencies.get(question_id, 0), frequency or 0)

    scored_questions = []
    for question, paper in question_rows:
        score = _score_question(question, paper, phrase, terms,
                                frequencies.get(question.id, 0))
        if score > 0:
            scored_questions.append((score, question, paper))
    scored_questions.sort(key=lambda item: (-item[0], -(item[2].year or 0), item[1].id))

    questions_out = []
    for score, question, paper in scored_questions[:limit]:
        text = question.original_question_text or question.question_text or ""
        questions_out.append({
            "id": question.id,
            "text": text[:600],
            "snippet": _snippet(text, terms),
            "subject": question.subject or (paper.subject if paper else None),
            "topic": question.topic,
            "marks": question.marks,
            "question_type": question.question_type,
            "frequency": frequencies.get(question.id, 1),
            "has_answer": bool(question.answer_type),
            "paper_id": paper.id if paper else question.paper_id,
            "paper_title": paper.title if paper else None,
            "paper_year": paper.year if paper else None,
            "href": _paper_href(paper) if paper else "/pyq",
            "analyze_href": f"/analyze?papers={question.paper_id}",
            "score": round(score, 1),
        })

    took_ms = int((time.perf_counter() - started) * 1000)
    if not papers_out and not questions_out:
        _record_zero_result(query, took_ms)

    return {
        "query": query,
        "terms": terms,
        "year": year,
        "took_ms": took_ms,
        "papers": papers_out,
        "questions": questions_out,
        "counts": {
            "papers": len(scored_papers),
            "questions": len(scored_questions),
            "shown_papers": len(papers_out),
            "shown_questions": len(questions_out),
        },
    }
