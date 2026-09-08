#!/usr/bin/env python3
"""Seed demo admin user for testing.

Creates a super_admin user: sumer@edu.in / demo123

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
from app.models.user import User, UserRole, UserStatus
from app.core.auth import AuthManager


async def seed_demo_user():
    """Create the demo admin user."""
    async with AsyncSessionLocal() as db:
        # Check if user already exists
        query = select(User).where(User.email == "sumer@edu.in")
        result = await db.execute(query)
        existing = result.scalar_one_or_none()

        if existing:
            # Update to super_admin if not already
            if str(existing.role) != "super_admin" and not hasattr(existing.role, 'value') or str(existing.role) != "super_admin":
                from app.models.user import UserRole
                existing.role = UserRole.SUPER_ADMIN
                existing.onboarding_completed = True
                await db.commit()
                print(f"[OK] Updated {existing.email} to super_admin")
            else:
                print(f"[OK] Demo user ready: {existing.email} (role={existing.role})")
            return existing

        # Create demo admin user
        auth_mgr = AuthManager()
        password_hash = auth_mgr.hash_password("demo123")

        demo_user = User(
            email="sumer@edu.in",
            username="sumer",
            full_name="Demo User",
            password_hash=password_hash,
            role=UserRole.SUPER_ADMIN,
            status=UserStatus.ACTIVE,
            tenant_id=1,
            is_email_verified=True,
            domain_verified=True,
            failed_login_attempts=0,
            preferences={},
            course="B.Sc Computer Science",
            specialization="mscs",
            academic_year="3rd Year",
            semester="sem3",
            onboarding_completed=True,
        )

        db.add(demo_user)
        await db.flush()
        await db.refresh(demo_user)

        print(f"✅ Demo user created: {demo_user.email}")
        print(f"   ID: {demo_user.id}")
        print(f"   Role: {demo_user.role}")
        print(f"   Password: demo123")
        print(f"\nNow you can login with:")
        print(f"   Email: sumer@edu.in")
        print(f"   Password: demo123")

        await db.commit()
        return demo_user


async def main():
    try:
        await seed_demo_user()
    except Exception as e:
        print(f"[ERROR] Error creating demo user: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
