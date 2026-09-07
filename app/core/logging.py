"""Logging configuration for the application.

Provides structured logging with proper formatting, handlers, and integration with Sentry.
"""

import logging
import logging.config
import sys
from typing import Dict, Any

from app.core.config import settings


def setup_logging() -> None:
    """Setup application logging configuration."""
    
    # Logging configuration
    config: Dict[str, Any] = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S"
            },
            "detailed": {
                "format": "%(asctime)s - %(name)s - %(levelname)s - %(pathname)s:%(lineno)d - %(funcName)s - %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S"
            },
            "json": {
                "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
                "format": "%(asctime)s %(name)s %(levelname)s %(pathname)s %(lineno)d %(funcName)s %(message)s"
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": "INFO",
                "formatter": "default",
                "stream": sys.stdout
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "INFO",
                "formatter": "detailed",
                "filename": "logs/app.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5
            },
            "error_file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "ERROR",
                "formatter": "detailed",
                "filename": "logs/error.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5
            }
        },
        "loggers": {
            "app": {
                "level": "DEBUG" if settings.DEBUG else "INFO",
                "handlers": ["console", "file", "error_file"],
                "propagate": False
            },
            "sqlalchemy.engine": {
                "level": "INFO" if settings.DEBUG else "WARNING",
                "handlers": ["console"],
                "propagate": False
            },
            "uvicorn": {
                "level": "INFO",
                "handlers": ["console"],
                "propagate": False
            },
            "celery": {
                "level": "INFO",
                "handlers": ["console", "file"],
                "propagate": False
            }
        },
        "root": {
            "level": "INFO",
            "handlers": ["console"]
        }
    }
    
    # Create logs directory if it doesn't exist
    import os
    os.makedirs("logs", exist_ok=True)
    
    # Apply logging configuration
    logging.config.dictConfig(config)
    
    # Setup Sentry integration if configured
    if settings.SENTRY_DSN and settings.SENTRY_DSN.startswith("https://"):
        try:
            import sentry_sdk
            from sentry_sdk.integrations.logging import LoggingIntegration
            from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
            from sentry_sdk.integrations.fastapi import FastApiIntegration
            
            sentry_logging = LoggingIntegration(
                level=logging.INFO,
                event_level=logging.ERROR
            )
            
            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                environment=settings.ENV,
                integrations=[
                    sentry_logging,
                    SqlalchemyIntegration(),
                    FastApiIntegration()
                ],
                traces_sample_rate=0.1 if settings.ENV == "production" else 1.0,
                send_default_pii=False
            )
            
            logging.getLogger("app").info("Sentry integration initialized")
        except ImportError:
            logging.getLogger("app").warning("Sentry SDK not installed, skipping integration")
        except Exception as e:
            logging.getLogger("app").error(f"Failed to initialize Sentry: {e}")
