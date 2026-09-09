"""Supabase client for backend operations.

Provides a server-side Supabase client using the service role key
for database operations and file storage management.

Gracefully returns None if Supabase is not configured,
allowing the app to fall back to local SQLite/storage.
"""

import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Lazy-initialized clients
_supabase_client = None
_supabase_admin_client = None


def _get_anon_key():
    """Get the anon/publishable key, supporting both naming conventions."""
    return settings.SUPABASE_ANON_KEY or settings.SUPABASE_PUBLISHABLE_KEY


def _get_service_key():
    """Get the service role/secret key, supporting both naming conventions."""
    return settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_SECRET_KEY


def get_supabase_client():
    """Get the Supabase client using the anon/publishable key.
    
    Returns None if Supabase is not configured.
    """
    global _supabase_client
    
    anon_key = _get_anon_key()
    if not settings.SUPABASE_URL or not anon_key:
        return None
    
    if _supabase_client is not None:
        return _supabase_client
    
    try:
        from supabase import create_client
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            anon_key
        )
        logger.info("Supabase client initialized (anon/publishable key)")
        return _supabase_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        return None


def get_supabase_admin():
    """Get the Supabase admin client using the service role/secret key.
    
    Use this for server-side operations that bypass RLS.
    Returns None if Supabase is not configured.
    """
    global _supabase_admin_client
    
    service_key = _get_service_key()
    if not settings.SUPABASE_URL or not service_key:
        return None
    
    if _supabase_admin_client is not None:
        return _supabase_admin_client
    
    try:
        from supabase import create_client
        _supabase_admin_client = create_client(
            settings.SUPABASE_URL,
            service_key
        )
        logger.info("Supabase admin client initialized (service role/secret key)")
        return _supabase_admin_client
    except Exception as e:
        logger.error(f"Failed to initialize Supabase admin client: {e}")
        return None


def is_supabase_configured() -> bool:
    """Check if Supabase is fully configured."""
    return bool(
        settings.SUPABASE_URL
        and _get_anon_key()
    )


def is_supabase_storage_enabled() -> bool:
    """Check if Supabase Storage should be used for file uploads.

    Requires ALL of:
      - USE_SUPABASE_STORAGE=true
      - SUPABASE_URL
      - SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY (server-side only)

    The anon/publishable key alone is NOT sufficient for private-bucket
    uploads — never claim storage is configured without the service key.
    """
    return bool(
        settings.USE_SUPABASE_STORAGE
        and settings.SUPABASE_URL
        and _get_service_key()
    )
