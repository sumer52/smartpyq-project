#!/usr/bin/env python3
"""Seed demo teacher answers for Exam Practice Mode (idempotent).

For each approved demo paper (see seed_demo_papers): extract questions via the
normal analysis pipeline, then attach one answer per format to the first three
questions:
  - text  -> formatted multi-paragraph answer
  - image -> generated PNG "handwritten-style" answer sheet
  - pdf   -> generated PDF model answer

Files are written through app.utils.answer_storage so storage keys match the
production serving path. Requires ENABLE_DEMO_ACCOUNT=1. Run:
    python -m app.scripts.seed_demo_answers
"""

import asyncio
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.config import settings, demo_account_enabled
from app.models.paper import Paper, PaperStatus
from app.models.question import Question
from app.models.user import User
from app.utils import answer_storage

TENANT_ID = 1
SUBJECT = "Computer Science"
SEMESTER = "sem5"

TEXT_ANSWER = """**Normalization** is the process of organizing data in a database to
reduce redundancy and improve integrity.

**Why we normalize:**
- Eliminate duplicate data (update anomalies)
- Ensure logical data dependencies
- Simplify queries and maintenance

**Key normal forms:**
1. **1NF** — atomic values, no repeating groups
2. **2NF** — 1NF + no partial dependency on a composite key
3. **3NF** — 2NF + no transitive dependency
4. **BCNF** — every determinant is a candidate key

*Example:* splitting `student(course, dept_name, dept_head)` into
`student(course, dept_id)` and `department(dept_id, dept_name, dept_head)`
removes the transitive dependency `course -> dept_id -> dept_head`.
"""

IMAGE_ANSWER_TEXT = """Q: Define DBMS and list its advantages.

ANSWER

A DBMS (Database Management System) is software that lets users
define, create, store and control access to data.

Advantages:
 1. Data independence
 2. Controlled redundancy & consistency
 3. Security (views, grants)
 4. Integrity constraints
 5. Concurrent access & crash recovery
"""

PDF_ANSWER_TEXT = """Q: What is a transaction? Explain ACID properties.

Answer

A transaction is a logical unit of work (one or more operations)
that must execute atomically against the database.

ACID properties:
- Atomicity: all operations commit, or none do (undo log).
- Consistency: the DB moves from one valid state to another.
- Isolation: concurrent transactions do not observe partial work.
- Durability: once committed, changes survive crashes (WAL/redo).

Example: transferring Rs.500 between accounts is one transaction —
the debit and credit commit together or not at all.
"""


def _make_png(text: str, path: str) -> None:
    """Render an 'answer sheet' style image (PNG) with PyMuPDF."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    y = 70
    for line in text.splitlines():
        page.insert_text((60, y), line, fontsize=13, fontname="cour")
        y += 20
    pix = page.get_pixmap(dpi=110)
    pix.save(path)
    doc.close()


def _make_pdf(text: str, path: str) -> None:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    y = 70
    for line in text.splitlines():
        page.insert_text((60, y), line, fontsize=12, fontname="helv")
        y += 18
    doc.save(path)
    doc.close()


async def _extract_questions_if_needed(db, paper, user_id: int) -> None:
    existing = (await db.execute(
        select(Question).filter(Question.paper_id == paper.id).limit(1)
    )).scalar_one_or_none()
    if existing:
        return
    print(f"[..] Extracting questions for paper {paper.id} ({paper.title})")
    from app.services.analysis_service import run_analysis_for_papers
    await run_analysis_for_papers(db, [paper.id], user_id=user_id)


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(
            select(User).filter(User.email == "admin@smartpyq.com")
        )).scalar_one_or_none()
        if admin is None:
            print("[SKIP] admin@smartpyq.com not found — run seed_demo_user first")
            return

        papers = (await db.execute(
            select(Paper).filter(
                Paper.tenant_id == TENANT_ID,
                Paper.subject == SUBJECT,
                Paper.semester == SEMESTER,
                Paper.status == PaperStatus.APPROVED,
            ).order_by(Paper.year)
        )).scalars().all()
        if not papers:
            print("[SKIP] No approved demo papers — run seed_demo_papers first")
            return

        formats = ("text", "image", "pdf")
        answers_set = 0
        for paper in papers:
            await _extract_questions_if_needed(db, paper, user_id=admin.id)
            questions = (await db.execute(
                select(Question)
                .filter(Question.paper_id == paper.id)
                .order_by(Question.question_number, Question.id)
                .limit(len(formats))
            )).scalars().all()

            for q, fmt in zip(questions, formats):
                if q.answer_type == fmt:
                    continue
                if fmt == "text":
                    q.answer_type = "text"
                    q.answer_text = TEXT_ANSWER
                    q.answer_file_url = q.answer_file_name = None
                    q.answer_file_size = q.answer_file_mime = None
                else:
                    os.makedirs(settings.LOCAL_STORAGE_PATH or "./storage", exist_ok=True)
                    data = b""
                    if fmt == "image":
                        tmp = os.path.join(settings.LOCAL_STORAGE_PATH or "./storage", "_demo_answer.png")
                        _make_png(IMAGE_ANSWER_TEXT, tmp)
                        with open(tmp, "rb") as f:
                            data = f.read()
                        os.remove(tmp)
                        ext, mime = ".png", "image/png"
                    else:
                        tmp = os.path.join(settings.LOCAL_STORAGE_PATH or "./storage", "_demo_answer.pdf")
                        _make_pdf(PDF_ANSWER_TEXT, tmp)
                        with open(tmp, "rb") as f:
                            data = f.read()
                        os.remove(tmp)
                        ext, mime = ".pdf", "application/pdf"

                    key = answer_storage.save_answer_file(q.id, data, ext)
                    q.answer_type = fmt
                    q.answer_text = None
                    q.answer_file_url = key
                    q.answer_file_name = f"demo_answer_{q.id}{ext}"
                    q.answer_file_size = len(data)
                    q.answer_file_mime = mime
                q.answer_updated_at = datetime.utcnow()
                q.answer_updated_by = admin.id
                answers_set += 1
        await db.commit()
        print(f"[OK] Demo answers ready ({answers_set} attached/updated).")


async def main() -> None:
    if not demo_account_enabled():
        print("[SKIP] Demo account disabled (ENABLE_DEMO_ACCOUNT) - seed skipped")
        return
    try:
        await seed()
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Demo answer seed failed")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
