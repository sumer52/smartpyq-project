"""Custom exception classes for structured error handling.

Provides consistent error responses across the application with proper HTTP status codes.
"""

from typing import Any, Dict, Optional


class CustomException(Exception):
    """Base custom exception class."""
    
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_code: str = "INTERNAL_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(CustomException):
    """Validation error exception."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="VALIDATION_ERROR",
            details=details
        )


class AuthenticationError(CustomException):
    """Authentication error exception."""
    
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(
            message=message,
            status_code=401,
            error_code="AUTHENTICATION_ERROR"
        )


class AuthorizationError(CustomException):
    """Authorization error exception."""
    
    def __init__(self, message: str = "Access denied"):
        super().__init__(
            message=message,
            status_code=403,
            error_code="AUTHORIZATION_ERROR"
        )


class PermissionError(AuthorizationError):
    """Permission denied exception (alias for AuthorizationError)."""
    
    def __init__(self, message: str = "Permission denied"):
        super().__init__(message=message)


class NotFoundError(CustomException):
    """Resource not found exception."""
    
    def __init__(self, resource: str = "Resource"):
        super().__init__(
            message=f"{resource} not found",
            status_code=404,
            error_code="NOT_FOUND"
        )


class ConflictError(CustomException):
    """Resource conflict exception."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=409,
            error_code="CONFLICT_ERROR",
            details=details
        )


class RateLimitError(CustomException):
    """Rate limit exceeded exception."""
    
    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(
            message=message,
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED"
        )


class ExternalServiceError(CustomException):
    """External service error exception."""
    
    def __init__(self, service: str, message: str = "External service error"):
        super().__init__(
            message=f"{service}: {message}",
            status_code=502,
            error_code="EXTERNAL_SERVICE_ERROR",
            details={"service": service}
        )


class DatabaseError(CustomException):
    """Database operation error exception."""
    
    def __init__(self, message: str = "Database operation failed"):
        super().__init__(
            message=message,
            status_code=500,
            error_code="DATABASE_ERROR"
        )


class FileUploadError(CustomException):
    """File upload error exception."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="FILE_UPLOAD_ERROR",
            details=details
        )


class AIServiceError(CustomException):
    """AI service error exception."""
    
    def __init__(self, message: str = "AI service error", provider: str = "unknown"):
        super().__init__(
            message=message,
            status_code=502,
            error_code="AI_SERVICE_ERROR",
            details={"provider": provider}
        )


class TenantError(CustomException):
    """Tenant-related error exception."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="TENANT_ERROR",
            details=details
        )


class EmailError(CustomException):
    """Email service error exception."""
    
    def __init__(self, message: str = "Email service error"):
        super().__init__(
            message=message,
            status_code=502,
            error_code="EMAIL_ERROR"
        )


class CacheError(CustomException):
    """Cache operation error exception."""
    
    def __init__(self, message: str = "Cache operation failed"):
        super().__init__(
            message=message,
            status_code=500,
            error_code="CACHE_ERROR"
        )


class WorkerError(CustomException):
    """Background worker error exception."""
    
    def __init__(self, message: str = "Worker task failed", task_name: str = "unknown"):
        super().__init__(
            message=message,
            status_code=500,
            error_code="WORKER_ERROR",
            details={"task": task_name}
        )


class ServiceError(CustomException):
    """Generic service error exception."""
    
    def __init__(self, message: str = "Service error"):
        super().__init__(
            message=message,
            status_code=502,
            error_code="SERVICE_ERROR"
        )


class DuplicateError(ConflictError):
    """Duplicate resource exception (alias for ConflictError)."""
    
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message=message)