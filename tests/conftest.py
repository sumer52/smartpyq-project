"""
Test configuration and shared fixtures for SmartPYQ backend tests.

Uses an in-memory SQLite database for isolated, fast test execution.
"""

import asyncio
import io
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.database import Base, get_db
from app.core.auth import AuthManager
from app.models.user import User, UserRole, UserStatus
from app.models.tenant import Tenant
from app.models.paper import Paper, PaperStatus, ExamType, ProcessingStatus
from app.models.question import (
    Question, QuestionGroup, QuestionGroupMember,
    AnalysisResult, AnalysisStatus, SimilarityMethod,
)
from app.models.bookmark import Bookmark
from app.main import app

# Remove TrustedHostMiddleware so test requests with host="testserver" work
from fastapi.middleware.trustedhost import TrustedHostMiddleware
app.middleware_stack = None
app.user_middleware = [
    item for item in app.user_middleware
    if not (hasattr(item, "cls") and item.cls == TrustedHostMiddleware)
]
app.middleware_stack = None


# ---------------------------------------------------------------------------
# Event loop
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# Database fixtures (in-memory SQLite)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def db_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine):
    session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
        await session.rollback()


# ---------------------------------------------------------------------------
# FastAPI test client
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="function")
async def client(db_engine):
    # Reset the process-global TTL cache so results from a previous test
    # (with a different in-memory DB) cannot leak into this one.
    from app.utils.cache import app_cache
    app_cache.clear()
    session_factory = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tenant fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def tenant(db_session):
    auth = AuthManager()
    tenant = Tenant(
        name="Test University",
        slug="test-university",
        access_code_hash=auth.hash_password("TESTCODE123"),
        is_active=True,
        allowed_domains=["test.edu"],
    )
    db_session.add(tenant)
    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def test_user(db_session, tenant):
    auth = AuthManager()
    user = User(
        email="testuser@test.edu",
        username="testuser",
        full_name="Test User",
        password_hash=auth.hash_password("SecurePass123!"),
        role=UserRole.STUDENT,
        status=UserStatus.ACTIVE,
        tenant_id=tenant.id,
        is_email_verified=True,
        domain_verified=False,
        failed_login_attempts=0,
        preferences={},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session, tenant):
    auth = AuthManager()
    user = User(
        email="admin@test.edu",
        username="admin",
        full_name="Admin User",
        password_hash=auth.hash_password("AdminPass123!"),
        role=UserRole.ADMIN,
        status=UserStatus.ACTIVE,
        tenant_id=tenant.id,
        is_email_verified=True,
        domain_verified=True,
        failed_login_attempts=0,
        preferences={},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Auth token helper
# ---------------------------------------------------------------------------

def make_token(user) -> str:
    """Generate a valid JWT access token for the given user."""
    auth = AuthManager()
    return auth.create_access_token(
        subject=user.email,
        user_id=user.id,
        role=user.role.value if hasattr(user.role, "value") else user.role,
        tenant_id=user.tenant_id,
    )


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


@pytest_asyncio.fixture
async def authed_client(client, test_user):
    """Client with a pre-authenticated student user."""
    token = make_token(test_user)
    client.headers.update(auth_headers(token))
    return client


@pytest_asyncio.fixture
async def admin_client(client, admin_user):
    """Client with a pre-authenticated admin user."""
    token = make_token(admin_user)
    client.headers.update(auth_headers(token))
    return client


# ---------------------------------------------------------------------------
# Paper fixture (in DB, no file on disk)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def sample_paper(db_session, test_user, tenant):
    paper = Paper(
        title="DBMS Final Exam 2024",
        subject="Database Management Systems",
        university="Test University",
        stream="bca",
        specialization="General",
        year=2024,
        semester="6",
        exam_type=ExamType.FINAL,
        status=PaperStatus.APPROVED,
        processing_status=ProcessingStatus.COMPLETED,
        tenant_id=tenant.id,
        uploader_id=test_user.id,
        file_url="/files/papers/1/test.pdf",
        file_name="test.pdf",
        file_size=1024,
        tags=["dbms", "database"],
        view_count=10,
        download_count=5,
    )
    db_session.add(paper)
    await db_session.commit()
    await db_session.refresh(paper)
    return paper


@pytest_asyncio.fixture
async def sample_question(db_session, sample_paper):
    q = Question(
        paper_id=sample_paper.id,
        question_number="Q1",
        question_text="Explain normalization in DBMS.",
        original_question_text="Explain normalization in DBMS.",
        normalized_question_text="explain normalization in dbms",
        section="Part A",
        marks=10,
        question_type="descriptive",
        subject="Database Management Systems",
    )
    db_session.add(q)
    await db_session.commit()
    await db_session.refresh(q)
    return q


@pytest_asyncio.fixture
async def sample_question_group(db_session, sample_question):
    g = QuestionGroup(
        representative_text="Explain normalization in DBMS.",
        normalized_text="explain normalization in dbms",
        subject="Database Management Systems",
        frequency=3,
        similarity_method=SimilarityMethod.EXACT,
        confidence=1.0,
    )
    db_session.add(g)
    await db_session.commit()
    await db_session.refresh(g)

    m = QuestionGroupMember(
        question_id=sample_question.id,
        group_id=g.id,
        similarity_score=1.0,
        is_exact_match=True,
    )
    db_session.add(m)
    await db_session.commit()
    return g


# ---------------------------------------------------------------------------
# Helper: create a tiny in-memory PDF
# ---------------------------------------------------------------------------

def make_pdf_bytes(title: str = "Test PDF") -> bytes:
    """Return a minimal valid PDF as bytes."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R"
        b"/Resources<</Font<</F1 4 0 R>>>>>>endobj\n"
        b"4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"xref\n0 5\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000266 00000 n \n"
        b"trailer<</Size 5/Root 1 0 R>>\n"
        b"startxref\n345\n%%EOF\n"
    )
