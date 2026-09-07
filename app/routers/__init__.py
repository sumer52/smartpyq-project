"""API Routers Package

This package contains all API route handlers organized by domain.
"""

from .auth import router as auth_router
from .papers import router as papers_router
from .chat import router as chat_router
from .features import router as features_router
from .admin import router as admin_router

__all__ = [
    "auth_router",
    "papers_router", 
    "chat_router",
    "features_router",
    "admin_router"
]