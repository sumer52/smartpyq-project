#!/usr/bin/env python3
"""Seed the demo account (idempotent, production-safe).

Behaviour:
    - Exits 0 and does nothing when ENABLE_DEMO_ACCOUNT is off
      (production default). Safe to run unconditionally at deploy time.
    - Creates or upgrades the demo user with the CURRENT User model
      (no legacy fields).
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
DEMO_PASSWORD = "demo123"  # only used in-memory / hashed; never logged


async def seed_demo_user() -> None:
    """Create or upgrade the demo user with current-model fields."""
    auth_mgr = AuthManager()
    password_hash = auth_mgr.hash_password(DEMO_PASSWORD)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == DEMO_EMAIL))
        existing = result.scalar_one_or_none()

        if existing:
            changed = False
            if existing.role != UserRole.SUPER_ADMIN:
                existing.role = UserRole.SUPER_ADMIN
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
            # Refresh the hash so the documented demo password always works
            if not auth_mgr.verify_password(DEMO_PASSWORD, existing.password_hash or ""):
                existing.password_hash = password_hash
                changed = True
            if changed:
                await db.commit()
                print(f"[OK] Demo user upgraded: {DEMO_EMAIL}")
            else:
                print(f"[OK] Demo user ready: {DEMO_EMAIL}")
        else:
            demo_user = User(
                email=DEMO_EMAIL,
                username=DEMO_USERNAME,
                full_name="Demo Student",
                password_hash=password_hash,
                role=UserRole.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
                tenant_id=1,
                is_email_verified=True,
                domain_verified=True,
                failed_login_attempts=0,
                preferences={},
                university="Demo University",
                course="B.Sc Computer Science",
                specialization="mscs",
                academic_year="3rd Year",
                semester="sem5",
                year_of_study=3,
                onboarding_completed=True,
            )
            db.add(demo_user)
            await db.commit()
            print(f"[OK] Demo user created: {DEMO_EMAIL}")


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
