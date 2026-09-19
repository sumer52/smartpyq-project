#!/usr/bin/env python3
"""Seed demo PYQ papers following the standard university paper pattern.

Pattern (applies to every subject):
    PART A — 8 short questions × 4 marks = 32 marks
    PART B — 6 long questions  × 8 marks = 48 marks
    Total: 80 marks

Creates three approved demo papers (2023 / 2024 / 2025) for Computer Science,
generating a matching PDF for each. Idempotent — existing papers are skipped.
Requires an admin user to exist (seed_demo_user creates one). Run:
    python -m app.scripts.seed_demo_papers
"""

import asyncio
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.models.paper import Paper, PaperStatus, ExamType
from app.models.user import User, UserRole

TENANT_ID = 1

STREAM = "B.Sc"
SPECIALIZATION = "MSCS"
COURSE = "B.Sc Computer Science"
SUBJECT = "Computer Science"
UNIVERSITY = "Osmania University"
SEMESTER = "sem5"
YEAR_LABELS = {2023: "2022-23", 2024: "2023-24", 2025: "2024-25"}

# Standard university question-paper pattern:
#   PART A — 8 short questions × 4 marks = 32 marks
#   PART B — 6 long questions  × 8 marks = 48 marks
#   Total: 80 marks
PART_A_COUNT, PART_A_MARKS = 8, 4
PART_B_COUNT, PART_B_MARKS = 6, 8
MAX_MARKS = PART_A_COUNT * PART_A_MARKS + PART_B_COUNT * PART_B_MARKS  # 80

# (text, repeated_in, variant_of) — marks come from the part the question sits in.
# Part A = questions 1-8 (4 marks each), Part B = questions 9-14 (8 marks each).
# repeated_in: which years carry the question VERBATIM.
# variant_of: a reworded twin of the same concept (TF-IDF should group).
PAPER_QUESTIONS = {
    2023: [
        # ── PART A (short answers, 4 marks each) ──
        ("Define DBMS and list its advantages.", [2023, 2024, 2025], None),
        ("Differentiate between primary key and foreign key.", [2023, 2025], None),
        ("What is data redundancy? How can it be reduced?", [2023], None),
        ("List the ACID properties of a transaction.", [2023, 2024], None),
        ("Define candidate key with an example.", [2024, 2025], None),
        ("What is a view in SQL?", [2023, 2024], None),
        ("What is data independence?", [2023], None),
        ("Define schema and instance.", [2023], None),
        # ── PART B (long answers, 12 marks each) ──
        ("Explain normalization in DBMS with suitable examples.", [2023, 2024, 2025], None),
        ("What is a transaction? Explain ACID properties with examples.", [2023, 2024, 2025], None),
        ("Explain ER diagram design with an example.", [2023, 2025], None),
        ("Write SQL queries to create, insert and join tables.", [2023, 2024], None),
        ("Describe the three-level architecture of a database system.", [2023], None),
        ("Explain file organization methods used in DBMS.", [2023], None),
    ],
    2024: [
        # ── PART A ──
        ("Define DBMS and list its advantages.", [2023, 2024, 2025], None),
        ("What is data independence? Explain its types.", [2024], None),
        ("List the ACID properties of a transaction.", [2023, 2024], None),
        ("Define candidate key with an example.", [2024, 2025], None),
        ("What is a view in SQL?", [2023, 2024], None),
        ("Define indexing. How does it differ from hashing?", [2024, 2025], None),
        ("What is a join? Name its types.", [2024], None),
        ("Differentiate between DELETE and TRUNCATE.", [2024], None),
        # ── PART B ──
        ("Explain normalization in DBMS with suitable examples.", [2023, 2024, 2025], None),
        ("What is a transaction? Explain ACID properties with examples.", [2023, 2024, 2025], None),
        ("Write SQL queries to create, insert and join tables.", [2023, 2024], None),
        ("Explain indexing in databases and when it improves query performance.", [2024, 2025], None),
        ("Explain the three-level architecture of a DBMS with a diagram.", [2024], None),
        ("Compare hierarchical, network and relational data models.", [2024], None),
    ],
    2025: [
        # ── PART A ──
        ("Define DBMS and list its advantages.", [2023, 2024, 2025], None),
        ("Differentiate between primary key and foreign key.", [2023, 2025], None),
        ("What is a weak entity? Give an example.", [2025], None),
        ("Define candidate key with an example.", [2024, 2025], None),
        ("What is denormalization and when is it used?", [2025], None),
        ("Define indexing. How does it differ from hashing?", [2024, 2025], None),
        ("What is a trigger in SQL?", [2025], None),
        ("Define DDL and DML with one command each.", [2025], None),
        # ── PART B ──
        # Reworded twin of the normalization question (semantic grouping test)
        ("Discuss the concept of normalization and the various normal forms in a database.", [2025], "normalization"),
        ("What is a transaction? Explain ACID properties with examples.", [2023, 2024, 2025], None),
        ("Explain ER diagram design with an example.", [2023, 2025], None),
        ("Explain indexing in databases and its impact on query performance.", [2024, 2025], None),
        ("Explain the responsibilities of a database administrator.", [2025], None),
        ("Discuss integrity constraints and their importance in DBMS.", [2025], None),
    ],
}

PART_A_HEADER = f"PART A — Answer ALL questions.  {PART_A_COUNT} × {PART_A_MARKS} = {PART_A_COUNT * PART_A_MARKS} marks"
PART_B_HEADER = f"PART B — Answer ALL questions.  {PART_B_COUNT} × {PART_B_MARKS} = {PART_B_COUNT * PART_B_MARKS} marks"


def _write_pdf(path: str, year: int) -> None:
    import fitz  # PyMuPDF

    doc = fitz.open()
    page = doc.new_page()  # A4 default
    y = 60
    page.insert_text((60, y), f"{UNIVERSITY}", fontsize=16, fontname="hebo")
    y += 24
    page.insert_text((60, y), f"B.Sc {SPECIALIZATION} — {SUBJECT} — Semester V", fontsize=12, fontname="helv")
    y += 18
    page.insert_text((60, y), f"Main Examination {YEAR_LABELS[year]}", fontsize=12, fontname="helv")
    y += 18
    page.insert_text((60, y), "Time: 3 hours", fontsize=11, fontname="helv")
    page.insert_text((420, y), f"Max Marks: {MAX_MARKS}", fontsize=11, fontname="helv")
    y += 24

    def write_block(header: str, start_q: int, count: int, marks: int) -> None:
        nonlocal y
        page.insert_text((60, y), header, fontsize=12, fontname="hebo")
        y += 20
        for i in range(count):
            text = PAPER_QUESTIONS[year][start_q - 1 + i][0]
            line = f"Q{start_q + i}. {text} ({marks} marks)"
            # wrap long lines
            while len(line) > 95:
                cut = line.rfind(" ", 0, 95)
                page.insert_text((60, y), line[:cut], fontsize=11, fontname="helv")
                y += 16
                line = "     " + line[cut + 1:]
            page.insert_text((60, y), line, fontsize=11, fontname="helv")
            y += 16
        y += 8

    write_block(PART_A_HEADER, 1, PART_A_COUNT, PART_A_MARKS)
    write_block(PART_B_HEADER, PART_A_COUNT + 1, PART_B_COUNT, PART_B_MARKS)
    doc.save(path)


def _paper_pdf_path(year: int) -> str:
    # Use the same base the download endpoint resolves against
    # (LOCAL_STORAGE_PATH, ./uploads fallback) so seeded PDFs are
    # downloadable — not just analyzable.
    base = settings.LOCAL_STORAGE_PATH or "./storage"
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, f"demo_pyq_{year}.pdf")


async def seed() -> None:
    # Owner: any existing admin (created by seed_demo_user or the operator).
    # The default tenant row must exist first: papers carry a tenant FK.
    from app.utils.bootstrap import ensure_default_tenant

    await ensure_default_tenant()
    async with AsyncSessionLocal() as db:
        admin = (await db.execute(
            select(User).filter(User.role.in_([UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]))
            .order_by(User.id).limit(1)
        )).scalars().first()
        if admin is None:
            print("[SKIP] no admin user found — run seed_demo_user first")
            return

        created = 0
        for year in sorted(PAPER_QUESTIONS):
            existing = (await db.execute(
                select(Paper).filter(
                    Paper.subject == SUBJECT,
                    Paper.year == year,
                    Paper.semester == SEMESTER,
                    Paper.status == PaperStatus.APPROVED,
                )
            )).scalars().first()
            if existing:
                # The filesystem may be ephemeral (Render): regenerate the
                # PDF when it is gone, and normalize legacy "./storage/..."
                # file_url values to the bare storage key the download
                # endpoint actually resolves.
                pdf_path = _paper_pdf_path(year)
                if not os.path.isfile(pdf_path):
                    _write_pdf(pdf_path, year)
                bare = f"demo_pyq_{year}.pdf"
                if existing.file_url != bare:
                    existing.file_url = bare
                    await db.commit()
                print(f"[OK] Paper ready: {SUBJECT} {YEAR_LABELS[year]} (id={existing.id})")
                continue

            pdf_path = _paper_pdf_path(year)
            _write_pdf(pdf_path, year)
            size = os.path.getsize(pdf_path)

            paper = Paper(
                title=f"{SUBJECT} — Semester V PYQ {YEAR_LABELS[year]}",
                description=f"Demo previous-year question paper ({YEAR_LABELS[year]})",
                subject=SUBJECT,
                university=UNIVERSITY,
                course=COURSE,
                stream=STREAM,
                specialization=SPECIALIZATION,
                year=year,
                semester=SEMESTER,
                exam_type=ExamType.FINAL,
                max_marks=MAX_MARKS,
                difficulty_level=None,
                tags=["demo", "pyq"],
                file_url=f"demo_pyq_{year}.pdf",
                file_name=os.path.basename(pdf_path),
                file_size=size,
                file_type="application/pdf",
                status=PaperStatus.APPROVED,
                approved_at=datetime.utcnow(),
                tenant_id=TENANT_ID,
                uploader_id=admin.id,
            )
            db.add(paper)
            await db.commit()
            await db.refresh(paper)
            print(f"[OK] Paper created: {SUBJECT} {YEAR_LABELS[year]} (id={paper.id})")
            created += 1

        if created:
            print(f"[OK] Seeded {created} demo paper(s). Run an analysis from the UI to extract questions.")


async def main() -> None:
    # Papers are product content, not the demo login: seed them whenever an
    # admin exists, regardless of ENABLE_DEMO_ACCOUNT.
    try:
        await seed()
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Demo paper seed failed")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
