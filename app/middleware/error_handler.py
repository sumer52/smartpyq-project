"""Error handling middleware for centralized exception management.

Provides consistent error responses and logging for all application exceptions.
"""

import logging
import traceback
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from sqlalchemy.exc import SQLAlchemyError
from pydantic import ValidationError as PydanticValidationError

from app.core.exceptions import (
    CustomException,
    DatabaseError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    RateLimitError
)

logger = logging.getLogger(__name__)


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """Middleware for handling all application exceptions."""
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Handle exceptions and return structured error responses."""
        try:
            response = await call_next(request)
            return response
        except Exception as exc:
            return await self._handle_exception(request, exc)
    
    async def _handle_exception(self, request: Request, exc: Exception) -> JSONResponse:
        """Handle different types of exceptions and return appropriate responses."""
        
        # Log the exception
        logger.error(
            f"Exception in {request.method} {request.url.path}: {str(exc)}",
            extra={
                "method": request.method,
                "path": request.url.path,
                "client_ip": request.client.host,
                "user_agent": request.headers.get("user-agent"),
                "exception_type": type(exc).__name__,
                "traceback": traceback.format_exc()
            }
        )
        
        # Handle custom exceptions
        if isinstance(exc, CustomException):
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error": exc.error_code,
                    "message": exc.message,
                    "details": exc.details,
                    "path": request.url.path,
                    "method": request.method
                }
            )
        
        # Handle Pydantic validation errors
        elif isinstance(exc, PydanticValidationError):
            return JSONResponse(
                status_code=422,
                content={
                    "error": "VALIDATION_ERROR",
                    "message": "Request validation failed",
                    "details": {
                        "validation_errors": exc.errors()
                    },
                    "path": request.url.path,
                    "method": request.method
                }
            )
        
        # Handle SQLAlchemy database errors
        elif isinstance(exc, SQLAlchemyError):
            logger.error(f"Database error: {str(exc)}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "DATABASE_ERROR",
                    "message": "Database operation failed",
                    "details": {},
                    "path": request.url.path,
                    "method": request.method
                }
            )
        
        # Handle HTTP exceptions from FastAPI/Starlette
        elif hasattr(exc, 'status_code'):
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error": "HTTP_ERROR",
                    "message": getattr(exc, 'detail', str(exc)),
                    "details": {},
                    "path": request.url.path,
                    "method": request.method
                }
            )
        
        # Handle unexpected exceptions
        else:
            logger.critical(
                f"Unhandled exception: {type(exc).__name__}: {str(exc)}",
                extra={"traceback": traceback.format_exc()}
            )
            
            # Don't expose internal errors in production
            from app.core.config import settings
            if settings.ENV == "production":
                message = "An internal error occurred"
                details = {}
            else:
                message = str(exc)
                details = {
                    "exception_type": type(exc).__name__,
                    "traceback": traceback.format_exc().split('\n')
                }
            
            return JSONResponse(
                status_code=500,
                content={
                    "error": "INTERNAL_ERROR",
                    "message": message,
                    "details": details,
                    "path": request.url.path,
                    "method": request.method
                }
            )
