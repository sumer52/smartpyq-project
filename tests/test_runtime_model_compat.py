"""Runtime model compatibility against the migrated schema.

Runs the real alembic chain to head on SQLite, then exercises the actual
ORM operations that failed in production:
- create user (all current-model columns)
- query user by email
- update profile
- hash + verify password (login path)
- create paper (reconciled columns)
- query papers
"""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./_runtime_test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-for-pytest-only-0123456789abcdef")
os.environ.setdefault("ENV", "test")


@pytest.fixture(scope="module")
def migrated_db():
    """Migrate a scratch DB to head, rebind the app engine to it, clean up."""
    db_path = "./_runtime_test.db"
    if os.path.exists(db_path):
        os.remove(db_path)
    url = f"sqlite+aiosqlite:///{db_path}"

    from alembic import command
    from alembic.config import Config
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import settings as app_settings
    from app.core import database as app_database
    app_settings.DATABASE_URL = url

    # Rebind the app's engine/session factory (created at first import with
    # whatever DATABASE_URL was set then) to the scratch DB.
    from sqlalchemy.ext.asyncio import async_sessionmaker
    scratch_engine = create_async_engine(url, poolclass=__import__("sqlalchemy").pool.NullPool)
    original_engine = app_database.engine
    original_sessionlocal = app_database.AsyncSessionLocal
    app_database.engine = scratch_engine
    app_database.AsyncSessionLocal = async_sessionmaker(
        bind=scratch_engine, expire_on_commit=False
    )

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)

    # Build the 002 shape (same statements as test_schema_consistency)
    from tests.test_schema_consistency import _SQLITE_002_SCHEMA

    async def seed():
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            for stmt in _SQLITE_002_SCHEMA:
                await conn.execute(text(stmt))
            await conn.execute(text(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
            ))
            await conn.execute(text("INSERT INTO alembic_version VALUES ('002')"))
        await engine.dispose()

    asyncio.run(seed())
    command.upgrade(cfg, "head")
    yield url
    # Restore original bindings and dispose the scratch engine
    app_database.engine = original_engine
    app_database.AsyncSessionLocal = original_sessionlocal
    asyncio.run(scratch_engine.dispose())
    try:
        os.remove(db_path)
    except OSError:
        pass  # Windows may hold the file briefly; temp file cleans up later


def _run(coro):
    return asyncio.run(coro)


class TestRuntimeModelCompat:
    def test_user_crud_current_model(self, migrated_db):
        """Create/select/update a User with every current-model column set."""
        from app.core.database import AsyncSessionLocal
        from app.models.user import User, UserRole, UserStatus
        from sqlalchemy import select

        async def scenario():
            async with AsyncSessionLocal() as db:
                user = User(
                    email="runtime@test.com",
                    username="runtimeuser",
                    full_name="Runtime Tester",
                    password_hash="argon2$fake$hash",
                    role=UserRole.STUDENT,
                    status=UserStatus.ACTIVE,
                    tenant_id=1,
                    is_email_verified=True,
                    domain_verified=False,
                    failed_login_attempts=0,
                    preferences={"theme": "dark"},
                    university="Runtime University",
                    course="B.Tech",
                    specialization="cse",
                    academic_year="2nd Year",
                    semester="sem3",
                    year_of_study=2,
                    onboarding_completed=True,
                    google_id=None,
                    github_id=None,
                )
                db.add(user)
                await db.commit()

                got = (await db.execute(
                    select(User).where(User.email == "runtime@test.com")
                )).scalar_one()
                assert got.username == "runtimeuser"
                assert got.status == UserStatus.ACTIVE
                assert got.preferences == {"theme": "dark"}

                got.university = "Updated University"
                got.semester = "sem4"
                await db.commit()

                got2 = (await db.execute(
                    select(User).where(User.email == "runtime@test.com")
                )).scalar_one()
                assert got2.university == "Updated University"
                assert got2.is_admin is False
                return got2.id

        uid = _run(scenario())
        assert uid is not None

    def test_login_password_hash_path(self, migrated_db):
        from app.core.auth import AuthManager
        from app.core.database import AsyncSessionLocal
        from app.models.user import User, UserRole, UserStatus
        from sqlalchemy import select

        mgr = AuthManager()

        async def scenario():
            async with AsyncSessionLocal() as db:
                user = User(
                    email="login@test.com",
                    username="loginuser",
                    full_name="Login User",
                    password_hash=mgr.hash_password("S3curePass!"),
                    role=UserRole.STUDENT,
                    status=UserStatus.ACTIVE,
                    tenant_id=1,
                    failed_login_attempts=0,
                    preferences={},
                )
                db.add(user)
                await db.commit()
                got = (await db.execute(
                    select(User).where(User.email == "login@test.com")
                )).scalar_one()
                return got.password_hash

        h = _run(scenario())
        assert mgr.verify_password("S3curePass!", h)
        assert not mgr.verify_password("wrong", h)

    def test_paper_crud_reconciled_columns(self, migrated_db):
        from app.core.database import AsyncSessionLocal
        from app.models.paper import Paper
        from app.models.user import User, UserRole, UserStatus
        from sqlalchemy import select, func

        async def scenario():
            async with AsyncSessionLocal() as db:
                # uploader (FK target)
                uploader = User(
                    email="paperuploader@test.com", username="paperup",
                    full_name="Paper Uploader", password_hash="x",
                    role=UserRole.STUDENT, status=UserStatus.ACTIVE,
                    tenant_id=1, failed_login_attempts=0, preferences={},
                )
                db.add(uploader)
                await db.flush()

                paper = Paper(
                    title="Runtime Paper",
                    subject="Physics",
                    university="Runtime University",
                    stream="science",
                    specialization="physics",
                    year=2024,
                    semester="sem1",
                    exam_type="FINAL",
                    max_marks=100,
                    tags=[],
                    file_url="papers/1/abc.pdf",
                    file_name="abc.pdf",
                    file_size=12345,
                    file_type="application/pdf",
                    extracted_text="Q1 what is force",
                    processing_status="UPLOADED",
                    status="APPROVED",
                    moderation_notes=None,
                    tenant_id=1,
                    uploader_id=uploader.id,
                )
                db.add(paper)
                await db.commit()

                got = (await db.execute(
                    select(Paper).where(Paper.title == "Runtime Paper")
                )).scalar_one()
                assert got.max_marks == 100
                assert got.processing_status == "UPLOADED"
                assert got.specialization == "physics"

                cnt = (await db.execute(
                    select(func.count(Paper.id))
                )).scalar()
                return cnt

        cnt = _run(scenario())
        assert cnt >= 1

    def test_seed_demo_user_runs_against_schema(self, migrated_db):
        """The repaired seed script must succeed against the migrated schema."""
        from app.scripts import seed_demo_user as seed_mod

        _run(seed_mod.seed_demo_user())
        # Idempotent: run again, no error, still one demo row
        _run(seed_mod.seed_demo_user())

        from app.core.database import AsyncSessionLocal
        from app.models.user import User
        from sqlalchemy import select, func

        async def count():
            async with AsyncSessionLocal() as db:
                return (await db.execute(
                    select(func.count(User.id)).where(User.email == "demo@smartpyq.com")
                )).scalar()

        assert _run(count()) == 1
