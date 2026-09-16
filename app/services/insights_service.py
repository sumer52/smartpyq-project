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

# Historical priority tiers (spec sections 8/11/14/15). Purely evidence-based:
# derived from how many of the analyzed papers a question/topic appeared in,
# how often, and question weight where available. NEVER prediction-guarantee
# language — the UI must present these as "historical PYQ recurrence".
PRIORITY_LABELS = {
    "A": "Must Prepare",
    "B": "High Priority",
    "C": "Practice",
    "D": "Low Frequency",
}


def history_priority(papers_ratio: float, frequency: int) -> str:
    """A/B/C/D historical priority from recurrence evidence."""
    if papers_ratio >= 0.75:
        return "A"
    if papers_ratio >= 0.5 or frequency >= 3:
        return "B"
    if papers_ratio >= 0.25 or frequency >= 2:
        return "C"
    return "D"


def topic_tier(papers_ratio: float, question_count: int) -> Optional[str]:
    """very_high/high/medium topic tier from evidence; None = low/no claim."""
    if papers_ratio >= 0.75 and question_count >= 3:
        return "very_high"
    if papers_ratio >= 0.5 or question_count >= 4:
        return "high"
    if papers_ratio >= 0.25 or question_count >= 2:
        return "medium"
    return None


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

    # Unique questions = distinct normalized texts (spec section 6).
    unique_questions = len({
        (q.normalized_question_text or "").strip().lower()
        for q in q_rows if (q.normalized_question_text or "").strip()
    })

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
        priority = history_priority(ratio, len(members))
        repeated.append({
            "group_id": gid,
            "representative_text": grp.representative_text if grp is not None else members[0][1].question_text,
            "topic": grp.topic if grp is not None else None,
            "similarity": label,
            "frequency": len(members),
            "papers_count": len(paper_ids_hit),
            "importance": _importance(ratio),
            "priority": priority,
            "priority_label": PRIORITY_LABELS[priority],
            "confidence": _confidence_label(ratio),
            "occurrences": occurrences,
        })
    repeated.sort(key=lambda r: (-r["papers_count"], -r["frequency"]))

    # ---- question frequency table (spec section 8) -------------------------
    # Every question that appears in the analyzed papers, with its recurrence
    # evidence: frequency, years asked, historical priority. Groups carry
    # combined frequency; ungrouped questions appear once at frequency 1.
    member_question_ids = {q.id for _, q in member_rows}
    frequency_table = []
    grouped_papers_ratio = {}
    for gid, members in groups.items():
        paper_ids_hit = {q.paper_id for _, q in members}
        ratio = len(paper_ids_hit) / max(1, len(paper_ids))
        grp = group_by_id.get(gid)
        years = sorted({paper_by_id[q.paper_id].year for _, q in members
                        if paper_by_id.get(q.paper_id) and paper_by_id[q.paper_id].year})
        priority = history_priority(ratio, len(members))
        grouped_papers_ratio[gid] = ratio
        frequency_table.append({
            "question": grp.representative_text if grp is not None else members[0][1].question_text,
            "frequency": len(members),
            "years": years,
            "priority": priority,
            "priority_label": PRIORITY_LABELS[priority],
            "topic": grp.topic if grp is not None else None,
            "question_ids": [q.id for _, q in members],
            "similarity": grp.similarity_method.value if grp is not None and grp.similarity_method else "tfidf",
        })
    for q in q_rows:
        if q.id in member_question_ids:
            continue
        p = paper_by_id.get(q.paper_id)
        frequency_table.append({
            "question": q.original_question_text or q.question_text,
            "frequency": 1,
            "years": [p.year] if p and p.year else [],
            "priority": "D",
            "priority_label": PRIORITY_LABELS["D"],
            "topic": q.topic,
            "question_ids": [q.id],
            "similarity": None,
        })
    frequency_table.sort(key=lambda r: (-r["frequency"], r["priority"]))

    # High-priority questions = questions belonging to repeated groups whose
    # historical priority is A or B (0 when no group data exists).
    high_priority_count = sum(
        len(members) for gid, members in groups.items()
        if grouped_papers_ratio.get(gid, 0) >= 0.5
    )

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
                "tier": topic_tier(ratio, topic_counts[topic]),
            })
        predictions.sort(key=lambda p: (-p["papers_count"], -p["question_count"]))

    # ---- topic priority tiers (spec section 9) -----------------------------
    # Every detected topic with its evidence; tier is None when the evidence
    # does not justify an "important" claim.
    topic_tiers = []
    for entry in topics_ranked:
        t = entry["topic"]
        pids = topic_paper_hits.get(t, set())
        ratio = len(pids) / max(1, len(paper_ids))
        topic_tiers.append({
            **entry,
            "papers_count": len(pids),
            "papers_ratio": round(ratio, 2),
            "tier": topic_tier(ratio, entry["count"]),
        })

    # ---- marks / weightage per topic (spec section 13) ---------------------
    # Only emitted when questions actually carry marks; otherwise the whole
    # section is absent from the payload.
    topic_marks = defaultdict(list)
    for q in q_rows:
        if q.topic and q.marks is not None:
            topic_marks[q.topic].append(q.marks)
    marks_weightage = None
    if topic_marks:
        marks_weightage = []
        for topic, marks_list in topic_marks.items():
            marks_weightage.append({
                "topic": topic,
                "appearances": len(marks_list),
                "total_marks": sum(marks_list),
                "average_marks": round(sum(marks_list) / len(marks_list), 1),
                "max_marks": max(marks_list),
            })
        marks_weightage.sort(key=lambda m: (-m["average_marks"], -m["appearances"]))

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
        "unique_questions": unique_questions,
        "high_priority_count": high_priority_count,
        "topics_detected": topics_detected,
        "topics": topics_ranked,
        "topic_tiers": topic_tiers,
        "most_important_topic": topics_ranked[0]["topic"] if topics_ranked else None,
        "question_types": [{"type": t, "count": c} for t, c in type_counts.most_common()],
        "marks_distribution": [{"marks": m, "count": c} for m, c in sorted(marks_dist.items(), key=lambda kv: (kv[0] is None, kv[0]))],
        "marks_weightage": marks_weightage,
        "sections": [{"section": s, "count": c} for s, c in sorted(section_counts.items())],
        "repeated_questions": repeated,
        "repeated_count": len(repeated),
        "frequency_table": frequency_table,
        "year_wise": year_wise,
        "predictions": predictions,
        "paper_info": paper_info,
        # Honest single-paper message per spec section 16
        "single_paper_note": None if multi_paper else "Upload multiple previous-year papers to unlock repetition and trend analysis.",
    }
