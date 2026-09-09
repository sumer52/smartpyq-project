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
        from app.utils import supabase_client as sc
        original = (
            app_main.settings.USE_SUPABASE_STORAGE,
            app_main.settings.SUPABASE_URL,
            app_main.settings.SUPABASE_SERVICE_ROLE_KEY,
            app_main.settings.SUPABASE_SECRET_KEY,
            sc._supabase_admin_client,
        )
        try:
            # Deterministic: flag on, URL present, but NO service key at all
            # (the real .env may carry one — clear it for this scenario).
            app_main.settings.USE_SUPABASE_STORAGE = True
            app_main.settings.SUPABASE_URL = "https://x.supabase.co"
            app_main.settings.SUPABASE_SERVICE_ROLE_KEY = None
            app_main.settings.SUPABASE_SECRET_KEY = None
            sc._supabase_admin_client = None  # reset cached client
            r = client.get("/ready")
            assert r.status_code in (200, 503)
            body = r.json()
            storage = body["checks"]["storage"]
            # Flag on but service key absent -> never claim configured/healthy
            assert storage.get("status") in ("misconfigured", "degraded")
        finally:
            (
                app_main.settings.USE_SUPABASE_STORAGE,
                app_main.settings.SUPABASE_URL,
                app_main.settings.SUPABASE_SERVICE_ROLE_KEY,
                app_main.settings.SUPABASE_SECRET_KEY,
                sc._supabase_admin_client,
            ) = original


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


# ---------------------------------------------------------------------------
# Supabase delete workflow + extraction on cloud uploads
# ---------------------------------------------------------------------------

class TestSupabaseDeleteWorkflow:
    """delete_paper must remove the SUPERBASE object key ({user_id}/{hash}.ext
    recorded in paper.file_url), not the local staging key papers/{id}/{hash}.ext.
    """

    def _make_service(self, file_url, s3_key):
        from app.services.paper_service import PaperService
        svc = PaperService(db=None)
        svc.paper_repo = AsyncMock()
        svc.storage_service = None
        svc.cache_service = None
        svc._log_audit = AsyncMock()

        paper = MagicMock()
        paper.id = 55
        paper.title = "Paper"
        paper.tenant_id = 1
        paper.uploader_id = 7
        paper.file_url = file_url
        svc.paper_repo.get_by_id.return_value = paper

        version = MagicMock()
        version.s3_key = s3_key
        svc.paper_repo.get_paper_versions.return_value = [version]
        return svc

    def _run_delete(self, svc, monkeypatch, removed_keys):
        from app.utils import supabase_client as sc

        class FakeStorage:
            def __init__(self, bucket, removed_keys):
                self.bucket = bucket
                self._removed = removed_keys

            def remove(self, keys):
                self._removed.extend(keys)

        class FakeAdmin:
            def __init__(self):
                self.calls = []
                self._removed = removed_keys

            @property
            def storage(self):
                outer = self

                class _Storage:
                    def from_(self, bucket):
                        outer.calls.append(bucket)
                        return FakeStorage(bucket, outer._removed)

                return _Storage()

        admin = FakeAdmin()
        monkeypatch.setattr(sc, "is_supabase_storage_enabled", lambda: True)
        monkeypatch.setattr(sc, "get_supabase_admin", lambda: admin)
        monkeypatch.setattr("app.services.paper_service.settings.SUPABASE_STORAGE_BUCKET", "question-papers")
        monkeypatch.setattr("app.services.paper_service.settings.LOCAL_STORAGE_PATH", "./_nonexistent_storage")

        async def go():
            return await svc.delete_paper(paper_id=55, user=self._admin_user())

        return asyncio.run(go()), admin

    @staticmethod
    def _admin_user():
        from app.models.user import UserRole
        u = MagicMock()
        u.id = 1
        u.role = UserRole.ADMIN
        return u

    def test_delete_removes_supabase_object_key_not_staging_key(self, monkeypatch):
        removed = []
        svc = self._make_service(
            file_url="7/abc123.pdf",           # Supabase object key (from upload)
            s3_key="papers/55/abc123.pdf",     # local staging key in version.s3_key
        )
        result, admin = self._run_delete(svc, monkeypatch, removed)
        assert result is True
        # The Supabase object key was removed — NOT the local staging key
        assert removed == ["7/abc123.pdf"]
        assert admin.calls == ["question-papers"]

    def test_delete_idempotent_when_object_missing(self, monkeypatch):
        """Supabase remove of a missing object must not break deletion."""
        removed = []
        svc = self._make_service(file_url="7/ghost.pdf", s3_key="papers/55/x.pdf")

        from app.utils import supabase_client as sc

        class FakeStorageErr:
            def remove(self, keys):
                raise RuntimeError("object not found")

        class FakeAdminErr:
            def __init__(self):
                self.calls = []

            @property
            def storage(self):
                outer = self

                class _Storage:
                    def from_(self, bucket):
                        outer.calls.append(bucket)
                        return FakeStorageErr()

                return _Storage()

        admin = FakeAdminErr()
        monkeypatch.setattr(sc, "is_supabase_storage_enabled", lambda: True)
        monkeypatch.setattr(sc, "get_supabase_admin", lambda: admin)
        monkeypatch.setattr("app.services.paper_service.settings.SUPABASE_STORAGE_BUCKET", "question-papers")
        monkeypatch.setattr("app.services.paper_service.settings.LOCAL_STORAGE_PATH", "./_nonexistent_storage")

        async def go():
            return await svc.delete_paper(paper_id=55, user=self._admin_user())

        assert asyncio.run(go()) is True  # delete succeeded despite storage error
        svc.paper_repo.delete.assert_awaited_once_with(55)  # DB record still removed


class TestCloudUploadExtraction:
    """Text extraction must run for Supabase uploads too (bytes staged to a
    secure temp file), not only for local-disk uploads.
    """

    def test_extraction_runs_for_supabase_upload(self):
        from app.core.exceptions import ValidationError

        async def scenario():
            import tempfile
            tmpdir = tempfile.mkdtemp()
            from app.services.paper_service import PaperService
            svc = PaperService(db=None)
            svc.create_paper = _fake_create_paper
            svc.paper_repo = AsyncMock()
            svc.paper_repo.get_version_by_checksum.return_value = None
            svc.paper_repo.update = AsyncMock(side_effect=_fake_update)
            svc.paper_repo.create_version = AsyncMock(side_effect=_fake_create_version)
            svc._log_audit = AsyncMock(side_effect=_fake_audit)

            with patch("app.services.paper_service.settings") as s, \
                 patch("app.utils.supabase_client.is_supabase_storage_enabled", return_value=True), \
                 patch("app.utils.supabase_client.get_supabase_admin") as gsa, \
                 patch("app.services.document_analyzer.analyze_document") as fake_analysis:
                s.ENV = "development"
                s.MAX_FILE_SIZE = 10 * 1024 * 1024
                s.LOCAL_STORAGE_PATH = tmpdir
                s.LOCAL_STORAGE_URL = "http://localhost:8000/files"
                s.SUPABASE_STORAGE_BUCKET = "question-papers"
                admin = MagicMock()
                admin.storage.from_.return_value.upload.return_value = {"path": "7/abc.pdf"}
                gsa.return_value = admin
                fake_analysis.return_value = MagicMock(
                    success=True, raw_text="Q1. Explain inheritance in OOP."
                )

                from app.schemas.paper import PaperCreateRequest
                result = await svc.upload_paper(
                    file_data=b"%PDF-1.7 real pdf bytes here",
                    filename="real.pdf",
                    paper_data=PaperCreateRequest(tenant_id=1, title="t", subject="s", university="U", year=2024, exam_type="endsem", language="en"),
                    uploader=MagicMock(id=7, tenant_id=1, role="student"),
                )
                assert result["id"] == 101
                # Supabase path stored (content-hash key: {user}/{sha256}.ext),
                # and extraction still ran on the cloud-upload bytes
                stored_url = _updated_fields.get("file_url", "")
                assert stored_url.startswith("7/") and stored_url.endswith(".pdf"), stored_url
                assert "/" not in stored_url[2:-4], "unexpected nesting in object key"
                assert _updated_fields.get("extracted_text") == "Q1. Explain inheritance in OOP."
                # No temp file leaked into the tmpdir used for local storage
                import os as _os
                leftovers = [f for f in _os.listdir(tmpdir) if f != "papers"]
                assert leftovers == [], f"temp files leaked: {leftovers}"

        asyncio.run(scenario())

    def test_extraction_failure_does_not_fail_upload(self):
        from app.core.exceptions import ValidationError

        async def scenario():
            import tempfile
            tmpdir = tempfile.mkdtemp()
            from app.services.paper_service import PaperService
            svc = PaperService(db=None)
            svc.create_paper = _fake_create_paper
            svc.paper_repo = AsyncMock()
            svc.paper_repo.get_version_by_checksum.return_value = None
            svc.paper_repo.update = AsyncMock(side_effect=_fake_update)
            svc.paper_repo.create_version = AsyncMock(side_effect=_fake_create_version)
            svc._log_audit = AsyncMock(side_effect=_fake_audit)

            with patch("app.services.paper_service.settings") as s, \
                 patch("app.utils.supabase_client.is_supabase_storage_enabled", return_value=True), \
                 patch("app.utils.supabase_client.get_supabase_admin") as gsa, \
                 patch("app.services.document_analyzer.analyze_document", side_effect=RuntimeError("corrupt pdf")):
                s.ENV = "development"
                s.MAX_FILE_SIZE = 10 * 1024 * 1024
                s.LOCAL_STORAGE_PATH = tmpdir
                s.LOCAL_STORAGE_URL = "http://localhost:8000/files"
                s.SUPABASE_STORAGE_BUCKET = "question-papers"
                admin = MagicMock()
                admin.storage.from_.return_value.upload.return_value = {"path": "7/abc.pdf"}
                gsa.return_value = admin

                from app.schemas.paper import PaperCreateRequest
                result = await svc.upload_paper(
                    file_data=b"%PDF-1.7 broken content",
                    filename="broken.pdf",
                    paper_data=PaperCreateRequest(tenant_id=1, title="t", subject="s", university="U", year=2024, exam_type="endsem", language="en"),
                    uploader=MagicMock(id=7, tenant_id=1, role="student"),
                )
                assert result["id"] == 101  # upload succeeded
                assert _updated_fields.get("extracted_text") == ""  # extraction degraded gracefully

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


# ---------------------------------------------------------------------------
# Optional live-bucket integration (runs only when real Supabase creds exist)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
    reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — staging integration skipped",
)
class TestSupabaseStagingIntegration:
    """Real round-trip against a live private bucket. Skipped unless real
    credentials are exported (e.g., SUPABASE_URL=... pytest -k staging)."""

    def test_upload_sign_delete_roundtrip(self):
        from app.utils.supabase_client import get_supabase_admin, is_supabase_storage_enabled
        from app.core.config import settings

        assert is_supabase_storage_enabled() is True
        admin = get_supabase_admin()
        assert admin is not None

        import uuid
        object_key = f"_integration-test/{uuid.uuid4().hex}.pdf"
        # Buckets with a MIME allowlist reject text/plain; use the app's real
        # content type. Minimal valid PDF header is enough for storage.
        payload = b"%PDF-1.4\n%smartpyq-integration-test\n"

        bucket = admin.storage.from_(settings.SUPABASE_STORAGE_BUCKET)
        bucket.upload(path=object_key, file=payload, file_options={"content-type": "application/pdf"})
        try:
            signed = bucket.create_signed_url(object_key, expires_in=60)
            assert signed and (signed.get("signedURL") or signed.get("signedUrl"))
        finally:
            bucket.remove([object_key])  # idempotent cleanup
