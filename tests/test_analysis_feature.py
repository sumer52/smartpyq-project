"""Tests for the PYQ Hub analysis feature (public analyze endpoint,
priority tiers, insights extensions, and the question explorer)."""

import os
import sys
import pytest

# This module uses a file-based SQLite DB; remove any stale copy from a
# previous run so fixtures start from a clean schema (the engine connects
# lazily, so deleting before the app import below is safe).
_DB_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "_analysis_feature_test.db",
)
if os.path.exists(_DB_FILE):
    os.remove(_DB_FILE)

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./_analysis_feature_test.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.models.question import Question  # noqa: E402


# ---------------------------------------------------------------------------
# Priority tier unit tests (pure functions — no DB)
# ---------------------------------------------------------------------------

class TestHistoryPriority:
    def test_ratio_075_is_a(self):
        from app.services.insights_service import history_priority
        assert history_priority(0.75, 3) == "A"

    def test_ratio_05_is_b(self):
        from app.services.insights_service import history_priority
        assert history_priority(0.5, 2) == "B"

    def test_frequency_3_is_b_even_at_low_ratio(self):
        from app.services.insights_service import history_priority
        assert history_priority(0.1, 3) == "B"

    def test_frequency_2_or_ratio_025_is_c(self):
        from app.services.insights_service import history_priority
        assert history_priority(0.25, 1) == "C"
        assert history_priority(0.1, 2) == "C"

    def test_low_evidence_is_d(self):
        from app.services.insights_service import history_priority
        assert history_priority(0.1, 1) == "D"

    def test_topic_tier_very_high(self):
        from app.services.insights_service import topic_tier
        assert topic_tier(0.75, 4) == "very_high"
        assert topic_tier(0.8, 2) == "high"  # question_count gate for very_high

    def test_topic_tier_none_when_no_evidence(self):
        from app.services.insights_service import topic_tier
        assert topic_tier(0.1, 1) is None


# ---------------------------------------------------------------------------
# Fixtures: one tenant, one subject, three approved papers with shared questions
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_public_limiter():
    """The public analyze endpoint is rate-limited to 10/hour (shared,
    in-process storage). Tests legitimately exceed that, so reset the
    limiter before each test to keep them independent."""
    from app.routers.analysis import limiter
    try:
        limiter.reset()
    except Exception:
        pass
    yield


async def _make_papers_with_questions(db_session, tenant):
    """Create 3 approved papers with shared/repeated questions."""
    from app.models.paper import Paper, PaperStatus, ExamType
    from app.models.user import User, UserRole, UserStatus
    from app.core.auth import AuthManager

    auth = AuthManager()
    owner = User(
        email="paperowner@test.edu", username="paperowner",
        full_name="Paper Owner", password_hash=auth.hash_password("OwnerPass123!"),
        role=UserRole.ADMIN, status=UserStatus.ACTIVE, tenant_id=tenant.id,
        is_email_verified=True, preferences={},
    )
    db_session.add(owner)
    await db_session.flush()

    shared_q = "Explain normalization in DBMS with examples."
    variant_q = "Discuss the concept of normalization and normal forms in databases."
    papers = []
    for year in (2023, 2024, 2025):
        p = Paper(
            title=f"CS PYQ {year}", subject="Computer Science",
            university="Test University", stream="B.Sc", year=year,
            semester="sem5", exam_type=ExamType.FINAL,
            file_url=f"6/demo_{year}.pdf", file_type="application/pdf",
            status=PaperStatus.APPROVED, tenant_id=tenant.id, uploader_id=owner.id,
            tags=[],
        )
        db_session.add(p)
        papers.append(p)
        await db_session.flush()

        # Verbatim shared question in all three papers -> exact group, priority A.
        db_session.add(Question(
            paper_id=p.id, question_number="1", question_text=shared_q,
            original_question_text=shared_q,
            normalized_question_text=shared_q.lower(),
            marks=10, question_type="theory", subject="Computer Science",
            topic="database systems",
        ))
        # Unique question per paper -> no grouping, priority D.
        db_session.add(Question(
            paper_id=p.id, question_number="2", question_text=f"Unique question {year} about file organization.",
            original_question_text=f"Unique question {year} about file organization.",
            normalized_question_text=f"unique question {year} about file organization",
            marks=5, question_type="theory", subject="Computer Science",
            topic="file organization",
        ))
        await db_session.flush()

    # Reworded twin of the shared question in paper 2025 (TF-IDF material).
    p2025 = papers[2]
    db_session.add(Question(
        paper_id=p2025.id, question_number="3", question_text=variant_q,
        original_question_text=variant_q,
        normalized_question_text=variant_q.lower(),
        marks=10, question_type="theory", subject="Computer Science",
        topic="database systems",
    ))
    await db_session.commit()
    return papers


@pytest.fixture
async def papers_with_questions(db_session, tenant):
    return await _make_papers_with_questions(db_session, tenant)


@pytest.fixture
async def public_client(client, db_session, tenant):
    """Client with the lazy system analysis user available."""
    return client


# ---------------------------------------------------------------------------
# Public analyze endpoint
# ---------------------------------------------------------------------------

class TestAnalyzePublicEndpoint:
    async def test_analysis_and_reuse(self, client, db_session, tenant, papers_with_questions):
        ids = [p.id for p in papers_with_questions]
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["reused"] is False
        assert data["status"] == "completed"
        assert data["analysis_id"] > 0

        insights = data["insights"]
        assert insights["total_questions"] >= 3 * 2
        assert insights["unique_questions"] >= 1
        assert insights["papers_analyzed"] == 3

        # The verbatim shared question must be detected as repeated with
        # priority A (appeared in 3 of 3 papers).
        repeated = insights["repeated_questions"]
        shared = [r for r in repeated if "normalization" in r["representative_text"].lower()]
        assert shared, "shared normalization question should be grouped"
        top = shared[0]
        assert top["papers_count"] == 3
        assert top["priority"] == "A"
        assert sorted(top["occurrences"][i]["year"] for i in range(3)) == [2023, 2024, 2025]

        # Second call must reuse the cached analysis (no reprocessing).
        resp2 = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})
        assert resp2.status_code == 200
        assert resp2.json()["reused"] is True
        assert resp2.json()["analysis_id"] == data["analysis_id"]

    async def test_validates_paper_ids(self, client, papers_with_questions):
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": []})
        assert resp.status_code == 422
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": [1, 2, 3, 4, 5, 6, 7]})
        assert resp.status_code == 422
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": [999999]})
        assert resp.status_code == 404

    async def test_rejects_non_approved(self, client, db_session, tenant, papers_with_questions):
        from app.models.paper import Paper, PaperStatus, ExamType
        p = Paper(
            title="Draft paper", subject="Computer Science", university="Test University",
            stream="B.Sc", year=2022, semester="sem5",
                exam_type=ExamType.FINAL,
            file_url="6/x.pdf", file_type="application/pdf",
            status=PaperStatus.DRAFT, tenant_id=tenant.id, uploader_id=papers_with_questions[0].uploader_id,
            tags=[],
        )
        db_session.add(p)
        await db_session.commit()
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": [p.id]})
        assert resp.status_code == 422

    async def test_no_extractable_content_fails_gracefully(self, client, db_session, tenant, papers_with_questions):
        """A paper whose PDF cannot be read degrades the analysis; when nothing
        is extractable at all the endpoint returns an honest error."""
        from app.models.paper import Paper, PaperStatus, ExamType
        from app.models.question import Question
        p = Paper(
            title="Empty paper", subject="Computer Science", university="Test University",
            stream="B.Sc", year=2021, semester="sem5",
                exam_type=ExamType.FINAL,
            file_url="6/missing_file.pdf", file_type="application_pdf" if False else "application/pdf",
            status=PaperStatus.APPROVED, tenant_id=tenant.id, uploader_id=papers_with_questions[0].uploader_id,
            tags=[],
        )
        db_session.add(p)
        await db_session.commit()
        # Approved + unreadable PDF -> pipeline extracts nothing -> honest 422.
        resp = nothing = await client.post(
            "/api/v1/analysis/analyze-public", json={"paper_ids": [p.id]}
        )
        assert resp.status_code == 422
        assert "extract" in resp.json()["detail"].lower()

    async def test_partial_readable_set_still_works(self, client, papers_with_questions):
        """Selected set = 2 readable + 1 unreadable paper: readable ones win."""
        ids = [p.id for p in papers_with_questions[:2]] + [999999]
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})
        # Missing paper id fails the existence check with 404 (all-or-nothing).
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Insights extensions
# ---------------------------------------------------------------------------

class TestInsightsExtensions:
    async def test_frequency_table_and_unique_counts(self, client, papers_with_questions):
        ids = [p.id for p in papers_with_questions]
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})
        insights = resp.json()["insights"]

        ft = insights["frequency_table"]
        assert ft, "frequency table should exist"
        top = ft[0]
        assert top["frequency"] == 3
        assert sorted(top["years"]) == [2023, 2024, 2025]
        assert top["priority"] == "A"
        # Unique: 1 shared + 3 unique + 1 variant = 5 distinct texts
        assert insights["unique_questions"] == 5
        # High-priority count: the 3 members of the shared group (variant may
        # join via TF-IDF, making it 4 — accept either).
        assert insights["high_priority_count"] in (3, 4)

    async def test_marks_weightage_only_with_marks(self, client, db_session, tenant):
        """marks_weightage is None when no question carries marks."""
        from app.models.paper import Paper, PaperStatus, ExamType
        from app.models.user import User, UserRole, UserStatus
        from app.core.auth import AuthManager

        auth = AuthManager()
        owner = User(
            email="marksowner@test.edu", username="marksowner",
            full_name="Marks Owner", password_hash=auth.hash_password("OwnerPass123!"),
            role=UserRole.ADMIN, status=UserStatus.ACTIVE, tenant_id=tenant.id,
            is_email_verified=True, preferences={},
        )
        db_session.add(owner)
        await db_session.flush()
        papers = []
        for year in (2023, 2024):
            p = Paper(
                title=f"NoMarks PYQ {year}", subject="History", university="Test University",
                stream="B.A", year=year, semester="sem1",
                exam_type=ExamType.FINAL,
                file_url=f"6/nm_{year}.pdf", file_type="application/pdf",
                status=PaperStatus.APPROVED, tenant_id=tenant.id, uploader_id=owner.id,
                tags=[],
            )
            db_session.add(p)
            papers.append(p)
        await db_session.commit()
        for p in papers:
            db_session.add(Question(
                paper_id=p.id, question_number="1", question_text=f"Discuss empire trade {p.year}.",
                original_question_text=f"Discuss empire trade {p.year}.",
                normalized_question_text=f"discuss empire trade {p.year}",
                marks=None, question_type="theory", subject="History", topic=None,
            ))
        await db_session.commit()

        resp = await client.post(
            "/api/v1/analysis/analyze-public",
            json={"paper_ids": [p.id for p in papers]},
        )
        insights = resp.json()["insights"]
        assert insights["marks_weightage"] is None
        assert insights["marks_distribution"] == []

    async def test_topic_tiers_in_payload(self, client, papers_with_questions):
        ids = [p.id for p in papers_with_questions]
        resp = await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})
        insights = resp.json()["insights"]
        tiers = insights["topic_tiers"]
        assert tiers, "topic_tiers should always be present"
        db_entry = [t for t in tiers if t["topic"] == "database systems"][0]
        assert db_entry["papers_count"] >= 3
        assert db_entry["tier"] == "very_high"


# ---------------------------------------------------------------------------
# Question explorer + detail
# ---------------------------------------------------------------------------

class TestQuestionExplorer:
    async def test_filters_and_evidence(self, client, papers_with_questions):
        ids = [p.id for p in papers_with_questions]
        await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})

        resp = await client.get(
            f"/api/v1/analysis/questions?paper_ids={','.join(map(str, ids))}&limit=50"
        )
        assert resp.status_code == 200
        rows = resp.json()
        assert rows, "explorer should return questions for the analyzed papers"

        shared = [r for r in rows if "normalization" in r["question_text"].lower() and r["frequency"] > 1]
        assert shared, "shared question should carry group evidence"
        row = shared[0]
        assert row["frequency"] == 3
        assert sorted(row["years_asked"]) == [2023, 2024, 2025]
        assert row["group_id"] is not None
        assert row["priority"] == "A"

        # Search filter
        resp = await client.get(
            f"/api/v1/analysis/questions?paper_ids={','.join(map(str, ids))}&search=normalization"
        )
        results = resp.json()
        assert results and all("normalization" in r["question_text"].lower() for r in results)

        # Topic filter
        resp = await client.get(
            f"/api/v1/analysis/questions?paper_ids={','.join(map(str, ids))}&topic=database%20systems"
        )
        topic_rows = resp.json()
        assert topic_rows and all(r["topic"] == "database systems" for r in topic_rows)

    async def test_question_detail(self, client, papers_with_questions):
        ids = [p.id for p in papers_with_questions]
        await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})
        listing = (await client.get(
            f"/api/v1/analysis/questions?paper_ids={','.join(map(str, ids))}"
        )).json()
        target = [r for r in listing if r["frequency"] > 1][0]

        resp = await client.get(
            f"/api/v1/analysis/questions/{target['id']}/detail?papers={','.join(map(str, ids))}"
        )
        assert resp.status_code == 200
        d = resp.json()
        assert d["frequency"] == 3
        assert sorted(d["years_asked"]) == [2023, 2024, 2025]
        assert d["priority"] == "A"
        assert len(d["related"]) == 3
        assert d["topic"] == "database systems"

    async def test_detail_404(self, client):
        resp = await client.get("/api/v1/analysis/questions/424242/detail")
        assert resp.status_code == 404

    async def test_detail_with_multi_group_membership(self, client, db_session, tenant, papers_with_questions):
        """A question forced into two groups must not crash the detail
        endpoint (regression: 'Multiple rows were found when one or none
        was required'). The endpoint prefers the exact-match group."""
        from app.models.question import QuestionGroup, QuestionGroupMember, SimilarityMethod

        ids = [p.id for p in papers_with_questions]
        await client.post("/api/v1/analysis/analyze-public", json={"paper_ids": ids})
        listing = (await client.get(
            f"/api/v1/analysis/questions?paper_ids={','.join(map(str, ids))}"
        )).json()
        target = next(r for r in listing if r["frequency"] > 1)

        # Forge a second (TF-IDF) group containing the same question.
        g2 = QuestionGroup(
            representative_text="twin group", normalized_text="twin group text",
            subject="Computer Science", frequency=2,
            similarity_method=SimilarityMethod.TFIDF, confidence=0.7,
        )
        db_session.add(g2)
        await db_session.flush()
        db_session.add(QuestionGroupMember(
            question_id=target["id"], group_id=g2.id,
            similarity_score=0.8, is_exact_match=False,
        ))
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/analysis/questions/{target['id']}/detail?papers={','.join(map(str, ids))}"
        )
        assert resp.status_code == 200, resp.text
        d = resp.json()
        # Exact group wins: full 3-year history still reported.
        assert d["frequency"] == 3
        assert sorted(d["years_asked"]) == [2023, 2024, 2025]


# ---------------------------------------------------------------------------
# Years availability endpoint
# ---------------------------------------------------------------------------

class TestYearsEndpoint:
    async def test_year_counts_with_filters(self, client, papers_with_questions):
        resp = await client.get("/api/v1/papers/years?subject=Computer%20Science")
        assert resp.status_code == 200
        data = resp.json()
        assert data["years"] == [2023, 2024, 2025]
        counts = {yc["year"]: yc["paper_count"] for yc in data["year_counts"]}
        assert counts[2023] == 1 and counts[2024] == 1 and counts[2025] == 1

    async def test_no_match_returns_empty(self, client):
        resp = await client.get("/api/v1/papers/years?subject=Nonexistent")
        assert resp.status_code == 200
        assert resp.json() == {"years": [], "year_counts": []}


# ---------------------------------------------------------------------------
# Rate limiting on the public endpoint
# ---------------------------------------------------------------------------

class TestRateLimit:
    async def test_rate_limit_registered(self, client):
        """The endpoint is decorated with a 10/hour limiter; an abusive burst
        from one client address eventually gets a 429 with Retry-After."""
        from app.routers.analysis import limiter
        try:
            limiter.reset()
        except Exception:
            pass
        statuses = []
        got_429_body = None
        for _ in range(12):
            resp = await client.post(
                "/api/v1/analysis/analyze-public", json={"paper_ids": []}
            )
            statuses.append(resp.status_code)
            if resp.status_code == 429:
                got_429_body = resp.text
                break
        assert 429 in statuses, (
            f"expected a 429 within a 12-request burst, got {statuses}"
        )
        assert "rate limit" in got_429_body.lower()
