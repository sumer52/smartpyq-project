"""Chat models for AI conversation management.

Handles chat sessions, messages, and conversation history for the AI assistant.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List
from uuid import uuid4

from sqlalchemy import (
    Column, Integer, String, DateTime, Boolean, ForeignKey, Text, JSON, Float
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.types import Enum as SQLEnum

from app.core.database import Base


class MessageRole(str, Enum):
    """Message role enumeration."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class SessionStatus(str, Enum):
    """Chat session status enumeration."""
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"
    ERROR = "error"


class ChatSession(Base):
    """Chat session model for managing AI conversations.
    
    Represents a conversation session between a user and the AI assistant.
    """
    
    __tablename__ = "chat_sessions"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Session identification
    session_uuid = Column(String(36), unique=True, nullable=False, index=True, default=lambda: str(uuid4()))
    
    # User relationship
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # Session metadata
    title = Column(String(255), nullable=True)  # Auto-generated or user-set
    status = Column(SQLEnum(SessionStatus, native_enum=False), default=SessionStatus.ACTIVE, nullable=False)
    
    # Context and settings
    context = Column(JSON, nullable=True)  # Additional context for the session
    settings = Column(JSON, nullable=False, default=dict)  # Session-specific settings
    
    # Analytics
    message_count = Column(Integer, default=0, nullable=False)
    total_tokens_used = Column(Integer, default=0, nullable=False)
    total_cost = Column(Float, default=0.0, nullable=False)  # Cost in USD
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.created_at")
    
    def __repr__(self) -> str:
        return f"<ChatSession(id={self.id}, uuid='{self.session_uuid}', user_id={self.user_id})>"
    
    @property
    def is_active(self) -> bool:
        """Check if session is active."""
        return self.status == SessionStatus.ACTIVE
    
    @property
    def duration_minutes(self) -> Optional[float]:
        """Calculate session duration in minutes."""
        if not self.last_message_at:
            return None
        
        end_time = self.ended_at or self.last_message_at
        duration = end_time - self.started_at
        return duration.total_seconds() / 60
    
    def get_setting(self, key: str, default=None):
        """Get a session setting value.
        
        Args:
            key: Setting key
            default: Default value if key not found
            
        Returns:
            Setting value or default
        """
        return self.settings.get(key, default)
    
    def set_setting(self, key: str, value):
        """Set a session setting value.
        
        Args:
            key: Setting key
            value: Setting value
        """
        if self.settings is None:
            self.settings = {}
        self.settings[key] = value
    
    def add_tokens(self, tokens: int, cost: float = 0.0):
        """Add token usage to session.
        
        Args:
            tokens: Number of tokens used
            cost: Cost in USD
        """
        self.total_tokens_used += tokens
        self.total_cost += cost
    
    def get_recent_messages(self, limit: int = 10) -> List['ChatMessage']:
        """Get recent messages from the session.
        
        Args:
            limit: Maximum number of messages to return
            
        Returns:
            List of recent messages
        """
        return sorted(self.messages, key=lambda m: m.created_at, reverse=True)[:limit]
    
    def get_context_messages(self, max_tokens: int = 4000) -> List['ChatMessage']:
        """Get messages for context, respecting token limits.
        
        Args:
            max_tokens: Maximum tokens to include in context
            
        Returns:
            List of messages for context
        """
        messages = sorted(self.messages, key=lambda m: m.created_at, reverse=True)
        context_messages = []
        total_tokens = 0
        
        for message in messages:
            if total_tokens + message.tokens_used > max_tokens:
                break
            context_messages.append(message)
            total_tokens += message.tokens_used
        
        return list(reversed(context_messages))  # Return in chronological order
    
    def to_dict(self, include_messages: bool = False) -> Dict[str, Any]:
        """Convert session to dictionary representation.
        
        Args:
            include_messages: Whether to include messages
            
        Returns:
            dict: Session data as dictionary
        """
        data = {
            "id": self.id,
            "session_uuid": self.session_uuid,
            "user_id": self.user_id,
            "title": self.title,
            "status": self.status.value,
            "message_count": self.message_count,
            "total_tokens_used": self.total_tokens_used,
            "total_cost": self.total_cost,
            "duration_minutes": self.duration_minutes,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None
        }
        
        if include_messages:
            data["messages"] = [msg.to_dict() for msg in self.messages]
        
        return data


class ChatMessage(Base):
    """Chat message model for individual messages in conversations.
    
    Represents individual messages within a chat session.
    """
    
    __tablename__ = "chat_messages"
    
    # Primary key
    id = Column(Integer, primary_key=True, index=True)
    
    # Session relationship
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False, index=True)
    
    # Message content
    role = Column(SQLEnum(MessageRole, native_enum=False), nullable=False, index=True)
    content = Column(Text, nullable=False)
    
    # AI-specific metadata
    model_used = Column(String(100), nullable=True)  # e.g., "gemini-pro", "gpt-4"
    tokens_used = Column(Integer, default=0, nullable=False)
    response_time_ms = Column(Integer, nullable=True)  # Response time in milliseconds
    
    # Message metadata
    message_metadata = Column(JSON, nullable=True)  # Additional metadata (attachments, etc.)
    
    # Error handling
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    
    def __repr__(self) -> str:
        content_preview = self.content[:50] + "..." if len(self.content) > 50 else self.content
        return f"<ChatMessage(id={self.id}, role='{self.role}', content='{content_preview}')>"
    
    @property
    def is_user_message(self) -> bool:
        """Check if message is from user."""
        return self.role == MessageRole.USER
    
    @property
    def is_assistant_message(self) -> bool:
        """Check if message is from assistant."""
        return self.role == MessageRole.ASSISTANT
    
    @property
    def is_system_message(self) -> bool:
        """Check if message is a system message."""
        return self.role == MessageRole.SYSTEM
    
    @property
    def has_error(self) -> bool:
        """Check if message has an error."""
        return self.error_message is not None
    
    @property
    def word_count(self) -> int:
        """Get word count of message content."""
        return len(self.content.split())
    
    @property
    def character_count(self) -> int:
        """Get character count of message content."""
        return len(self.content)
    
    def get_metadata(self, key: str, default=None):
        """Get a metadata value.
        
        Args:
            key: Metadata key
            default: Default value if key not found
            
        Returns:
            Metadata value or default
        """
        if self.message_metadata is None:
            return default
        return self.message_metadata.get(key, default)
    
    def set_metadata(self, key: str, value):
        """Set a metadata value.
        
        Args:
            key: Metadata key
            value: Metadata value
        """
        if self.message_metadata is None:
            self.message_metadata = {}
        self.message_metadata[key] = value
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert message to dictionary representation.
        
        Returns:
            dict: Message data as dictionary
        """
        return {
            "id": self.id,
            "session_id": self.session_id,
            "role": self.role.value,
            "content": self.content,
            "model_used": self.model_used,
            "tokens_used": self.tokens_used,
            "response_time_ms": self.response_time_ms,
            "word_count": self.word_count,
            "character_count": self.character_count,
            "metadata": self.message_metadata,
            "error_message": self.error_message,
            "retry_count": self.retry_count,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
    
    def to_openai_format(self) -> Dict[str, str]:
        """Convert message to OpenAI API format.
        
        Returns:
            dict: Message in OpenAI format
        """
        return {
            "role": self.role.value,
            "content": self.content
        }