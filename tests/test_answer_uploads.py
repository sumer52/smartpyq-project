"""Tests for teacher answer uploads (Exam Practice Mode).

Covers:
  - POST   /api/v1/questions/{qid}/answer   (admin-only set/replace)
  - DELETE /api/v1/questions/{qid}/answer   (admin-only)
  - GET    /api/v1/questions/{qid}/answer-file (visibility enforced)
  - answer fields in /analysis/questions and /analysis/questions/{qid}/detail
"""

import io

import pytest

from tests.conftest import make_token, auth_headers


def make_png_bytes() -> bytes:
    """Minimal valid PNG (1x1 white pixel)."""
    import struct
    import zlib

    def chunk(ctype: bytes, data: bytes) -> bytes:
        c = ctype + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    idat = zlib.compress(b"\x00\xff\xff\xff")
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", idat)
            + chunk(b"IEND", b""))


def make_pdf_bytes() -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n"
        b"trailer<</Size 4/Root 1 0 R>>\n"
        b"%%EOF\n"
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def student_client(client, test_user):
    token = make_token(test_user)
    client.headers.update(auth_headers(token))
    return client


@pytest.fixture
async def answered_paper(db_session, sample_paper):
    """Ensure the sample paper is approved (public)."""
    from app.models.paper import PaperStatus
    sample_paper.status = PaperStatus.APPROVED
    db_session.add(sample_paper)
    await db_session.commit()
    await db_session.refresh(sample_paper)
    return sample_paper


# ---------------------------------------------------------------------------
# Admin write path
# ---------------------------------------------------------------------------

class TestSetAnswer:
    async def test_set_text_answer(self, admin_client, sample_question):
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "text", "answer_text": "Normalization is the process of\n- removing redundancy\n1. first normal form\n2. second normal form"},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["answer_type"] == "text"
        assert "redundancy" in data["answer_text"]

    async def test_set_image_answer(self, admin_client, sample_question):
        png = make_png_bytes()
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "image"},
            files={"file": ("handwritten.png", io.BytesIO(png), "image/png")},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["answer_type"] == "image"
        assert data["answer_file_name"] == "handwritten.png"
        assert data["answer_url"].endswith("/answer-file")

    async def test_set_pdf_answer(self, admin_client, sample_question):
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "pdf"},
            files={"file": ("solution.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["answer_type"] == "pdf"

    async def test_reject_disguised_file(self, admin_client, sample_question):
        """A .png extension containing PDF bytes must be rejected."""
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "image"},
            files={"file": ("fake.png", io.BytesIO(make_pdf_bytes()), "image/png")},
        )
        assert resp.status_code == 422
        assert "match" in resp.json()["detail"].lower()

    async def test_reject_wrong_extension(self, admin_client, sample_question):
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "image"},
            files={"file": ("answer.gif", io.BytesIO(b"GIF89a" + b"\x00" * 20), "image/gif")},
        )
        assert resp.status_code == 422

    async def test_text_answer_requires_text(self, admin_client, sample_question):
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "text", "answer_text": "   "},
        )
        assert resp.status_code == 422

    async def test_image_answer_requires_file(self, admin_client, sample_question):
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "image"},
        )
        assert resp.status_code == 422

    async def test_invalid_answer_type(self, admin_client, sample_question):
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "video"},
        )
        assert resp.status_code == 422

    async def test_replace_pdf_with_text_and_clear_file(self, admin_client, sample_question):
        # First: PDF answer
        await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "pdf"},
            files={"file": ("v1.pdf", io.BytesIO(make_pdf_bytes()), "application/pdf")},
        )
        # Then: replace with text
        resp = await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "text", "answer_text": "Plain text answer."},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["answer_type"] == "text"
        assert data["answer_url"] is None
        assert data["answer_file_name"] is None

    async def test_student_forbidden(self, student_client, sample_question):
        resp = await student_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "text", "answer_text": "hack"},
        )
        assert resp.status_code in (401, 403)

    async def test_anonymous_forbidden(self, client, sample_question):
        resp = await client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "text", "answer_text": "anon"},
        )
        assert resp.status_code in (401, 403)

    async def test_404_for_missing_question(self, admin_client):
        resp = await admin_client.post(
            "/api/v1/questions/999999/answer",
            data={"answer_type": "text", "answer_text": "x"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

class TestDeleteAnswer:
    async def test_delete_roundtrip(self, admin_client, sample_question):
        await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "image"},
            files={"file": ("a.png", io.BytesIO(make_png_bytes()), "image/png")},
        )
        resp = await admin_client.delete(f"/api/v1/questions/{sample_question.id}/answer")
        assert resp.status_code == 200
        detail = await admin_client.get(f"/api/v1/analysis/questions/{sample_question.id}/detail")
        assert detail.json()["answer_type"] is None

    async def test_student_forbidden(self, student_client, sample_question):
        resp = await student_client.delete(f"/api/v1/questions/{sample_question.id}/answer")
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Answer file visibility (server-enforced)
# ---------------------------------------------------------------------------

class TestAnswerFileVisibility:
    async def _attach_via_db(self, db_session, paper, question):
        """Attach an image answer directly through the DB (no auth needed)."""
        from datetime import datetime, timezone
        from app.utils import answer_storage
        png = make_png_bytes()
        key = answer_storage.save_answer_file(question.id, png, ".png")
        question.answer_type = "image"
        question.answer_text = None
        question.answer_file_url = key
        question.answer_file_name = "a.png"
        question.answer_file_size = len(png)
        question.answer_file_mime = "image/png"
        question.answer_updated_at = datetime.now(timezone.utc)
        db_session.add(question)
        await db_session.commit()

    async def test_public_when_paper_approved(self, db_session, answered_paper, sample_question, client):
        """Approved paper -> answer file is public (no auth)."""
        await self._attach_via_db(db_session, answered_paper, sample_question)
        resp = await client.get(f"/api/v1/questions/{sample_question.id}/answer-file")
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("image/png")

    async def test_forbidden_when_paper_not_approved(self, client, db_session, sample_paper, sample_question):
        """Draft/pending papers hide their answer files even from logged-in students."""
        from app.models.paper import PaperStatus
        sample_paper.status = PaperStatus.DRAFT
        db_session.add(sample_paper)
        await db_session.commit()

        await self._attach_via_db(db_session, sample_paper, sample_question)

        resp = await client.get(f"/api/v1/questions/{sample_question.id}/answer-file")
        assert resp.status_code in (401, 403)

    async def test_404_when_no_answer(self, client, answered_paper, sample_question):
        resp = await client.get(f"/api/v1/questions/{sample_question.id}/answer-file")
        assert resp.status_code == 404

    async def test_admin_can_view_unpublished(self, admin_client, db_session, sample_paper, sample_question):
        from app.models.paper import PaperStatus
        sample_paper.status = PaperStatus.DRAFT
        db_session.add(sample_paper)
        await db_session.commit()
        await self._attach_via_db(db_session, sample_paper, sample_question)
        resp = await admin_client.get(f"/api/v1/questions/{sample_question.id}/answer-file")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Answer exposure in question APIs
# ---------------------------------------------------------------------------

class TestAnswerInQuestionAPIs:
    async def test_questions_list_carries_has_answer(self, admin_client, client, sample_question):
        await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "text", "answer_text": "answer body"},
        )
        rows = await client.get("/api/v1/analysis/questions")
        assert rows.status_code == 200
        row = next(r for r in rows.json() if r["id"] == sample_question.id)
        assert row["has_answer"] is True
        assert row["answer_type"] == "text"

    async def test_detail_returns_text_answer(self, admin_client, client, sample_question):
        await admin_client.post(
            f"/api/v1/questions/{sample_question.id}/answer",
            data={"answer_type": "text", "answer_text": "The answer is 42."},
        )
        detail = await client.get(f"/api/v1/analysis/questions/{sample_question.id}/detail")
        assert detail.status_code == 200
        d = detail.json()
        assert d["answer_type"] == "text"
        assert d["answer_text"] == "The answer is 42."
