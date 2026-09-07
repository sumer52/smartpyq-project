"""Pydantic schemas for Chat-related API requests and responses."""

from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    session_id: str
    message_id: int
    content: str
    tokens_used: int = 0
    cached: bool = False
    timestamp: Optional[datetime] = None


class ChatSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_uuid: str
    user_id: int
    title: Optional[str] = None
    status: str
    message_count: int = 0
    total_tokens_used: int = 0
    started_at: Optional[datetime] = None
    last_message_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    @classmethod
    def from_orm(cls, obj):
        return cls.model_validate(obj)


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    role: str
    content: str
    model_used: Optional[str] = None
    tokens_used: int = 0
    response_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None

    @classmethod
    def from_orm(cls, obj):
        return cls.model_validate(obj)


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: List[ChatMessageResponse]
    total: int
    page: int
    limit: int
    total_pages: int
