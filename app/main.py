"""Smart PYQ FastAPI Application

A comprehensive platform for managing Previous Year Question papers
with AI-powered chatbot, multi-tenant support, and secure file management.
"""

import logging
from contextlib import asynccontextmanager


from fastapi import FastAPI, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .core.config import settings, validate_production_settings
from .core.database import get_db, AsyncSession
from .core.database import engine, Base
from .core.logging import setup_logging
from .middleware.error_handler import ErrorHandlerMiddleware
from .middleware.security import SecurityHeadersMiddleware
from .middleware.request_id import RequestIDMiddleware
from .routers import (
    auth_router,
    papers_router,
    chat_router,
    features_router,
    admin_router
)
from .routers.bookmarks import router as bookmarks_router
from .routers.metrics import router as metrics_router
from .routers.analysis import router as analysis_router

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events with graceful shutdown."""
    import asyncio
    import signal
    
    # Startup
    logger.info("Starting Smart PYQ application...")
    
    # Validate production settings (exits if critical issues found)
    validate_production_settings()
    
    # Database tables managed by Alembic migrations only.
    try:
        if engine is not None:
            async with engine.connect() as conn:
                import sqlalchemy as _sa
                result = await conn.execute(_sa.text("SELECT 1"))
                if result.scalar() == 1:
                    logger.info("Database connection verified")
        else:
            logger.warning("No database engine available")
    except Exception as e:
        logger.warning(f"Could not verify database connection: {e}")
    
    logger.info("Smart PYQ application started successfully")
    
    yield
    
    # Graceful shutdown
    logger.info("Initiating graceful shutdown...")
    
    # Set shutdown timeout
    shutdown_timeout = 30  # seconds
    
    try:
        # Dispose database connections
        if engine is not None:
            await asyncio.wait_for(engine.dispose(), timeout=10)
            logger.info("Database connections closed")
    except asyncio.TimeoutError:
        logger.warning("Database shutdown timed out")
    except Exception as e:
        logger.error(f"Error during database shutdown: {e}")
    
    logger.info("Smart PYQ application shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Smart PYQ API",
    description="A comprehensive platform for managing Previous Year Question papers with AI-powered features",
    version="1.0.0",
    docs_url="/docs" if settings.ENV == "development" else None,
    redoc_url="/redoc" if settings.ENV == "development" else None,
    lifespan=lifespan
)

# Add rate limiting middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Add request ID middleware (must be first to capture all requests)
app.add_middleware(RequestIDMiddleware)

# Add security middleware
app.add_middleware(SecurityHeadersMiddleware)

# Add error handling middleware
app.add_middleware(ErrorHandlerMiddleware)

# Add CORS middleware
# Ensure allow_origins is a list (not a comma-separated string)
cors_origins = settings.ALLOWED_ORIGINS
if isinstance(cors_origins, str):
    cors_origins = [o.strip() for o in cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

# Add trusted host middleware
if settings.ALLOWED_HOSTS:
    # In development, allow all hosts to avoid blocking frontend requests
    trusted_hosts = ["*"] if settings.ENV == "development" else settings.ALLOWED_HOSTS
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=trusted_hosts
    )


# Include API routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(papers_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(features_router, prefix="/api/v1")
app.include_router(bookmarks_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(metrics_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1/analysis")

# Health check endpoint (liveness)
@app.get("/health")
async def health_check():
    """Health check endpoint - confirms process is alive."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "environment": settings.ENV,
        "service": "smartpyq-api"
    }


# Readiness check endpoint
@app.get("/ready")
async def readiness_check():
    """Readiness check - confirms dependencies are reachable."""
    import time
    checks = {}
    overall_status = "ready"
    
    # Check database
    try:
        from app.core.database import engine
        if engine is not None:
            async with engine.connect() as conn:
                await conn.execute(__import__('sqlalchemy').text("SELECT 1"))
            checks["database"] = {"status": "healthy", "latency_ms": 0}
        else:
            checks["database"] = {"status": "unavailable"}
            overall_status = "not_ready"
    except Exception as e:
        checks["database"] = {"status": "unhealthy", "error": str(e)}
        overall_status = "not_ready"
    
    # Check Supabase Storage (optional)
    if settings.USE_SUPABASE_STORAGE and settings.SUPABASE_URL:
        try:
            from app.utils.supabase_client import get_supabase_admin_client
            client = get_supabase_admin_client()
            # Simple bucket check
            checks["storage"] = {"status": "configured", "provider": "supabase"}
        except Exception as e:
            checks["storage"] = {"status": "degraded", "error": str(e)}
            # Storage degradation is not critical for readiness
    else:
        checks["storage"] = {"status": "not_configured", "provider": "local"}
    
    response = {
        "status": overall_status,
        "version": "1.0.0",
        "environment": settings.ENV,
        "checks": checks
    }
    
    status_code = 200 if overall_status == "ready" else 503
    from fastapi.responses import JSONResponse
    return JSONResponse(content=response, status_code=status_code)


# Version endpoint
@app.get("/version")
async def version_info():
    """Version and build information."""
    import os
    git_commit = os.environ.get("GIT_COMMIT", "unknown")
    build_time = os.environ.get("BUILD_TIME", "unknown")
    
    return {
        "version": "1.0.0",
        "environment": settings.ENV,
        "git_commit": git_commit,
        "build_time": build_time,
        "service": "smartpyq-api"
    }

# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Smart PYQ API",
        "version": "1.0.0",
        "docs": "/docs" if settings.ENV == "development" else "Documentation not available in production",
        "health": "/health",
        "api_prefix": "/api/v1"
    }

from fastapi.responses import FileResponse
import os

@app.get("/files/{file_path:path}")
async def serve_file(file_path: str):
    """Serve uploaded files (PDF and images)"""
    import mimetypes
    # Check multiple storage paths
    storage_paths = [
        os.path.join(settings.LOCAL_STORAGE_PATH or "./storage", file_path),
        os.path.join("./uploads", file_path),
        os.path.join("./storage", file_path),
    ]
    for path in storage_paths:
        if os.path.exists(path):
            content_type, _ = mimetypes.guess_type(path)
            return FileResponse(path, media_type=content_type or "application/octet-stream")
    return {"error": "File not found"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENV == "development",
        log_level="info"
    )