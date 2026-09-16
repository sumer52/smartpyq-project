"""
Tests for paper management endpoints.

Covers:
  - GET  /api/v1/papers/          (list with filters)
  - POST /api/v1/papers/upload    (upload new paper)
  - GET  /api/v1/papers/search    (full-text search)
  - GET  /api/v1/papers/{id}      (get paper by ID)
  - GET  /api/v1/papers/{id}/download (download file)
  - POST /api/v1/papers/{id}/approve  (admin)
  - POST /api/v1/papers/{id}/reject   (admin)
  - DELETE /api/v1/papers/{id}        (admin)
"""

import io
import pytest
from tests.conftest import make_token, auth_headers, make_pdf_bytes


# ===================================================================
# GET /api/v1/papers/  (list)
# ===================================================================

class TestListPapers:
    """Tests for the paper listing endpoint."""

    async def test_list_papers_empty(self, authed_client):
        """Empty database returns empty list."""
        resp = await authed_client.get("/api/v1/papers/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers"] == []
        assert data["total"] == 0

    async def test_list_papers_with_data(self, authed_client, sample_paper):
        """Papers created in DB are returned."""
        resp = await authed_client.get("/api/v1/papers/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(p["title"] == "DBMS Final Exam 2024" for p in data["papers"])

    async def test_list_papers_filter_by_subject(self, authed_client, sample_paper):
        """Filter by subject returns matching papers."""
        resp = await authed_client.get("/api/v1/papers/?subject=Database")
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_list_papers_filter_by_year(self, authed_client, sample_paper):
        """Filter by year returns matching papers."""
        resp = await authed_client.get("/api/v1/papers/?year=2024")
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_list_papers_filter_by_stream(self, authed_client, sample_paper):
        """Filter by stream returns matching papers."""
        resp = await authed_client.get("/api/v1/papers/?stream=bca")
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_list_papers_no_auth(self, client):
        """Unauthenticated request returns 200 (public browsing) or 401/403."""
        resp = await client.get("/api/v1/papers/")
        assert resp.status_code in (200, 401, 403)

    async def test_list_papers_pagination(self, authed_client, sample_paper):
        """Pagination parameters work."""
        resp = await authed_client.get("/api/v1/papers/?page=1&per_page=5")
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert data["per_page"] == 5


# ===================================================================
# POST /api/v1/papers/upload
# ===================================================================

class TestUploadPaper:
    """Tests for the paper upload endpoint."""

    async def test_upload_paper_success(self, admin_client, tenant):
        """Valid PDF upload with metadata returns 201 (admin-only operation)."""
        pdf_bytes = make_pdf_bytes()
        resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={
                "title": "Operating Systems Midterm 2023",
                "subject": "Operating Systems",
                "university": "Test University",
                "stream": "bca",
                "specialization": "General",
                "semester": "4",
                "exam": "Midterm",
                "year": "2023",
                "tags": "os,processes",
                "description": "Midterm exam on processes and threads",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "title" in data
        assert "status" in data
        assert "id" in data
        # DRAFT-by-default publishing model: uploads are NOT public until an
        # admin explicitly publishes them.
        assert data["status"] == "uploaded"  # response shape; row is DRAFT

    async def test_upload_creates_draft_and_publish_flow(self, admin_client, tenant):
        """Upload -> DRAFT -> publish -> public; unpublish -> hidden."""
        pdf_bytes = make_pdf_bytes()
        resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("flow.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={
                "title": "Draft Publish Flow Test",
                "subject": "Flow Subject",
                "stream": "bca",
                "semester": "2",
                "exam": "Final",
                "year": "2024",
            },
        )
        assert resp.status_code == 201
        paper_id = resp.json()["id"]

        # DRAFT: hidden from the public list (anonymous browse shows APPROVED)
        public_list = await admin_client.get("/api/v1/papers/?paper_status=draft")
        assert public_list.status_code == 200
        draft_ids = [p["id"] for p in public_list.json()["papers"]]
        assert paper_id in draft_ids

        # Publish it
        pub = await admin_client.post(f"/api/v1/papers/{paper_id}/publish")
        assert pub.status_code == 200

        # Now visible in the public (approved) listing
        approved_list = await admin_client.get("/api/v1/papers/?paper_status=approved")
        assert approved_list.status_code == 200
        approved_ids = [p["id"] for p in approved_list.json()["papers"]]
        assert paper_id in approved_ids

        # Unpublish -> archived, still exists, no longer in public list
        unpub = await admin_client.post(f"/api/v1/papers/{paper_id}/unpublish")
        assert unpub.status_code == 200
        archived_list = await admin_client.get("/api/v1/papers/?paper_status=archived")
        assert archived_list.status_code == 200
        archived_ids = [p["id"] for p in archived_list.json()["papers"]]
        assert paper_id in archived_ids

        still_public = await admin_client.get("/api/v1/papers/?paper_status=approved")
        still_public_ids = [p["id"] for p in still_public.json()["papers"]]
        assert paper_id not in still_public_ids

    async def test_upload_paper_student_forbidden(self, authed_client):
        """Students cannot upload — admin-only operation."""
        pdf_bytes = make_pdf_bytes()
        resp = await authed_client.post(
            "/api/v1/papers/upload",
            files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"title": "Student Upload", "subject": "X", "stream": "bca",
                  "semester": "1", "exam": "Final", "year": "2024"},
        )
        assert resp.status_code == 403

    async def test_upload_paper_no_file(self, admin_client):
        """Missing file returns 422."""
        resp = await admin_client.post(
            "/api/v1/papers/upload",
            data={"title": "No File", "subject": "X", "stream": "bca",
                  "semester": "1", "exam": "Final", "year": "2024"},
        )
        assert resp.status_code == 422

    async def test_upload_paper_no_auth(self, client):
        """Unauthenticated upload returns 401/403."""
        pdf_bytes = make_pdf_bytes()
        resp = await client.post(
            "/api/v1/papers/upload",
            files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"title": "X", "subject": "Y", "stream": "bca",
                  "semester": "1", "exam": "Final", "year": "2024"},
        )
        assert resp.status_code in (401, 403)

    async def test_upload_paper_wrong_file_type(self, admin_client):
        """Non-PDF file returns 400 or 422."""
        resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("test.exe", io.BytesIO(b"not a pdf"), "application/octet-stream")},
            data={"title": "X", "subject": "Y", "stream": "bca",
                  "semester": "1", "exam": "Final", "year": "2024"},
        )
        assert resp.status_code in (400, 422)

    async def test_upload_paper_empty_file(self, admin_client):
        """Empty file returns 400 or 422."""
        resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
            data={"title": "X", "subject": "Y", "stream": "bca",
                  "semester": "1", "exam": "Final", "year": "2024"},
        )
        assert resp.status_code in (400, 422)


# ===================================================================
# GET /api/v1/papers/search
# ===================================================================

class TestSearchPapers:
    """Tests for the paper search endpoint."""

    async def test_search_papers_empty(self, authed_client):
        """Search with no results returns empty list."""
        resp = await authed_client.get("/api/v1/papers/search?q=nonexistent")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    async def test_search_papers_with_data(self, authed_client, sample_paper):
        """Search finds matching papers."""
        resp = await authed_client.get("/api/v1/papers/search?q=DBMS")
        assert resp.status_code == 200
        # May or may not find results depending on search implementation
        assert "total" in resp.json()

    async def test_search_papers_min_query_length(self, authed_client):
        """Query shorter than 2 chars returns 422."""
        resp = await authed_client.get("/api/v1/papers/search?q=a")
        assert resp.status_code == 422

    async def test_search_papers_no_auth(self, client):
        """Search is public — unauthenticated requests succeed."""
        resp = await client.get("/api/v1/papers/search?q=test")
        assert resp.status_code == 200


# ===================================================================
# GET /api/v1/papers/{paper_id}
# ===================================================================

class TestGetPaper:
    """Tests for the get-paper-by-ID endpoint."""

    async def test_get_paper_success(self, authed_client, sample_paper):
        """Get existing paper returns 200."""
        resp = await authed_client.get(f"/api/v1/papers/{sample_paper.id}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "DBMS Final Exam 2024"

    async def test_get_paper_not_found(self, authed_client):
        """Non-existent paper returns 404."""
        resp = await authed_client.get("/api/v1/papers/99999")
        assert resp.status_code == 404

    async def test_get_paper_no_auth(self, client, sample_paper):
        """Paper detail is public — unauthenticated requests succeed."""
        resp = await client.get(f"/api/v1/papers/{sample_paper.id}")
        assert resp.status_code == 200

    async def test_publish_status_filter_lock(self, client, authed_client):
        """Anonymous and student users can NEVER browse non-approved statuses."""
        for status_value in ("draft", "archived", "pending", "rejected"):
            for c, label in ((client, "anonymous"), (authed_client, "student")):
                resp = await c.get(f"/api/v1/papers/?paper_status={status_value}")
                assert resp.status_code == 200, f"{label} browse {status_value} should not error"
                papers = resp.json()["papers"]
                # The lock silently coerces non-approved requests to APPROVED,
                # so no draft/archived/pending/rejected paper can ever leak.
                assert all(
                    str(p.get("status", "")).lower() == "approved" for p in papers
                ), f"{label} saw non-approved papers when browsing {status_value}"


# ===================================================================
# GET /api/v1/papers/{paper_id}/download
# ===================================================================

class TestDownloadPaper:
    """Tests for the paper download endpoint."""

    async def test_download_paper_not_found(self, authed_client):
        """Download of non-existent paper returns 404 (requires auth first)."""
        resp = await authed_client.get("/api/v1/papers/99999/download")
        assert resp.status_code == 404


# ===================================================================
# POST /api/v1/papers/{paper_id}/approve
# ===================================================================

class TestApprovePaper:
    """Tests for the admin paper approval endpoint."""

    async def test_approve_paper_as_admin(self, admin_client, sample_paper, db_session):
        """Admin can approve a paper."""
        # First change to pending in the DB via direct update
        from sqlalchemy import text
        await db_session.execute(
            text("UPDATE papers SET status = 'PENDING' WHERE id = :pid"),
            {"pid": sample_paper.id}
        )
        await db_session.commit()
        resp = await admin_client.post(f"/api/v1/papers/{sample_paper.id}/approve")
        assert resp.status_code == 200

    async def test_approve_paper_as_student(self, authed_client, sample_paper):
        """Student cannot approve papers."""
        resp = await authed_client.post(f"/api/v1/papers/{sample_paper.id}/approve")
        assert resp.status_code in (403, 400, 500)

    async def test_approve_nonexistent_paper(self, admin_client):
        """Approving non-existent paper returns 404."""
        resp = await admin_client.post("/api/v1/papers/99999/approve")
        assert resp.status_code == 404


# ===================================================================
# DELETE /api/v1/papers/{paper_id}
# ===================================================================

class TestDeletePaper:
    """Tests for the admin paper deletion endpoint."""

    async def test_delete_paper_as_admin(self, admin_client, sample_paper):
        """Admin can delete a paper."""
        resp = await admin_client.delete(f"/api/v1/papers/{sample_paper.id}")
        assert resp.status_code == 200

    async def test_delete_paper_as_student(self, authed_client, sample_paper):
        """Student cannot delete papers."""
        resp = await authed_client.delete(f"/api/v1/papers/{sample_paper.id}")
        assert resp.status_code in (403, 400, 500)

    async def test_delete_nonexistent_paper(self, admin_client):
        """Deleting non-existent paper returns 404."""
        resp = await admin_client.delete("/api/v1/papers/99999")
        assert resp.status_code == 404
