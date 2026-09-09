#!/usr/bin/env python3
"""Seed demo admin users for testing.

Creates/upgrades two super_admin demo accounts (idempotent):
    demo@smartpyq.com / demo123   <- used by the frontend "Demo Login"
    sumer@edu.in       / demo123   <- legacy demo account

Usage:
    python -m app.scripts.seed_demo_user
    OR
    python app/scripts/seed_demo_user.py
"""

import asyncio
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.config import demo_account_enabled
from app.models.user import User, UserRole, UserStatus
from app.core.auth import AuthManager

DEMO_ACCOUNTS = [
    {
        "email": "demo@smartpyq.com",
        "username": "demo",
        "full_name": "Demo Student",
        "course": "B.Sc Computer Science",
        "specialization": "mscs",
        "semester": "sem5",
    },
    {
        "email": "sumer@edu.in",
        "username": "sumer",
        "full_name": "Demo User",
        "course": "B.Sc Computer Science",
        "specialization": "mscs",
        "semester": "sem3",
    },
]

DEMO_PASSWORD = "demo123"


async def seed_demo_users():
    """Create or upgrade the demo admin users."""
    auth_mgr = AuthManager()
    password_hash = auth_mgr.hash_password(DEMO_PASSWORD)

    async with AsyncSessionLocal() as db:
        for account in DEMO_ACCOUNTS:
            query = select(User).where(User.email == account["email"])
            result = await db.execute(query)
            existing = result.scalar_one_or_none()

            if existing:
                changed = False
                if str(existing.role.value if hasattr(existing.role, "value") else existing.role) != "super_admin":
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
                if changed:
                    await db.flush()
                    print(f"[OK] Updated {existing.email} to super_admin (active + verified)")
                else:
                    print(f"[OK] Demo user ready: {existing.email} (role={existing.role})")
            else:
                demo_user = User(
                    email=account["email"],
                    username=account["username"],
                    full_name=account["full_name"],
                    password_hash=password_hash,
                    role=UserRole.SUPER_ADMIN,
                    status=UserStatus.ACTIVE,
                    tenant_id=1,
                    is_email_verified=True,
                    domain_verified=True,
                    failed_login_attempts=0,
                    preferences={},
                    course=account["course"],
                    specialization=account["specialization"],
                    academic_year="3rd Year",
                    semester=account["semester"],
                    onboarding_completed=True,
                )
                db.add(demo_user)
                await db.flush()
                print(f"[OK] Demo user created: {demo_user.email} (role={demo_user.role})")

        await db.commit()
        print(f"\nDemo login -> email: demo@smartpyq.com  password: {DEMO_PASSWORD}")


async def main():
    if not demo_account_enabled():
        print("[SKIP] ENABLE_DEMO_ACCOUNT is off - demo seeding skipped (production default)")
        return
    try:
        await seed_demo_users()
    except Exception as e:
        print(f"[ERROR] Error seeding demo users: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
