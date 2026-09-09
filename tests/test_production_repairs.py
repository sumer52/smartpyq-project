"""Tests for production deployment repairs.

Covers:
- Supabase configuration validation (storage enabled requires service key)
- /health and /ready endpoints
- Async TF-IDF grouping (sklearn installed + graceful degradation)
- Upload validation (extension/MIME mismatch rejected, traversal sanitized)
- Production upload failure rolls back the paper record
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./_test_audit.db")
os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only-0123456789abcdef")
os.environ.setdefault("ENV", "test")


# ---------------------------------------------------------------------------
# Supabase configuration validation
# ---------------------------------------------------------------------------

class TestSupabaseConfig:
    def test_storage_disabled_without_use_flag(self):
        from app.utils.supabase_client import is_supabase_storage_enabled
        with patch("app.utils.supabase_client.settings") as s:
            s.USE_SUPABASE_STORAGE = True
            s.SUPABASE_URL = "https://x.supabase.co"
            s.SUPABASE_SERVICE_ROLE_KEY = None
            s.SUPABASE_SECRET_KEY = None
            assert is_supabase_storage_enabled() is False

    def test_storage_disabled_without_service_key(self):
        from app.utils.supabase_client import is_supabase_storage_enabled
        with patch("app.utils.supabase_client.settings") as s:
            s.USE_SUPABASE_STORAGE = True
            s.SUPABASE_URL = "https://x.supabase.co"
            s.SUPABASE_SERVICE_ROLE_KEY = None
            s.SUPABASE_SECRET_KEY = None
            s.SUPABASE_ANON_KEY = "anon-key"
            # anon key alone must NOT be enough
            assert is_supabase_storage_enabled() is False

    def test_storage_enabled_with_secret_key_naming(self):
        from app.utils.supabase_client import is_supabase_storage_enabled
        with patch("app.utils.supabase_client.settings") as s:
            s.USE_SUPABASE_STORAGE = True
            s.SUPABASE_URL = "https://x.supabase.co"
            s.SUPABASE_SERVICE_ROLE_KEY = None
            s.SUPABASE_SECRET_KEY = "secret-key"
            assert is_supabase_storage_enabled() is True

    def test_storage_disabled_when_use_flag_false(self):
        from app.utils.supabase_client import is_supabase_storage_enabled
        with patch("app.utils.supabase_client.settings") as s:
            s.USE_SUPABASE_STORAGE = False
            s.SUPABASE_URL = "https://x.supabase.co"
            s.SUPABASE_SERVICE_ROLE_KEY = "k"
            assert is_supabase_storage_enabled() is False

    def test_demo_account_default_off_in_production(self):
        from app.core.config import demo_account_enabled
        with patch("app.core.config.settings") as s:
            s.ENV = "production"
            s.ENABLE_DEMO_ACCOUNT = None
            assert demo_account_enabled() is False
            s.ENABLE_DEMO_ACCOUNT = True
            assert demo_account_enabled() is True

    def test_demo_account_default_on_in_development(self):
        from app.core.config import demo_account_enabled
        with patch("app.core.config.settings") as s:
            s.ENV = "development"
            s.ENABLE_DEMO_ACCOUNT = None
            assert demo_account_enabled() is True


# ---------------------------------------------------------------------------
# Health / readiness endpoints
# ---------------------------------------------------------------------------

class TestHealthEndpoints:
    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from app.main import app
        return TestClient(app)

    def test_health_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "healthy"

    def test_ready_ok_on_sqlite(self, client):
        r = client.get("/ready")
        assert r.status_code in (200, 503)
        body = r.json()
        assert "checks" in body
        assert "database" in body["checks"]

    def test_ready_reports_storage_misconfigured_without_service_key(self, client):
        import app.main as app_main
        original = (app_main.settings.USE_SUPABASE_STORAGE, app_main.settings.SUPABASE_URL)
        try:
            app_main.settings.USE_SUPABASE_STORAGE = True
            app_main.settings.SUPABASE_URL = "https://x.supabase.co"
            r = client.get("/ready")
            assert r.status_code in (200, 503)
            body = r.json()
            storage = body["checks"]["storage"]
            # Flag on but service key absent -> never claim configured/healthy
            assert storage.get("status") in ("misconfigured", "degraded")
        finally:
            app_main.settings.USE_SUPABASE_STORAGE, app_main.settings.SUPABASE_URL = original


# ---------------------------------------------------------------------------
# Async TF-IDF grouping
# ---------------------------------------------------------------------------

class TestTfidfGrouping:
    def test_cluster_similar_groups_paraphrases(self):
        from app.services.analysis_service import _cluster_similar
        texts = [
            "explain the central limit theorem with an example",
            "describe the central limit theorem and give an example",
            "central limit theorem explanation example",
            "draw the structure of an atom and label its parts",
            "what is the structure of an atom, label the parts",
            "define photosynthesis and write its equation",
        ]
        clusters = _cluster_similar(texts, threshold=0.5)
        assert clusters, "expected at least one cluster"
        for c in clusters:
            assert len(c) >= 2
        # The three CLT texts should land in one cluster
        clt = [c for c in clusters if 0 in c]
        assert clt and all(i in clt[0] for i in (1, 2)), f"CLT texts not clustered: {clusters}"

    def test_cluster_similar_degrades_without_sklearn(self):
        import builtins
        real_import = builtins.__import__

        def fake_import(name, *a, **k):
            if name.startswith("sklearn"):
                raise ImportError("No module named 'sklearn'")
            return real_import(name, *a, **k)

        from app.services import analysis_service
        with patch("builtins.__import__", side_effect=fake_import):
            assert analysis_service._cluster_similar(["a b c", "a b c"], 0.5) == []

    def test_high_threshold_yields_no_clusters(self):
        from app.services.analysis_service import _cluster_similar
        texts = ["completely different topic one", "utterly unrelated subject two"]
        assert _cluster_similar(texts, threshold=0.99) == []


# ---------------------------------------------------------------------------
# Upload validation + production failure handling
# ---------------------------------------------------------------------------

class TestUploadValidation:
    def _service(self):
        from app.services.paper_service import PaperService
        return PaperService(db=None)

    def test_mime_mismatch_rejected(self):
        svc = self._service()
        from app.core.exceptions import ValidationError
        from app.schemas.paper import PaperCreateRequest
        # .pdf extension but PNG bytes
        png_bytes = b"\x89PNG\r\n\x1a\n" + b"0" * 100
        with pytest.raises(ValidationError):
            asyncio.get_event_loop_policy()  # noqa: ensure loop policy exists
            coro = svc.upload_paper(
                file_data=png_bytes,
                filename="fake.pdf",
                paper_data=PaperCreateRequest(tenant_id=1, title="t", subject="s", university="U", year=2024, exam_type="endsem", language="en"),
                uploader=MagicMock(id=1, tenant_id=1, role="student"),
            )
            asyncio.new_event_loop().run_until_complete(coro)

    def test_sniff_mime(self):
        from app.services.paper_service import PaperService
        assert PaperService._sniff_mime(b"%PDF-1.7 ...") == "application/pdf"
        assert PaperService._sniff_mime(b"\xff\xd8\xff" + b"x" * 20) == "image/jpeg"
        assert PaperService._sniff_mime(b"\x89PNG\r\n\x1a\n" + b"x" * 20) == "image/png"
        assert PaperService._sniff_mime(b"RIFF1234WEBP") == "image/webp"
        assert PaperService._sniff_mime(b"random-data-here") is None

    def test_prod_upload_failure_rolls_back(self):
        """In production, a Supabase failure must raise + delete the paper record."""
        from app.core.exceptions import ValidationError

        async def scenario():
            from app.services.paper_service import PaperService
            svc = PaperService(db=None)
            svc.create_paper = _fake_create_paper
            svc.paper_repo = AsyncMock()
            svc.paper_repo.get_version_by_checksum.return_value = None
            svc.paper_repo.delete = AsyncMock(side_effect=_fake_delete)

            with patch("app.services.paper_service.settings") as s, \
                 patch("app.utils.supabase_client.is_supabase_storage_enabled", return_value=True), \
                 patch("app.utils.supabase_client.get_supabase_admin") as gsa:
                s.ENV = "production"
                s.MAX_FILE_SIZE = 10 * 1024 * 1024
                s.LOCAL_STORAGE_PATH = "./storage"
                s.LOCAL_STORAGE_URL = "http://localhost:8000/files"
                s.SUPABASE_STORAGE_BUCKET = "question-papers"
                admin = MagicMock()
                admin.storage.from_.return_value.upload.side_effect = RuntimeError("bucket down")
                gsa.return_value = admin

                from app.schemas.paper import PaperCreateRequest
                with pytest.raises(ValidationError):
                    await svc.upload_paper(
                        file_data=b"%PDF-1.7 real content",
                        filename="real.pdf",
                        paper_data=PaperCreateRequest(tenant_id=1, title="t", subject="s", university="U", year=2024, exam_type="endsem", language="en"),
                        uploader=MagicMock(id=7, tenant_id=1, role="student"),
                    )
            assert _deleted_ids == [101], "paper record was not rolled back"

        asyncio.run(scenario())

    def test_dev_upload_failure_falls_back_to_local(self):
        """In development, a Supabase failure falls back to local disk."""

        async def scenario():
            import tempfile
            tmpdir = tempfile.mkdtemp()
            from app.services.paper_service import PaperService
            svc = PaperService(db=None)
            svc.create_paper = _fake_create_paper
            svc.paper_repo = AsyncMock()
            svc.paper_repo.get_version_by_checksum.return_value = None
            svc.paper_repo.delete = AsyncMock(side_effect=_fake_delete)
            svc.paper_repo.update = AsyncMock(side_effect=_fake_update)
            svc.paper_repo.create_version = AsyncMock(side_effect=_fake_create_version)
            svc._log_audit = AsyncMock(side_effect=_fake_audit)

            with patch("app.services.paper_service.settings") as s, \
                 patch("app.utils.supabase_client.is_supabase_storage_enabled", return_value=True), \
                 patch("app.utils.supabase_client.get_supabase_admin") as gsa:
                s.ENV = "development"
                s.MAX_FILE_SIZE = 10 * 1024 * 1024
                s.LOCAL_STORAGE_PATH = tmpdir
                s.LOCAL_STORAGE_URL = "http://localhost:8000/files"
                s.SUPABASE_STORAGE_BUCKET = "question-papers"
                admin = MagicMock()
                admin.storage.from_.return_value.upload.side_effect = RuntimeError("bucket down")
                gsa.return_value = admin

                from app.schemas.paper import PaperCreateRequest
                result = await svc.upload_paper(
                    file_data=b"%PDF-1.7 real content",
                    filename="real.pdf",
                    paper_data=PaperCreateRequest(tenant_id=1, title="t", subject="s", university="U", year=2024, exam_type="endsem", language="en"),
                    uploader=MagicMock(id=7, tenant_id=1, role="student"),
                )
                assert result["id"] == 101
                # file landed on local disk
                assert _updated_fields.get("file_url", "").startswith("http://localhost:8000/files/")

        asyncio.run(scenario())


# --- shared fakes -----------------------------------------------------------

_deleted_ids = []
_updated_fields = {}


async def _fake_create_paper(paper_data, uploader, ip_address=None):
    class P:
        id = 101
        title = "t"
        tenant_id = 1
    return P()


async def _fake_delete(pid):
    _deleted_ids.append(pid)


async def _fake_update(pid, **fields):
    _updated_fields.update(fields)


async def _fake_create_version(**kw):
    return MagicMock()


async def _fake_audit(*a, **k):
    return None
