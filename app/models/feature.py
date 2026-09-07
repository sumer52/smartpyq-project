"""Feature model for managing platform features.

Handles feature flags, announcements, and platform capabilities.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any

from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, Text, JSON, Float
)
from sqlalchemy.sql import func

from app.core.database import Base


class FeatureType(str, Enum):
    FEATURE = "feature"
    ANNOUNCEMENT = "announcement"


class Feature(Base):
    """Feature model for platform features and capabilities.
    
    Represents features that can be displayed to users,
    used for feature flags, or announcements.
    """
    
    __tablename__ = "features"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Basic information
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    short_description = Column(String(500), nullable=True)
    
    # Visual elements
    icon_url = Column(String(500), nullable=True)
    image_url = Column(String(500), nullable=True)
    color = Column(String(7), nullable=True)  # Hex color code
    
    # Feature configuration
    is_enabled = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    is_beta = Column(Boolean, default=False, nullable=False)
    
    # Display settings
    display_order = Column(Integer, default=0, nullable=False, index=True)
    category = Column(String(100), nullable=True, index=True)
    
    # Feature flags and settings
    feature_key = Column(String(100), unique=True, nullable=True, index=True)
    settings = Column(JSON, nullable=False, default=dict)
    
    # Access control
    required_role = Column(String(50), nullable=True)  # Minimum role required
    allowed_tenants = Column(JSON, nullable=True)  # List of allowed tenant IDs
    
    # Metadata
    version = Column(String(20), nullable=True)
    release_date = Column(DateTime(timezone=True), nullable=True)
    deprecation_date = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    def __repr__(self) -> str:
        return f"<Feature(id={self.id}, title='{self.title}', key='{self.feature_key}')>"
    
    @property
    def is_available(self) -> bool:
        """Check if feature is available (enabled and not deprecated)."""
        if not self.is_enabled:
            return False
        
        if self.deprecation_date and datetime.utcnow() > self.deprecation_date:
            return False
        
        return True
    
    @property
    def is_released(self) -> bool:
        """Check if feature is released."""
        if not self.release_date:
            return True  # No release date means it's released
        
        return datetime.utcnow() >= self.release_date
    
    def can_be_accessed_by(self, user) -> bool:
        """Check if feature can be accessed by a user.
        
        Args:
            user: User object
            
        Returns:
            bool: True if user can access feature
        """
        if not self.is_available or not self.is_released:
            return False
        
        # Check role requirement
        if self.required_role:
            user_roles = {
                "student": 1,
                "admin": 2,
                "tenant_admin": 3,
                "super_admin": 4
            }
            
            required_level = user_roles.get(self.required_role, 0)
            user_level = user_roles.get(user.role.value, 0)
            
            if user_level < required_level:
                return False
        
        # Check tenant restriction
        if self.allowed_tenants:
            if user.tenant_id not in self.allowed_tenants:
                return False
        
        return True
    
    def get_setting(self, key: str, default=None):
        """Get a feature setting value.
        
        Args:
            key: Setting key
            default: Default value if key not found
            
        Returns:
            Setting value or default
        """
        return self.settings.get(key, default)
    
    def set_setting(self, key: str, value):
        """Set a feature setting value.
        
        Args:
            key: Setting key
            value: Setting value
        """
        if self.settings is None:
            self.settings = {}
        self.settings[key] = value
    
    def to_dict(self, include_settings: bool = False) -> Dict[str, Any]:
        """Convert feature to dictionary representation.
        
        Args:
            include_settings: Whether to include settings
            
        Returns:
            dict: Feature data as dictionary
        """
        data = {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "short_description": self.short_description,
            "icon_url": self.icon_url,
            "image_url": self.image_url,
            "color": self.color,
            "is_enabled": self.is_enabled,
            "is_public": self.is_public,
            "is_beta": self.is_beta,
            "display_order": self.display_order,
            "category": self.category,
            "feature_key": self.feature_key,
            "version": self.version,
            "is_available": self.is_available,
            "is_released": self.is_released,
            "release_date": self.release_date.isoformat() if self.release_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_settings:
            data["settings"] = self.settings
            data["required_role"] = self.required_role
            data["allowed_tenants"] = self.allowed_tenants
        
        return data


class Subscriber(Base):
    """Subscriber model for newsletter subscriptions.
    
    Manages email subscriptions for newsletters and announcements.
    """
    
    __tablename__ = "subscribers"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Subscription information
    email = Column(String(255), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    # Subscription preferences
    preferences = Column(JSON, nullable=False, default=dict)
    
    # Verification
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_token = Column(String(255), nullable=True)
    
    # Unsubscription
    unsubscribe_token = Column(String(255), nullable=True, unique=True)
    unsubscribed_at = Column(DateTime(timezone=True), nullable=True)
    unsubscribe_reason = Column(String(255), nullable=True)
    
    # Analytics
    source = Column(String(100), nullable=True)  # How they subscribed
    referrer = Column(String(500), nullable=True)
    
    # Timestamps
    subscribed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    last_email_sent = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self) -> str:
        return f"<Subscriber(id={self.id}, email='{self.email}', active={self.is_active})>"
    
    @property
    def is_subscribed(self) -> bool:
        """Check if subscriber is active and verified."""
        return self.is_active and self.is_verified and not self.unsubscribed_at
    
    def get_preference(self, key: str, default=None):
        """Get a subscription preference.
        
        Args:
            key: Preference key
            default: Default value if key not found
            
        Returns:
            Preference value or default
        """
        return self.preferences.get(key, default)
    
    def set_preference(self, key: str, value):
        """Set a subscription preference.
        
        Args:
            key: Preference key
            value: Preference value
        """
        if self.preferences is None:
            self.preferences = {}
        self.preferences[key] = value
    
    def unsubscribe(self, reason: str = None):
        """Unsubscribe the user.
        
        Args:
            reason: Reason for unsubscribing
        """
        self.is_active = False
        self.unsubscribed_at = datetime.utcnow()
        self.unsubscribe_reason = reason
    
    def resubscribe(self):
        """Resubscribe the user."""
        self.is_active = True
        self.unsubscribed_at = None
        self.unsubscribe_reason = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert subscriber to dictionary representation.
        
        Returns:
            dict: Subscriber data as dictionary
        """
        return {
            "id": self.id,
            "email": self.email,
            "is_active": self.is_active,
            "is_verified": self.is_verified,
            "is_subscribed": self.is_subscribed,
            "preferences": self.preferences,
            "source": self.source,
            "subscribed_at": self.subscribed_at.isoformat() if self.subscribed_at else None,
            "verified_at": self.verified_at.isoformat() if self.verified_at else None,
            "unsubscribed_at": self.unsubscribed_at.isoformat() if self.unsubscribed_at else None,
            "last_email_sent": self.last_email_sent.isoformat() if self.last_email_sent else None
        }