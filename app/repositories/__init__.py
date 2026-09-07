"""Repository layer for data access operations.

This module provides repository classes for all database entities,
following the repository pattern for clean separation of concerns.
"""

from app.repositories.base_repository import BaseRepository
from app.repositories.user_repository import UserRepository
from app.repositories.tenant_repository import TenantRepository
from app.repositories.paper_repository import PaperRepository
from app.repositories.chat_repository import ChatRepository, ChatMessageRepository
from app.repositories.feature_repository import FeatureRepository
from app.repositories.audit_log_repository import AuditLogRepository

__all__ = [
    # Base repository
    "BaseRepository",
    
    # Entity repositories
    "UserRepository",
    "TenantRepository",
    "PaperRepository",
    "ChatRepository",
    "ChatMessageRepository",
    "FeatureRepository",
    "AuditLogRepository",
]