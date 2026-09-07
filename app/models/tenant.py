"""Tenant model for multi-tenancy support.

Manages tenant organizations with domain restrictions and access controls.
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class TenantStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class Tenant(Base):
    """Tenant model for multi-tenant architecture.
    
    Represents organizations (colleges/universities) that can have multiple users.
    Each tenant has domain restrictions and access controls.
    """
    
    __tablename__ = "tenants"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Basic information
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Domain restrictions
    allowed_domains = Column(JSON, nullable=False, default=list)
    
    # Access control
    access_code_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Contact information
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(20), nullable=True)
    
    # Settings
    settings = Column(JSON, nullable=False, default=dict)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    papers = relationship("Paper", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="tenant")
    
    def __repr__(self) -> str:
        return f"<Tenant(id={self.id}, name='{self.name}', slug='{self.slug}')>"
    
    def is_domain_allowed(self, email: str) -> bool:
        """Check if email domain is allowed for this tenant.
        
        Args:
            email: Email address to check
            
        Returns:
            bool: True if domain is allowed, False otherwise
        """
        if not self.allowed_domains:
            return False
        
        domain = email.split('@')[-1].lower()
        return domain in [d.lower() for d in self.allowed_domains]
    
    def get_setting(self, key: str, default=None):
        """Get a tenant setting value.
        
        Args:
            key: Setting key
            default: Default value if key not found
            
        Returns:
            Setting value or default
        """
        return self.settings.get(key, default)
    
    def set_setting(self, key: str, value):
        """Set a tenant setting value.
        
        Args:
            key: Setting key
            value: Setting value
        """
        if self.settings is None:
            self.settings = {}
        self.settings[key] = value
    
    @property
    def user_count(self) -> int:
        """Get the number of users in this tenant."""
        return len(self.users) if self.users else 0
    
    @property
    def paper_count(self) -> int:
        """Get the number of papers in this tenant."""
        return len(self.papers) if self.papers else 0
    
    def to_dict(self) -> dict:
        """Convert tenant to dictionary representation.
        
        Returns:
            dict: Tenant data as dictionary
        """
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "allowed_domains": self.allowed_domains,
            "is_active": self.is_active,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "settings": self.settings,
            "user_count": self.user_count,
            "paper_count": self.paper_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }