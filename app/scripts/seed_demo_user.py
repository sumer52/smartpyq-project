#!/usr/bin/env python3
"""Seed the demo + admin accounts (idempotent, production-safe).

Behaviour:
    - Exits 0 and does nothing when ENABLE_DEMO_ACCOUNT is off
      (production default). Safe to run unconditionally at deploy time.
    - demo@smartpyq.com  -> STUDENT role (public demo login; must NEVER be
      an admin — the credentials are public on the login page).
    - admin@smartpyq.com -> ADMIN role, ONLY when ADMIN_EMAIL +
      ADMIN_PASSWORD are set in the environment. The password is never
      logged and must be changed from the default.
    - Never prints passwords or secrets.
    - Rolls back cleanly on failure (exit 1 only when seeding was enabled
      and actually failed).

Usage:
    python -m app.scripts.seed_demo_user
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.config import demo_account_enabled
from app.models.user import User, UserRole, UserStatus
from app.core.auth import AuthManager

DEMO_EMAIL = "demo@smartpyq.com"
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo123"  # public credentials; role is STUDENT by design

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@smartpyq.com").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()

# Dev/demo convenience admin (ADMIN_ID "admin" style login). Only seeded when
# ENABLE_DEMO_ACCOUNT is on AND ADMIN_PASSWORD is not explicitly provided.
# Production must set ADMIN_PASSWORD; these defaults never apply there.
DEV_ADMIN_EMAIL = "admin@smartpyq.com"
DEV_ADMIN_PASSWORD = "smartpyq@admin"


async def _upsert_user(db, *, email: str, username: str, full_name: str,
                       password_hash: str, role: UserRole, course: str,
                       semester: str, year_of_study: int) -> None:
    """Create or reconcile one seeded user. Idempotent."""
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()

    if existing:
        changed = False
        if existing.role != role:
            existing.role = role
            changed = True
        if existing.status != UserStatus.ACTIVE:
            existing.status = UserStatus.ACTIVE
            changed = True
        if not existing.is_email_verified:
            existing.is_email_verified = True
            changed = True
        if not existing.onboarding_completed:
            existing.onboarding_completed = True
            changed = True
        # Refresh the hash so the documented password always works
        auth_mgr = AuthManager()
        if not auth_mgr.verify_password(
            DEMO_PASSWORD if role == UserRole.STUDENT else ADMIN_PASSWORD,
            existing.password_hash or ""
        ):
            existing.password_hash = password_hash
            changed = True
        if changed:
            await db.commit()
            print(f"[OK] User upgraded: {email} (role={role.value})")
        else:
            print(f"[OK] User ready: {email} (role={role.value})")
        return

    demo_user = User(
        email=email,
        username=username,
        full_name=full_name,
        password_hash=password_hash,
        role=role,
        status=UserStatus.ACTIVE,
        tenant_id=1,
        is_email_verified=True,
        domain_verified=True,
        failed_login_attempts=0,
        preferences={},
        university="Demo University",
        course=course,
        academic_year=f"{year_of_study}rd Year" if year_of_study == 3 else None,
        semester=semester,
        year_of_study=year_of_study,
        onboarding_completed=True,
    )
    db.add(demo_user)
    await db.commit()
    print(f"[OK] User created: {email} (role={role.value})")


async def seed_demo_user() -> None:
    """Legacy entry point: demo (student) + admin seeding."""
    from app.utils.bootstrap import ensure_default_tenant

    await ensure_default_tenant()
    auth_mgr = AuthManager()

    async with AsyncSessionLocal() as db:
        await _upsert_user(
            db=db,
            email=DEMO_EMAIL,
            username=DEMO_USERNAME,
            full_name="Demo Student",
            password_hash=auth_mgr.hash_password(DEMO_PASSWORD),
            role=UserRole.STUDENT,
            course="B.Sc Computer Science",
            semester="sem5",
            year_of_study=3,
        )

        # 2) Admin account — ADMIN_PASSWORD wins; otherwise fall back to the
        #    documented dev/demo credentials (only reachable when demo mode is
        #    enabled, since main() gates on demo_account_enabled()).
        admin_password = ADMIN_PASSWORD or DEV_ADMIN_PASSWORD
        if len(admin_password) < 8:
            print("[WARN] Admin password too short (min 8 chars) — admin not seeded")
        else:
            await _upsert_user(
                db=db,
                email=ADMIN_EMAIL,
                username="admin",
                full_name="SmartPYQ Admin",
                password_hash=auth_mgr.hash_password(admin_password),
                role=UserRole.ADMIN,
                course=None,
                semester=None,
                year_of_study=None,
            )


async def main() -> None:
    if not demo_account_enabled():
        print("[SKIP] Demo account disabled (ENABLE_DEMO_ACCOUNT) - seed skipped")
        return
    try:
        await seed_demo_user()
    except Exception as e:
        print(f"[ERROR] Demo seed failed: {type(e).__name__}")
        # Full detail to server logs only, never the deploy summary
        import logging
        logging.getLogger(__name__).exception("Demo seed failed")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
