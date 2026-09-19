"""One-time data bootstrap that must exist before anything else runs.

Production databases start empty; users and papers carry
``tenant_id`` foreign keys, so a default tenant row has to exist
before seeding accounts or content.
"""

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.tenant import Tenant


async def ensure_default_tenant() -> int:
    """Return the id of the default tenant, creating it when absent.

    Idempotent and race-tolerant: a concurrent creation raises
    IntegrityError on the unique slug, which we swallow after
    re-reading the row.
    """
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).order_by(Tenant.id).limit(1))).scalars().first()
        if tenant:
            return tenant.id
        tenant = Tenant(
            name="SmartPYQ",
            slug="smartpyq",
            access_code_hash="bootstrap",
            is_active=True,
            allowed_domains=[],
        )
        db.add(tenant)
        try:
            await db.commit()
            await db.refresh(tenant)
            return tenant.id
        except Exception:
            await db.rollback()
            existing = (await db.execute(select(Tenant).order_by(Tenant.id).limit(1))).scalars().first()
            if existing:
                return existing.id
            raise
