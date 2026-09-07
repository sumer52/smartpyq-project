"""Audit log model for tracking system activities.

Provides comprehensive logging of user actions, system events,
and security-related activities for compliance and monitoring.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum

from sqlalchemy import (
    Column, Integer, String, DateTime, JSON, ForeignKey, Text, Boolean
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class AuditAction(str, Enum):
    """Enumeration of audit actions."""
    
    # Authentication actions
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"
    PASSWORD_RESET = "password_reset"
    ACCOUNT_LOCKED = "account_locked"
    ACCOUNT_UNLOCKED = "account_unlocked"
    
    # User management
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DELETED = "user_deleted"
    USER_ACTIVATED = "user_activated"
    USER_DEACTIVATED = "user_deactivated"
    ROLE_CHANGED = "role_changed"
    
    # Paper management
    PAPER_CREATED = "paper_created"
    PAPER_UPDATED = "paper_updated"
    PAPER_DELETED = "paper_deleted"
    PAPER_UPLOADED = "paper_uploaded"
    PAPER_APPROVED = "paper_approved"
    PAPER_REJECTED = "paper_rejected"
    PAPER_VIEWED = "paper_viewed"
    PAPER_DOWNLOADED = "paper_downloaded"
    
    # Chat and AI
    CHAT_STARTED = "chat_started"
    CHAT_MESSAGE_SENT = "chat_message_sent"
    AI_QUERY = "ai_query"
    AI_RESPONSE = "ai_response"
    
    # System actions
    SYSTEM_BACKUP = "system_backup"
    SYSTEM_RESTORE = "system_restore"
    SYSTEM_MAINTENANCE = "system_maintenance"
    
    # Security events
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    DATA_EXPORT = "data_export"
    
    # Tenant management
    TENANT_CREATED = "tenant_created"
    TENANT_UPDATED = "tenant_updated"
    TENANT_DELETED = "tenant_deleted"


class AuditSeverity(str, Enum):
    """Enumeration of audit severity levels."""
    
    INFO = "info"
    LOW = "low"
    WARNING = "warning"
    ERROR = "error"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AuditLog(Base):
    """Audit log model for tracking system activities.
    
    Records all significant actions performed by users and the system
    for security, compliance, and debugging purposes.
    """
    
    __tablename__ = "audit_logs"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Actor information
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_type = Column(String(50), nullable=False, default="user")  # user, system, api
    actor_email = Column(String(255), nullable=True)  # Denormalized for deleted users
    
    # Action details
    action = Column(String(100), nullable=False, index=True)
    severity = Column(String(20), nullable=False, default=AuditSeverity.LOW)
    
    # Target information
    target_type = Column(String(100), nullable=True, index=True)  # user, paper, tenant, etc.
    target_id = Column(String(100), nullable=True, index=True)  # Can be string for flexibility
    target_name = Column(String(255), nullable=True)  # Human-readable target name
    
    # Request context
    ip_address = Column(String(45), nullable=True, index=True)  # IPv6 support
    user_agent = Column(Text, nullable=True)
    request_id = Column(String(100), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)
    
    # Event details
    description = Column(Text, nullable=True)
    event_metadata = Column("metadata", JSON, nullable=False, default=dict)
    
    # Status and outcome
    success = Column(Boolean, nullable=False, default=True)
    error_message = Column(Text, nullable=True)
    
    # Tenant context
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationships
    actor = relationship("User", foreign_keys=[actor_id], back_populates="audit_logs")
    tenant = relationship("Tenant", back_populates="audit_logs")
    
    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action='{self.action}', actor_id={self.actor_id})>"
    
    @classmethod
    def create_log(
        cls,
        action: str,
        actor_id: Optional[int] = None,
        actor_type: str = "user",
        actor_email: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        target_name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        severity: str = AuditSeverity.LOW,
        success: bool = True,
        error_message: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None,
        session_id: Optional[str] = None,
        tenant_id: Optional[int] = None
    ) -> "AuditLog":
        """Create a new audit log entry.
        
        Args:
            action: Action performed
            actor_id: ID of the user who performed the action
            actor_type: Type of actor (user, system, api)
            actor_email: Email of the actor (for deleted users)
            target_type: Type of target object
            target_id: ID of target object
            target_name: Human-readable name of target
            description: Description of the action
            metadata: Additional metadata
            severity: Severity level
            success: Whether the action was successful
            error_message: Error message if action failed
            ip_address: IP address of the request
            user_agent: User agent string
            request_id: Request ID for tracing
            session_id: Session ID
            tenant_id: Tenant ID for multi-tenancy
            
        Returns:
            AuditLog: New audit log instance
        """
        return cls(
            action=action,
            actor_id=actor_id,
            actor_type=actor_type,
            actor_email=actor_email,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            target_name=target_name,
            description=description,
            event_metadata=metadata or {},
            severity=severity,
            success=success,
            error_message=error_message,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            session_id=session_id,
            tenant_id=tenant_id
        )
    
    def add_metadata(self, key: str, value: Any):
        """Add metadata to the audit log.
        
        Args:
            key: Metadata key
            value: Metadata value
        """
        if self.event_metadata is None:
            self.event_metadata = {}
        self.event_metadata[key] = value
    
    def get_metadata(self, key: str, default=None):
        """Get metadata value.
        
        Args:
            key: Metadata key
            default: Default value if key not found
            
        Returns:
            Metadata value or default
        """
        return self.event_metadata.get(key, default) if self.event_metadata else default
    
    @property
    def is_security_event(self) -> bool:
        """Check if this is a security-related event."""
        security_actions = {
            AuditAction.LOGIN_FAILED,
            AuditAction.ACCOUNT_LOCKED,
            AuditAction.SUSPICIOUS_ACTIVITY,
            AuditAction.RATE_LIMIT_EXCEEDED,
            AuditAction.UNAUTHORIZED_ACCESS,
            AuditAction.PASSWORD_CHANGE,
            AuditAction.PASSWORD_RESET
        }
        return self.action in security_actions or self.severity in [AuditSeverity.HIGH, AuditSeverity.CRITICAL]
    
    @property
    def formatted_description(self) -> str:
        """Get a formatted description of the audit event."""
        if self.description:
            return self.description
        
        # Generate description based on action
        actor_name = self.actor_email or f"User {self.actor_id}" if self.actor_id else "System"
        target_desc = f" on {self.target_type} {self.target_name or self.target_id}" if self.target_type else ""
        
        return f"{actor_name} performed {self.action.replace('_', ' ')}{target_desc}"
    
    def to_dict(self, include_metadata: bool = True) -> Dict[str, Any]:
        """Convert audit log to dictionary representation.
        
        Args:
            include_metadata: Whether to include metadata
            
        Returns:
            dict: Audit log data as dictionary
        """
        data = {
            "id": self.id,
            "actor_id": self.actor_id,
            "actor_type": self.actor_type,
            "actor_email": self.actor_email,
            "action": self.action,
            "severity": self.severity,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "target_name": self.target_name,
            "description": self.formatted_description,
            "success": self.success,
            "error_message": self.error_message,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "request_id": self.request_id,
            "session_id": self.session_id,
            "tenant_id": self.tenant_id,
            "is_security_event": self.is_security_event,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
        
        if include_metadata:
            data["metadata"] = self.metadata
        
        return data