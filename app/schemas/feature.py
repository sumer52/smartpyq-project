"""Pydantic schemas for Feature-related API requests and responses."""

from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, ConfigDict, Field


class FeatureCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=500)
    icon_url: Optional[str] = None
    image_url: Optional[str] = None
    color: Optional[str] = None
    is_enabled: bool = True
    is_public: bool = True
    is_beta: bool = False
    display_order: int = 0
    category: Optional[str] = None
    key: str = Field(..., min_length=1, max_length=100)
    settings: Dict[str, Any] = Field(default_factory=dict)
    required_role: Optional[str] = None
    allowed_tenants: Optional[List[int]] = None
    version: Optional[str] = None


class FeatureUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=500)
    icon_url: Optional[str] = None
    image_url: Optional[str] = None
    color: Optional[str] = None
    is_enabled: Optional[bool] = None
    is_public: Optional[bool] = None
    is_beta: Optional[bool] = None
    display_order: Optional[int] = None
    category: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    required_role: Optional[str] = None
    allowed_tenants: Optional[List[int]] = None
    version: Optional[str] = None


class FeatureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    short_description: Optional[str] = None
    icon_url: Optional[str] = None
    image_url: Optional[str] = None
    color: Optional[str] = None
    is_enabled: bool = True
    is_public: bool = True
    is_beta: bool = False
    display_order: int = 0
    category: Optional[str] = None
    feature_key: Optional[str] = None
    version: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_orm(cls, obj):
        return cls.model_validate(obj)


class SubscribeRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=255)
    name: Optional[str] = None
    preferences: Optional[Dict[str, Any]] = None
    source: Optional[str] = None


    id: int
    email: str
    is_active: bool = True
    is_verified: bool = False
    preferences: Dict[str, Any] = Field(default_factory=dict)
    source: Optional[str] = None
    subscribed_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    unsubscribed_at: Optional[datetime] = None

    @classmethod
    def from_orm(cls, obj):
        return cls.model_validate(obj)


