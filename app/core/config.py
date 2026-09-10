"""Application configuration settings.

Centralized configuration management using Pydantic settings.
Loads configuration from environment variables with secure defaults.
"""

import os
from typing import List, Optional

from pydantic import validator
from dotenv import load_dotenv
# Production-safe precedence: real environment variables (Render) win over
# the local .env file. Never override live environment variables.
load_dotenv(override=False)
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Environment
    ENV: str = "development"
    DEBUG: bool = False
    PORT: int = 8080
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./smartpyq.db"
    
    # Security
    JWT_SECRET: str = ""
    JWT_ACCESS_EXPIRE_SECONDS: int = 86400  # 24 hours
    JWT_REFRESH_EXPIRE_SECONDS: int = 2592000  # 30 days
    JWT_ALGORITHM: str = "HS256"
    
    # Password hashing
    PASSWORD_HASH_ALGORITHM: str = "argon2"
    
    # CORS and Security
    ALLOWED_HOSTS: str = "localhost,127.0.0.1"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    
    # AI APIs
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    
    # Supabase
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_PUBLISHABLE_KEY: Optional[str] = None  # New naming convention
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_SECRET_KEY: Optional[str] = None        # New naming convention
    SUPABASE_JWKS_URL: Optional[str] = None
    SUPABASE_STORAGE_BUCKET: str = "question-papers"
    USE_SUPABASE_STORAGE: bool = False
    
    # File Storage
    FIREBASE_BUCKET: Optional[str] = None
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    STORAGE_BACKEND: str = "local"
    LOCAL_STORAGE_PATH: str = "./storage"
    LOCAL_STORAGE_URL: str = "http://localhost:8000/files"
    SIGNED_URL_TTL_SECONDS: int = 300  # 5 minutes
    MAX_FILE_SIZE: int = 52428800  # 50MB in bytes
    
    # Redis and Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    
    # Email (SMTP)
    SMTP_SERVER: str = "localhost"
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_USE_TLS: bool = True
    FROM_EMAIL: str = "noreply@smartpyq.com"
    FROM_NAME: str = "Smart PYQ"
    SUPPORT_EMAIL: str = "support@smartpyq.com"
    FRONTEND_URL: str = "http://localhost:5173"
    
    # Dev mode: log OTP to console instead of sending email
    DEV_EMAIL_LOG_OTP: bool = True
    
    # Demo account: seeded and enabled in development by default. In
    # production it must be turned on explicitly (ENABLE_DEMO_ACCOUNT=true).
    # None = auto (ON in development, OFF in production); see demo_account_enabled.
    ENABLE_DEMO_ACCOUNT: Optional[bool] = None
    
    # Monitoring
    SENTRY_DSN: Optional[str] = None
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 100
    
    # File Upload
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: str = "pdf,jpg,jpeg,png,webp"
    
    # Cache TTL (seconds)
    CACHE_TTL_SHORT: int = 300  # 5 minutes
    CACHE_TTL_MEDIUM: int = 1800  # 30 minutes
    CACHE_TTL_LONG: int = 3600  # 1 hour
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100
    
    @validator("DEBUG", pre=True)
    def parse_debug(cls, v):
        """Parse DEBUG from string to boolean."""
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "on")
        return v
    
    @validator("ALLOWED_HOSTS", "CORS_ORIGINS", "ALLOWED_FILE_TYPES")
    def parse_comma_separated(cls, v):
        """Parse comma-separated strings."""
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v
    
    @validator("DATABASE_URL")
    def validate_database_url(cls, v):
        """Validate database URL format."""
        allowed_prefixes = ("postgresql://", "postgresql+asyncpg://", "sqlite://", "sqlite+aiosqlite://")
        if not v.startswith(allowed_prefixes):
            raise ValueError(f"DATABASE_URL must start with one of: {allowed_prefixes}")
        return v
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "allow"
        case_sensitive = True


# Global settings instance
settings = Settings()


def demo_account_enabled() -> bool:
    """Whether the demo account may be seeded and used.
    
    Defaults: ON in development, OFF in production. Override in production
    with ENABLE_DEMO_ACCOUNT=true.
    """
    if settings.ENABLE_DEMO_ACCOUNT is None:
        return settings.ENV != "production"
    return bool(settings.ENABLE_DEMO_ACCOUNT)


def validate_production_settings():
    """Validate critical settings at startup for production environments."""
    import sys
    
    if settings.ENV == "production":
        errors = []
        
        # JWT_SECRET must not be empty or placeholder
        placeholder_secrets = {
            "", "your-super-secret-jwt-key-change-in-production",
            "your_super_secret_jwt_key_change_in_production_min_32_chars",
            "CHANGE_ME", "secret", "changeme",
        }
        if settings.JWT_SECRET in placeholder_secrets or len(settings.JWT_SECRET) < 32:
            errors.append("JWT_SECRET is missing, empty, or a placeholder. Set a strong secret in production.")
        
        # DATABASE_URL should not be SQLite in production
        if "sqlite" in settings.DATABASE_URL:
            errors.append("DATABASE_URL uses SQLite. Use PostgreSQL for production.")
        
        # CORS must not include localhost in production. A warning, not an
        # error: localhost entries are harmless (browsers on other machines
        # can't use them) and a hard exit here previously bricked deploys
        # when the frontend origin alone was missing.
        all_origin_sources = (
            settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.ALLOWED_ORIGINS]
        ) + (
            settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
        )
        if not any('vercel.app' in str(o) or 'http' in str(o) and 'localhost' not in str(o) for o in all_origin_sources):
            errors.append("No production frontend origin found in ALLOWED_ORIGINS/CORS_ORIGINS/FRONTEND_URL.")
        
        # SUPABASE_SECRET_KEY should not be exposed to frontend
        if settings.SUPABASE_SERVICE_ROLE_KEY and len(settings.SUPABASE_SERVICE_ROLE_KEY) < 10:
            errors.append("SUPABASE_SERVICE_ROLE_KEY appears invalid.")
        
        if errors:
            for err in errors:
                print(f"PRODUCTION CONFIG ERROR: {err}", file=sys.stderr)
            print("Fix the above errors before starting in production.", file=sys.stderr)
            sys.exit(1)


# Derived settings
class DerivedSettings:
    """Settings derived from base settings."""
    
    @property
    def is_development(self) -> bool:
        return settings.ENV == "development"
    
    @property
    def is_production(self) -> bool:
        return settings.ENV == "production"
    
    @property
    def database_url_async(self) -> str:
        """Get async database URL for SQLAlchemy."""
        return settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
    
    @property
    def allowed_file_extensions(self) -> List[str]:
        """Get list of allowed file extensions."""
        return [f".{ext}" for ext in settings.ALLOWED_FILE_TYPES]
    
    @property
    def max_file_size_bytes(self) -> int:
        """Get maximum file size in bytes."""
        return settings.MAX_FILE_SIZE_MB * 1024 * 1024


derived_settings = DerivedSettings()