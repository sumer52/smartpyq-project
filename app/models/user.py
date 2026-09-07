"""User model for authentication and user management.

Handles user accounts with role-based access control and tenant relationships.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List

from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import Enum as SQLEnum

from app.core.database import Base

class UserRole(str, Enum):
    STUDENT = "student"
    ADMIN = "admin"
    TENANT_ADMIN = "tenant_admin"
    SUPER_ADMIN = "super_admin"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=True, index=True)
    full_name = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=True)
    role = Column(SQLEnum(UserRole), default=UserRole.STUDENT, nullable=False)
    status = Column(SQLEnum(UserStatus), default=UserStatus.ACTIVE, nullable=False)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    is_email_verified = Column(Boolean, default=False, nullable=False)
    domain_verified = Column(Boolean, default=False, nullable=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)

    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    phone = Column(String(20), nullable=True)
    
    # Academic information (for students)
    university = Column(String(255), nullable=True)
    course = Column(String(255), nullable=True)
    specialization = Column(String(100), nullable=True)  # e.g., 'mscs', 'mpc'
    academic_year = Column(String(50), nullable=True)     # e.g., '1st Year', '2nd Year'
    semester = Column(String(50), nullable=True)           # e.g., 'sem1', 'sem3'
    year_of_study = Column(Integer, nullable=True)
    onboarding_completed = Column(Boolean, default=False, nullable=False)
    
    # Social authentication
    google_id = Column(String(100), nullable=True, unique=True)
    github_id = Column(String(100), nullable=True, unique=True)
    
    # Security
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(45), nullable=True)  # IPv6 support
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    
    # Password reset
    password_reset_token = Column(String(255), nullable=True)
    password_reset_expires = Column(DateTime(timezone=True), nullable=True)
    
    # Two-factor authentication
    totp_secret = Column(String(32), nullable=True)
    backup_codes = Column(JSON, nullable=True)  # List of backup codes
    
    # Preferences
    preferences = Column(JSON, nullable=False, default=dict)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_active_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    papers = relationship("Paper", back_populates="uploader", foreign_keys="Paper.uploader_id")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="actor", foreign_keys="AuditLog.actor_id")
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
    
    @property
    def is_active(self) -> bool:
        """Check if user is active."""
        return self.status == UserStatus.ACTIVE
    
    @property
    def is_admin(self) -> bool:
        """Check if user has admin privileges."""
        return self.role in [UserRole.ADMIN, UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]
    
    @property
    def is_tenant_admin(self) -> bool:
        """Check if user is a tenant admin."""
        return self.role in [UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN]
    
    @property
    def is_super_admin(self) -> bool:
        """Check if user is a super admin."""
        return self.role == UserRole.SUPER_ADMIN
    
    @property
    def is_locked(self) -> bool:
        """Check if user account is locked."""
        if self.locked_until is None:
            return False
        return datetime.utcnow() < self.locked_until
    
    def can_access_tenant(self, tenant_id: int) -> bool:
        """Check if user can access a specific tenant.
        
        Args:
            tenant_id: Tenant ID to check access for
            
        Returns:
            bool: True if user can access tenant
        """
        if self.is_super_admin:
            return True
        return self.tenant_id == tenant_id
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission.
        
        Args:
            permission: Permission string to check
            
        Returns:
            bool: True if user has permission
        """
        # Define role-based permissions
        permissions = {
            UserRole.STUDENT: [
                "papers:read",
                "papers:search",
                "chat:use",
                "profile:update"
            ],
            UserRole.ADMIN: [
                "papers:read", "papers:write", "papers:delete",
                "papers:search", "papers:moderate",
                "chat:use", "chat:moderate",
                "users:read", "users:moderate",
                "profile:update"
            ],
            UserRole.TENANT_ADMIN: [
                "papers:read", "papers:write", "papers:delete",
                "papers:search", "papers:moderate",
                "chat:use", "chat:moderate",
                "users:read", "users:write", "users:moderate",
                "tenant:manage",
                "profile:update"
            ],
            UserRole.SUPER_ADMIN: ["*"]  # All permissions
        }
        
        user_permissions = permissions.get(self.role, [])
        return "*" in user_permissions or permission in user_permissions
    
    def get_preference(self, key: str, default=None):
        """Get a user preference value.
        
        Args:
            key: Preference key
            default: Default value if key not found
            
        Returns:
            Preference value or default
        """
        return self.preferences.get(key, default)
    
    def set_preference(self, key: str, value):
        """Set a user preference value.
        
        Args:
            key: Preference key
            value: Preference value
        """
        if self.preferences is None:
            self.preferences = {}
        self.preferences[key] = value
    
    def to_dict(self, include_sensitive: bool = False) -> dict:
        """Convert user to dictionary representation.
        
        Args:
            include_sensitive: Whether to include sensitive fields
            
        Returns:
            dict: User data as dictionary
        """
        data = {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role.value,
            "status": self.status.value,
            "tenant_id": self.tenant_id,
            "is_email_verified": self.is_email_verified,
            "domain_verified": self.domain_verified,
            "avatar_url": self.avatar_url,
            "bio": self.bio,
            "university": self.university,
            "course": self.course,
            "specialization": self.specialization,
            "academic_year": self.academic_year,
            "semester": self.semester,
            "year_of_study": self.year_of_study,
            "onboarding_completed": self.onboarding_completed,
            "preferences": self.preferences,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "last_active_at": self.last_active_at.isoformat() if self.last_active_at else None
        }
        
        if include_sensitive:
            data.update({
                "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
                "last_login_ip": self.last_login_ip,
                "failed_login_attempts": self.failed_login_attempts,
                "is_locked": self.is_locked
            })
        
        return data

