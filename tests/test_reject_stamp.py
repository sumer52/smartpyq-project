"""Tests for reject_paper and stamp_paper endpoints."""

import pytest
from httpx import AsyncClient


class TestRejectPaper:
    """Tests for POST /api/v1/papers/{id}/reject"""

    @pytest.mark.asyncio
    async def test_reject_paper_as_admin(self, admin_client, tenant, admin_user):
        """Admin can reject a pending paper with a reason."""
        # First upload a paper
        pdf_content = b"%PDF-1.4 fake content for testing"
        upload_resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("test.pdf", pdf_content, "application/pdf")},
            data={
                "title": "Test Paper For Rejection",
                "subject": "Mathematics",
                "university": "Osmania University",
                "stream": "bsc",
                "specialization": "mscs",
                "semester": "sem3",
                "exam": "Midterm",
                "year": "2024",
            },
        )
        assert upload_resp.status_code == 201
        paper_id = upload_resp.json()["id"]

        # Reject it
        resp = await admin_client.post(
            f"/api/v1/papers/{paper_id}/reject",
            data={"reason": "Insufficient content quality for publication"},
        )
        assert resp.status_code == 200
        assert "rejected" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_reject_paper_not_found(self, admin_client, tenant):
        """Rejecting a non-existent paper returns 404."""
        resp = await admin_client.post(
            "/api/v1/papers/99999/reject",
            data={"reason": "This paper does not exist so rejection fails"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_reject_paper_short_reason(self, admin_client, tenant, admin_user):
        """Reject with reason shorter than 10 chars returns 422."""
        pdf_content = b"%PDF-1.4 fake content for testing"
        upload_resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("test.pdf", pdf_content, "application/pdf")},
            data={
                "title": "Test Paper Short Reason",
                "subject": "Mathematics",
                "university": "Osmania University",
                "stream": "bsc",
                "specialization": "mscs",
                "semester": "sem3",
                "exam": "Final",
                "year": "2024",
            },
        )
        paper_id = upload_resp.json()["id"]

        resp = await admin_client.post(
            f"/api/v1/papers/{paper_id}/reject",
            data={"reason": "short"},  # < 10 chars
        )
        assert resp.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_reject_paper_as_student_forbidden(self, client, tenant, test_user):
        """Students cannot reject papers."""
        from app.core.auth import AuthManager
        auth_mgr = AuthManager()
        token = auth_mgr.create_access_token(
            subject=test_user.email,
            user_id=test_user.id,
            role="student",
            tenant_id=test_user.tenant_id
        )

        resp = await client.post(
            "/api/v1/papers/1/reject",
            headers={"Authorization": f"Bearer {token}"},
            data={"reason": "Students cannot reject papers either way"},
        )
        assert resp.status_code in (403, 401)


class TestStampPaper:
    """Tests for POST /api/v1/papers/{id}/stamp"""

    @pytest.mark.asyncio
    async def test_stamp_paper_success(self, admin_client, tenant, admin_user):
        """Stamp returns a download URL for an approved paper."""
        # Upload and get paper ID
        pdf_content = b"%PDF-1.4 fake content for testing"
        upload_resp = await admin_client.post(
            "/api/v1/papers/upload",
            files={"file": ("test.pdf", pdf_content, "application/pdf")},
            data={
                "title": "Test Paper For Stamp",
                "subject": "Mathematics",
                "university": "Osmania University",
                "stream": "bsc",
                "specialization": "mscs",
                "semester": "sem3",
                "exam": "Final",
                "year": "2024",
            },
        )
        paper_id = upload_resp.json()["id"]

        resp = await admin_client.post(f"/api/v1/papers/{paper_id}/stamp")
        assert resp.status_code == 200
        data = resp.json()
        assert "download_url" in data
        assert "expires_at" in data
        assert "file_name" in data

    @pytest.mark.asyncio
    async def test_stamp_paper_not_found(self, admin_client, tenant):
        """Stamping a non-existent paper returns 404."""
        resp = await admin_client.post("/api/v1/papers/99999/stamp")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_stamp_requires_auth(self, client, tenant):
        """Unauthenticated stamp request returns 401."""
        resp = await client.post("/api/v1/papers/1/stamp")
        assert resp.status_code in (401, 403)
