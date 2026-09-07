"""Analysis insights: aggregates extracted questions into dashboard data.

Everything here is computed from rows actually stored in the database —
no invented statistics. Fields that cannot be computed are null/empty and
the frontend shows them as such.
"""

import logging
from collections import Counter, defaultdict
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper import Paper
from app.models.question import Question, QuestionGroup, QuestionGroupMember

logger = logging.getLogger(__name__)

# A question group is a "repeat" when its members come from >=2 papers.
IMPORTANCE_TIERS = [
    (0.75, "very high"),
    (0.5, "high"),
    (0.25, "medium"),
    (0.0, "low"),
]


def _importance(score: float) -> str:
    for threshold, label in IMPORTANCE_TIERS:
        if score >= threshold:
            return label
    return "low"


def _confidence_label(papers_ratio: float) -> str:
    if papers_ratio >= 0.75:
        return "High"
    if papers_ratio >= 0.5:
        return "Medium-High"
    if papers_ratio >= 0.25:
        return "Medium"
    return "Low"


async def build_insights(db: AsyncSession, paper_ids: List[int], analysis_id: Optional[int] = None) -> Dict:
    """Aggregate analysis data for the given papers into dashboard JSON."""
    q_rows = (await db.execute(
        select(Question).filter(Question.paper_id.in_(paper_ids))
    )).scalars().all()
    papers = (await db.execute(
        select(Paper).filter(Paper.id.in_(paper_ids))
    )).scalars().all()
    paper_by_id = {p.id: p for p in papers}

    total_questions = len(q_rows)

    # ---- question type & marks distribution -------------------------------
    type_counts = Counter(q.question_type or "unclassified" for q in q_rows)
    marks_dist = Counter(q.marks for q in q_rows if q.marks is not None)

    # ---- topic frequency ---------------------------------------------------
    topic_counts = Counter(q.topic for q in q_rows if q.topic)
    topics_ranked = [
        {"topic": t, "count": c,
         "share": round(100.0 * c / total_questions, 1) if total_questions else 0.0}
        for t, c in topic_counts.most_common()
    ]
    topics_detected = sum(1 for q in q_rows if q.topic)

    # ---- per-paper (year-wise) breakdown ----------------------------------
    per_paper = {}
    for pid, p in paper_by_id.items():
        per_paper[pid] = {
            "paper_id": pid,
            "title": p.title,
            "year": p.year,
            "subject": p.subject,
            "question_count": 0,
            "topics": Counter(),
        }
    for q in q_rows:
        entry = per_paper.get(q.paper_id)
        if entry is None:
            continue
        entry["question_count"] += 1
        if q.topic:
            entry["topics"][q.topic] += 1
    year_wise = []
    for entry in per_paper.values():
        year_wise.append({
            "paper_id": entry["paper_id"],
            "title": entry["title"],
            "year": entry["year"],
            "question_count": entry["question_count"],
            "major_topics": [{"topic": t, "count": c} for t, c in entry["topics"].most_common(5)],
        })
    year_wise.sort(key=lambda x: (x["year"] is None, x["year"] or 0))

    # ---- repeated questions ------------------------------------------------
    member_rows = (await db.execute(
        select(QuestionGroupMember, Question)
        .join(Question, QuestionGroupMember.question_id == Question.id)
        .filter(Question.paper_id.in_(paper_ids))
    )).all()

    # group_id -> members in the analyzed papers
    groups: Dict[int, List] = defaultdict(list)
    for member, question in member_rows:
        groups[member.group_id].append((member, question))

    group_rows = (await db.execute(
        select(QuestionGroup).filter(QuestionGroup.id.in_(list(groups.keys()) or [0]))
    )).scalars().all()
    group_by_id = {g.id: g for g in group_rows}

    repeated = []
    for gid, members in groups.items():
        paper_ids_hit = {q.paper_id for _, q in members}
        if len(paper_ids_hit) < 2:
            continue  # single-paper occurrence is not a repeat
        grp = group_by_id.get(gid)
        method = grp.similarity_method.value if grp is not None and grp.similarity_method else "tfidf"
        label = {"exact": "Exactly repeated", "tfidf": "Similar question", "semantic": "Same concept"}.get(method, method)
        occurrences = []
        for member, q in members:
            p = paper_by_id.get(q.paper_id)
            occurrences.append({
                "year": p.year if p else None,
                "paper_title": p.title if p else None,
                "question_text": q.original_question_text or q.question_text,
            })
        occurrences.sort(key=lambda o: (o["year"] is None, o["year"] or 0))
        ratio = len(paper_ids_hit) / max(1, len(paper_ids))
        repeated.append({
            "group_id": gid,
            "representative_text": grp.representative_text if grp is not None else members[0][1].question_text,
            "topic": grp.topic if grp is not None else None,
            "similarity": label,
            "frequency": len(members),
            "papers_count": len(paper_ids_hit),
            "importance": _importance(ratio),
            "confidence": _confidence_label(ratio),
            "occurrences": occurrences,
        })
    repeated.sort(key=lambda r: (-r["papers_count"], -r["frequency"]))

    # ---- predictions ---------------------------------------------------------
    # Topics ranked by how many distinct papers they appear in. Only shown when
    # multiple papers were analyzed — repetition claims need >=2 papers.
    topic_paper_hits = defaultdict(set)
    for q in q_rows:
        if q.topic:
            topic_paper_hits[q.topic].add(q.paper_id)
    multi_paper = len(paper_ids) >= 2
    predictions = []
    if multi_paper:
        for topic, pids in topic_paper_hits.items():
            ratio = len(pids) / max(1, len(paper_ids))
            if len(pids) < 2:
                continue
            predictions.append({
                "topic": topic,
                "papers_count": len(pids),
                "papers_ratio": round(ratio, 2),
                "confidence": _confidence_label(ratio),
                "question_count": topic_counts[topic],
            })
        predictions.sort(key=lambda p: (-p["papers_count"], -p["question_count"]))

    # ---- sections breakdown ---------------------------------------------------
    section_counts = Counter(q.section for q in q_rows if q.section)

    # ---- paper info (detected metadata comes from the paper records) ---------
    paper_info = []
    for p in papers:
        paper_info.append({
            "paper_id": p.id,
            "title": p.title,
            "subject": p.subject,
            "university": p.university or None,
            "year": p.year,
            "semester": p.semester or None,
            "exam_type": p.exam_type.value if p.exam_type else None,
        })

    return {
        "analysis_id": analysis_id,
        "papers_analyzed": len(paper_ids),
        "multi_paper": multi_paper,
        "total_questions": total_questions,
        "topics_detected": topics_detected,
        "topics": topics_ranked,
        "most_important_topic": topics_ranked[0]["topic"] if topics_ranked else None,
        "question_types": [{"type": t, "count": c} for t, c in type_counts.most_common()],
        "marks_distribution": [{"marks": m, "count": c} for m, c in sorted(marks_dist.items(), key=lambda kv: (kv[0] is None, kv[0]))],
        "sections": [{"section": s, "count": c} for s, c in sorted(section_counts.items())],
        "repeated_questions": repeated,
        "repeated_count": len(repeated),
        "year_wise": year_wise,
        "predictions": predictions,
        "paper_info": paper_info,
        # Honest single-paper message per spec section 16
        "single_paper_note": None if multi_paper else "Upload multiple previous-year papers to unlock repetition and trend analysis.",
    }
