"""Tests for the student PYQ upload + admin verification workflow.

Covers:
  - POST /api/v1/papers/upload-student  (student community upload)
  - GET  /api/v1/papers/mine            (uploader's own submissions)
  - GET  /api/v1/papers/pending-review  (admin queue with duplicate evidence)
  - POST /api/v1/papers/{id}/approve    (existing endpoint + optional note)
  - POST /api/v1/papers/{id}/reject     (existing endpoint, reason required)
  - Visibility: pending/rejected papers are NOT public, enforced server-side
  - Approved papers become part of the public hub and analysis-eligible set
"""

import io

import pytest
from sqlalchemy import select

from tests.conftest import make_pdf_bytes, make_token, auth_headers


@pytest.fixture
async def student_client(client, test_user):
    token = make_token(test_user)
    client.headers.update(auth_headers(token))
    return client


async def _upload(db_session, tenant, uploader, *, subject="Data Structures",
                  year=2022, status_from="student", stream="bca", semester="4",
                  data=None, file_name="paper.pdf"):
    """Create a paper row directly (bypasses multipart for setup cases)."""
    from app.models.paper import Paper, PaperStatus, ExamType, ProcessingStatus
    status = PaperStatus.PENDING if status_from == "student" else PaperStatus.APPROVED
    p = Paper(
        title=f"{subject} Final Exam {year}",
        subject=subject,
        university="Test University",
        stream=stream,
        specialization="General",
        year=year,
        semester=semester,
        exam_type=ExamType.FINAL,
        status=status,
        processing_status=ProcessingStatus.UPLOADED,
        tenant_id=tenant.id,
        uploader_id=uploader.id,
        file_url=f"papers/_/{file_name}",
        file_name=file_name,
        file_type="application/pdf",
        tags=[],
    )
    db_session.add(p)
    await db_session.commit()
    await db_session.refresh(p)
    return p


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------

class TestStudentUpload:
    async def test_upload_creates_pending(self, student_client, db_session, tenant, test_user):
        resp = await student_client.post(
            "/api/v1/papers/upload-student",
            files={"file": ("paper.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
            data={
                "title": "My DSA Paper 2022",
                "subject": "Data Structures",
                "stream": "bca",
                "semester": "4",
                "exam": "Final",
                "year": "2022",
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["status"] == "pending"
        assert "verification" in data["message"].lower()
        pid = data["id"]

        # The DB row must be PENDING (not draft, not approved).
        from app.models.paper import Paper, PaperStatus
        row = (await db_session.execute(select(Paper).filter(Paper.id == pid))).scalar_one()
        assert row.status == PaperStatus.PENDING
        assert row.uploader_id == test_user.id

    async def test_upload_rejects_bad_extension(self, student_client):
        resp = await student_client.post(
            "/api/v1/papers/upload-student",
            files={"file": ("paper.exe", io.BytesIO(b"MZ" + b"\x00" * 64), "application/octet-stream")},
            data={
                "title": "Bad file", "subject": "OS", "stream": "bca",
                "semester": "4", "exam": "Final", "year": "2022",
            },
        )
        assert resp.status_code == 400

    async def test_anonymous_upload_creates_pending_with_token(self, client, db_session, tenant, test_user):
        """Signed-out visitors can upload; the paper lands in the admin queue."""
        resp = await client.post(
            "/api/v1/papers/upload-student",
            files={"file": ("anon.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
            data={
                "title": "Anonymous Community Paper",
                "subject": "Operating Systems",
                "stream": "bsc",
                "semester": "5",
                "exam": "Final",
                "year": "2023",
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["status"] == "pending"
        token = data.get("anon_token")
        assert token, "anonymous upload must return an anon_token"

        from app.models.paper import Paper, PaperStatus
        row = (await db_session.execute(select(Paper).filter(Paper.id == data["id"]))).scalar_one()
        assert row.status == PaperStatus.PENDING
        assert row.anon_token == token
        # The system uploader owns it (demo account in the seeded test DB).
        from app.models.user import User
        up = (await db_session.execute(select(User).filter(User.id == row.uploader_id))).scalar_one()
        assert up is not None

    async def test_anon_token_lists_own_submissions(self, client, db_session, tenant, test_user):
        """GET /mine?anon_token=... shows the paper uploaded with that token."""
        up = await client.post(
            "/api/v1/papers/upload-student",
            files={"file": ("t.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
            data={"title": "Token Roundtrip Paper", "subject": "Compilers", "stream": "bsc",
                  "semester": "6", "exam": "Final", "year": "2023"},
        )
        token = up.json()["anon_token"]

        mine = await client.get("/api/v1/papers/mine", params={"anon_token": token})
        assert mine.status_code == 200, mine.text
        rows = mine.json()["papers"]
        assert any(x["id"] == up.json()["id"] for x in rows)

        wrong = await client.get("/api/v1/papers/mine", params={"anon_token": "not-a-real-token"})
        assert wrong.status_code == 200
        assert not any(x["id"] == up.json()["id"] for x in wrong.json()["papers"])

    async def test_mine_requires_identity(self, client):
        """Neither signed in nor a token -> 401, not an empty list."""
        resp = await client.get("/api/v1/papers/mine")
        assert resp.status_code == 401

    async def test_rate_limit_blocks_upload_spam(self, client, db_session, tenant, test_user, monkeypatch):
        """Signed-out uploads beyond the hourly per-IP budget get 429."""
        import app.routers.papers as papers_mod
        monkeypatch.setattr(papers_mod, "_UPLOAD_RATE_LIMIT", 3)
        papers_mod._upload_rate_store.clear()

        payload = {
            "files": {"file": ("r.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
            "data": {"title": "Rate Paper", "subject": "Networks", "stream": "bsc",
                     "semester": "5", "exam": "Final", "year": "2023"},
        }
        codes = []
        for _ in range(5):
            resp = await client.post("/api/v1/papers/upload-student", **payload)
            codes.append(resp.status_code)
        assert codes[:3] == [201, 201, 201]
        assert codes[3] == 429
        assert codes[4] == 429

    async def test_admin_upload_via_community_endpoint_approved_directly(
        self, admin_client, db_session, tenant, admin_user
    ):
        """Admins bypass the verification queue: status APPROVED on arrival."""
        resp = await admin_client.post(
            "/api/v1/papers/upload-student",
            files={"file": ("admin-direct.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
            data={
                "title": "Admin Direct Publish",
                "subject": "Databases",
                "stream": "bsc",
                "semester": "5",
                "exam": "Final",
                "year": "2023",
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["status"] == "approved"
        assert "anon_token" not in data

        from app.models.paper import Paper, PaperStatus
        row = (await db_session.execute(select(Paper).filter(Paper.id == data["id"]))).scalar_one()
        assert row.status == PaperStatus.APPROVED
        assert row.uploader_id == admin_user.id
        assert row.anon_token is None


# ---------------------------------------------------------------------------
# Visibility: the critical rule
# ---------------------------------------------------------------------------

class TestPendingVisibility:
    async def test_pending_paper_hidden_from_public_list(self, client, db_session, tenant, test_user):
        """Anonymous browsing must never see pending submissions."""
        p = await _upload(db_session, tenant, test_user)
        resp = await client.get("/api/v1/papers/?paper_status=approved")
        assert resp.status_code == 200
        ids = [x["id"] for x in resp.json()["papers"]]
        assert p.id not in ids

    async def test_pending_paper_not_fetchable_by_id_anonymously(self, client, db_session, tenant, test_user):
        """Guessing the paper ID must not leak a pending paper."""
        p = await _upload(db_session, tenant, test_user)
        resp = await client.get(f"/api/v1/papers/{p.id}")
        assert resp.status_code in (401, 403, 404)

    async def test_pending_download_blocked_for_strangers(self, student_client, db_session, tenant, test_user):
        """A student cannot download someone else's pending paper."""
        from app.models.user import User, UserRole, UserStatus
        from app.core.auth import AuthManager

        auth = AuthManager()
        uploader = User(
            email="stranger-uploader@test.edu", username="strangeruploader",
            full_name="Stranger Uploader", password_hash=auth.hash_password("StrangerPass123!"),
            role=UserRole.STUDENT, status=UserStatus.ACTIVE, tenant_id=tenant.id,
            is_email_verified=True, preferences={},
        )
        db_session.add(uploader)
        await db_session.commit()
        await db_session.refresh(uploader)

        p = await _upload(db_session, tenant, uploader)
        resp = await student_client.get(f"/api/v1/papers/{p.id}/download")
        assert resp.status_code in (401, 403, 404)

    async def test_uploader_sees_own_submission_in_mine(self, student_client, db_session, tenant, test_user):
        p = await _upload(db_session, tenant, test_user)
        resp = await student_client.get("/api/v1/papers/mine")
        assert resp.status_code == 200
        rows = resp.json()["papers"]
        assert any(x["id"] == p.id and x["status"] == "pending" for x in rows)

    async def test_other_student_cannot_see_submission_in_mine(
        self, client, db_session, tenant, test_user
    ):
        """/mine only shows the uploader's own rows."""
        from app.models.user import User, UserRole, UserStatus
        from app.core.auth import AuthManager

        auth = AuthManager()
        other = User(
            email="other@test.edu", username="otherstudent",
            full_name="Other Student", password_hash=auth.hash_password("OtherPass123!"),
            role=UserRole.STUDENT, status=UserStatus.ACTIVE, tenant_id=tenant.id,
            is_email_verified=True, preferences={},
        )
        db_session.add(other)
        await db_session.commit()
        await db_session.refresh(other)

        p = await _upload(db_session, tenant, test_user)

        other_client = client
        other_client.headers.update(auth_headers(make_token(other)))
        resp = await other_client.get("/api/v1/papers/mine")
        assert resp.status_code == 200
        ids = [x["id"] for x in resp.json()["papers"]]
        assert p.id not in ids


# ---------------------------------------------------------------------------
# Admin verification queue + decisions
# ---------------------------------------------------------------------------

class TestAdminVerification:
    async def test_pending_queue_lists_submission(self, admin_client, db_session, tenant, test_user):
        p = await _upload(db_session, tenant, test_user)
        resp = await admin_client.get("/api/v1/papers/pending-review")
        assert resp.status_code == 200
        rows = resp.json()["papers"]
        assert any(x["id"] == p.id for x in rows)
        row = next(x for x in rows if x["id"] == p.id)
        assert row["uploaded_by"]["id"] == test_user.id

    async def test_queue_forbidden_for_students(self, student_client):
        resp = await student_client.get("/api/v1/papers/pending-review")
        assert resp.status_code in (401, 403)

    async def test_duplicate_flag_in_queue(self, admin_client, db_session, tenant, test_user):
        """A submission matching an approved paper's subject+year gets a flag."""
        approved = await _upload(db_session, tenant, test_user, subject="DBMS", year=2021,
                                 status_from="approved")
        p = await _upload(db_session, tenant, test_user, subject="DBMS", year=2021)
        resp = await admin_client.get("/api/v1/papers/pending-review")
        row = next(x for x in resp.json()["papers"] if x["id"] == p.id)
        dup_ids = [d["paper_id"] for d in row["possible_duplicates"]]
        assert approved.id in dup_ids

    async def test_approve_makes_paper_public_and_analysis_eligible(
        self, admin_client, db_session, tenant, test_user
    ):
        p = await _upload(db_session, tenant, test_user)

        resp = await admin_client.post(f"/api/v1/papers/{p.id}/approve", data={"note": "Verified genuine"})
        assert resp.status_code == 200, resp.text

        await db_session.refresh(p)
        from app.models.paper import PaperStatus
        assert p.status == PaperStatus.APPROVED
        assert p.moderation_notes == "Verified genuine"

        # Now visible in the public hub...
        pub = await admin_client.get("/api/v1/papers/?paper_status=approved")
        assert p.id in [x["id"] for x in pub.json()["papers"]]

        # ...and eligible for public analysis (analyze-public validation).
        ar = await admin_client.post("/api/v1/analysis/analyze-public", json={"paper_ids": [p.id]})
        # Either it analyzes (content extractable) or 422s for empty content —
        # but it must NOT fail with "not available for analysis".
        if ar.status_code == 422:
            assert "not available for analysis" not in ar.json()["detail"]

    async def test_reject_requires_reason_and_hides_paper(
        self, admin_client, db_session, tenant, test_user
    ):
        p = await _upload(db_session, tenant, test_user)

        # Reason is mandatory (min 10 chars).
        short = await admin_client.post(f"/api/v1/papers/{p.id}/reject", data={"reason": "bad"})
        assert short.status_code == 422

        resp = await admin_client.post(
            f"/api/v1/papers/{p.id}/reject",
            data={"reason": "Wrong subject: this is an OS paper, not DSA."},
        )
        assert resp.status_code == 200, resp.text

        await db_session.refresh(p)
        from app.models.paper import PaperStatus
        assert p.status == PaperStatus.REJECTED
        assert "Wrong subject" in (p.moderation_notes or "")

        # Rejected papers never appear in the public hub.
        pub = await admin_client.get("/api/v1/papers/?paper_status=approved")
        assert p.id not in [x["id"] for x in pub.json()["papers"]]

        # ...and the uploader sees the status + reason in /mine.
        token = make_token(test_user)
        me_headers = auth_headers(token)
        mine = await admin_client.get("/api/v1/papers/mine", headers=me_headers)
        row = next(x for x in mine.json()["papers"] if x["id"] == p.id)
        assert row["status"] == "rejected"
        assert "Wrong subject" in row["rejection_reason"]

    async def test_student_cannot_approve_or_reject(self, student_client, db_session, tenant, test_user):
        p = await _upload(db_session, tenant, test_user)
        approve = await student_client.post(f"/api/v1/papers/{p.id}/approve")
        assert approve.status_code in (401, 403)
        reject = await student_client.post(
            f"/api/v1/papers/{p.id}/reject", data={"reason": "self approve attempt"}
        )
        assert reject.status_code in (401, 403)

    async def test_admin_upload_flow_unchanged(self, admin_client):
        """Admin uploads still go DRAFT-first, NOT through student verification."""
        resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("admin.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
            data={
                "title": "Admin Uploaded Paper",
                "subject": "Admin Subject",
                "stream": "bca",
                "semester": "4",
                "exam": "Final",
                "year": "2024",
            },
        )
        assert resp.status_code == 201
        # No "pending" in the response: the admin flow is untouched.
        assert resp.json()["status"] != "pending"
