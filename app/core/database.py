"""Database configuration and session management.

SQLAlchemy async setup with PostgreSQL for production-ready database operations.
"""

import logging
from typing import AsyncGenerator

from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import NullPool

from app.core.config import derived_settings, settings

logger = logging.getLogger(__name__)

# Database engine configuration
db_url = derived_settings.database_url_async
engine_kwargs = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,  # Verify connections before use
    "pool_recycle": 3600,   # Recycle connections after 1 hour
    "pool_timeout": 30,     # Wait max 30s for connection from pool
}

# Configure based on database type
if "sqlite" in db_url:
    # SQLite-specific settings (development/testing)
    engine_kwargs["connect_args"] = {"timeout": 10, "check_same_thread": False}
elif "postgresql" in db_url:
    # PostgreSQL-specific settings (production)
    engine_kwargs["pool_size"] = 20
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["connect_args"] = {
        "command_timeout": 30,  # Query timeout
        "timeout": 10,          # Connection timeout
    }
else:
    # Default async settings
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

if settings.ENV == "test":
    engine_kwargs["poolclass"] = NullPool
    engine_kwargs.pop("pool_size", None)
    engine_kwargs.pop("max_overflow", None)

try:
    engine = create_async_engine(db_url, **engine_kwargs)
except Exception as e:
    logger.warning(f"Could not create database engine: {e}")
    engine = None

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False
)

# Base class for models
metadata = MetaData(
    naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s"
    }
)

Base = declarative_base(metadata=metadata)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to get database session.
    
    Yields:
        AsyncSession: Database session
    """
    from fastapi import HTTPException
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except HTTPException:
            # Don't catch HTTP exceptions - let them pass through
            raise
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()

# Alias for backward compatibility
get_db_session = get_db