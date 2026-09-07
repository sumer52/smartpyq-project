"""Chat repository for chat session and message operations.

Handles AI chat sessions, message storage, and conversation management.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select, and_, or_, func, update, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.chat import ChatSession, ChatMessage, MessageRole, SessionStatus
from app.models.user import User
from app.repositories.base_repository import BaseRepository
from app.core.exceptions import ValidationError, NotFoundError


class ChatRepository(BaseRepository[ChatSession]):
    """Repository for chat session operations."""
    
    def __init__(self, db=None):
        super().__init__(db, ChatSession)
    
    async def get_by_uuid(
        self,
        session_uuid: UUID,
        load_messages: bool = False,
        load_user: bool = False
    ) -> Optional[ChatSession]:
        """Get chat session by UUID.
        
        Args:
            session_uuid: Session UUID
            load_messages: Whether to load messages
            load_user: Whether to load user relationship
            
        Returns:
            Chat session or None
        """
        query = select(ChatSession).where(ChatSession.session_uuid == session_uuid)
        
        if load_messages:
            query = query.options(selectinload(ChatSession.messages))
        
        if load_user:
            query = query.options(selectinload(ChatSession.user))
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_user_sessions(
        self,
        user_id: int,
        status: Optional[SessionStatus] = None,
        skip: int = 0,
        limit: int = 100,
        load_messages: bool = False
    ) -> List[ChatSession]:
        """Get chat sessions for a user.
        
        Args:
            user_id: User ID
            status: Filter by session status
            skip: Number of records to skip
            limit: Maximum number of records
            load_messages: Whether to load messages
            
        Returns:
            List of chat sessions
        """
        query = select(ChatSession).where(ChatSession.user_id == user_id)
        
        if status:
            query = query.where(ChatSession.status == status)
        
        if load_messages:
            query = query.options(selectinload(ChatSession.messages))
        
        query = query.order_by(ChatSession.last_message_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_active_sessions(
        self,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[ChatSession]:
        """Get active chat sessions.
        
        Args:
            user_id: Filter by user ID
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of active sessions
        """
        query = select(ChatSession).where(ChatSession.status == SessionStatus.ACTIVE)
        
        if user_id:
            query = query.where(ChatSession.user_id == user_id)
        
        query = query.order_by(ChatSession.last_message_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def create_session(
        self,
        user_id: int,
        title: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        settings: Optional[Dict[str, Any]] = None
    ) -> ChatSession:
        """Create a new chat session.
        
        Args:
            user_id: User ID
            title: Session title
            context: Session context
            settings: Session settings
            
        Returns:
            Created chat session
        """
        session_data = {
            'user_id': user_id,
            'title': title or f"Chat Session {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            'status': SessionStatus.ACTIVE,
            'context': context or {},
            'settings': settings or {}
        }
        
        return await self.create(**session_data)
    
    async def update_session_title(
        self,
        session_id: int,
        title: str
    ) -> bool:
        """Update session title.
        
        Args:
            session_id: Session ID
            title: New title
            
        Returns:
            True if updated successfully
        """
        query = (
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(
                title=title,
                last_message_at=datetime.utcnow()
            )
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def update_session_context(
        self,
        session_id: int,
        context: Dict[str, Any],
        merge: bool = True
    ) -> bool:
        """Update session context.
        
        Args:
            session_id: Session ID
            context: New context data
            merge: Whether to merge with existing context
            
        Returns:
            True if updated successfully
        """
        if merge:
            session = await self.get_by_id(session_id)
            if session and session.context:
                existing_context = session.context.copy()
                existing_context.update(context)
                context = existing_context
        
        query = (
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(
                context=context,
                last_message_at=datetime.utcnow()
            )
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def end_session(self, session_id: int) -> bool:
        """End a chat session.
        
        Args:
            session_id: Session ID
            
        Returns:
            True if ended successfully
        """
        query = (
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(
                status=SessionStatus.ENDED,
                ended_at=datetime.utcnow()
            )
        )
        
        result = await self.db.execute(query)
        return result.rowcount > 0
    
    async def get_session_stats(
        self,
        user_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get session statistics.
        
        Args:
            user_id: Filter by user ID
            days: Number of days to consider
            
        Returns:
            Dictionary with session statistics
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        base_query = select(func.count(ChatSession.id)).where(
            ChatSession.created_at >= cutoff_date
        )
        
        if user_id:
            base_query = base_query.where(ChatSession.user_id == user_id)
        
        # Total sessions
        total_result = await self.db.execute(base_query)
        total_sessions = total_result.scalar()
        
        # Active sessions
        active_query = base_query.where(ChatSession.status == SessionStatus.ACTIVE)
        active_result = await self.db.execute(active_query)
        active_sessions = active_result.scalar()
        
        # Average session duration (for ended sessions)
        duration_query = select(
            func.avg(
                func.extract('epoch', ChatSession.ended_at - ChatSession.created_at)
            )
        ).where(
            and_(
                ChatSession.status == SessionStatus.ENDED,
                ChatSession.ended_at.isnot(None),
                ChatSession.created_at >= cutoff_date
            )
        )
        
        if user_id:
            duration_query = duration_query.where(ChatSession.user_id == user_id)
        
        duration_result = await self.db.execute(duration_query)
        avg_duration = duration_result.scalar() or 0
        
        return {
            'total_sessions': total_sessions,
            'active_sessions': active_sessions,
            'average_duration_seconds': avg_duration
        }


class ChatMessageRepository(BaseRepository[ChatMessage]):
    """Repository for chat message operations."""
    
    def __init__(self, db=None):
        super().__init__(db, ChatMessage)
    
    async def get_session_messages(
        self,
        session_id: int,
        skip: int = 0,
        limit: int = 100,
        order_desc: bool = False
    ) -> List[ChatMessage]:
        """Get messages for a chat session.
        
        Args:
            session_id: Session ID
            skip: Number of records to skip
            limit: Maximum number of records
            order_desc: Whether to order in descending order
            
        Returns:
            List of chat messages
        """
        query = select(ChatMessage).where(ChatMessage.session_id == session_id)
        
        if order_desc:
            query = query.order_by(ChatMessage.created_at.desc())
        else:
            query = query.order_by(ChatMessage.created_at.asc())
        
        query = query.offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_recent_messages(
        self,
        session_id: int,
        count: int = 10
    ) -> List[ChatMessage]:
        """Get recent messages for context.
        
        Args:
            session_id: Session ID
            count: Number of recent messages
            
        Returns:
            List of recent messages in chronological order
        """
        query = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(count)
        )
        
        result = await self.db.execute(query)
        messages = result.scalars().all()
        
        # Return in chronological order (oldest first)
        return list(reversed(messages))
    
    async def create_message(
        self,
        session_id: int,
        role: MessageRole,
        content: str,
        tokens_used: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> ChatMessage:
        """Create a new chat message.
        
        Args:
            session_id: Session ID
            role: Message role (user, assistant, system)
            content: Message content
            tokens_used: Number of tokens used
            metadata: Additional metadata
            
        Returns:
            Created chat message
        """
        message_data = {
            'session_id': session_id,
            'role': role,
            'content': content,
            'tokens_used': tokens_used,
            'metadata': metadata or {}
        }
        
        message = await self.create(**message_data)
        
        # Update session's last_message_at timestamp
        await self._update_session_timestamp(session_id)
        
        return message
    
    async def _update_session_timestamp(self, session_id: int) -> None:
        """Update session's last_message_at timestamp.
        
        Args:
            session_id: Session ID
        """
        query = (
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(last_message_at=datetime.utcnow())
        )
        
        await self.db.execute(query)
    
    async def get_message_stats(
        self,
        session_id: Optional[int] = None,
        user_id: Optional[int] = None,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get message statistics.
        
        Args:
            session_id: Filter by session ID
            user_id: Filter by user ID (via session)
            days: Number of days to consider
            
        Returns:
            Dictionary with message statistics
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        base_query = select(func.count(ChatMessage.id)).where(
            ChatMessage.created_at >= cutoff_date
        )
        
        if session_id:
            base_query = base_query.where(ChatMessage.session_id == session_id)
        elif user_id:
            # Join with sessions to filter by user
            base_query = base_query.join(ChatSession).where(
                ChatSession.user_id == user_id
            )
        
        # Total messages
        total_result = await self.db.execute(base_query)
        total_messages = total_result.scalar()
        
        # Messages by role
        role_stats = {}
        for role in MessageRole:
            role_query = base_query.where(ChatMessage.role == role)
            role_result = await self.db.execute(role_query)
            role_stats[role.value] = role_result.scalar()
        
        # Total tokens used
        tokens_query = select(func.sum(ChatMessage.tokens_used)).where(
            ChatMessage.created_at >= cutoff_date
        )
        
        if session_id:
            tokens_query = tokens_query.where(ChatMessage.session_id == session_id)
        elif user_id:
            tokens_query = tokens_query.join(ChatSession).where(
                ChatSession.user_id == user_id
            )
        
        tokens_result = await self.db.execute(tokens_query)
        total_tokens = tokens_result.scalar() or 0
        
        return {
            'total_messages': total_messages,
            'by_role': role_stats,
            'total_tokens': total_tokens
        }
    
    async def search_messages(
        self,
        search_term: str,
        session_id: Optional[int] = None,
        user_id: Optional[int] = None,
        role: Optional[MessageRole] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[ChatMessage]:
        """Search messages by content.
        
        Args:
            search_term: Search term
            session_id: Filter by session ID
            user_id: Filter by user ID (via session)
            role: Filter by message role
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of matching messages
        """
        search_pattern = f"%{search_term}%"
        query = select(ChatMessage).where(
            ChatMessage.content.ilike(search_pattern)
        )
        
        if session_id:
            query = query.where(ChatMessage.session_id == session_id)
        elif user_id:
            query = query.join(ChatSession).where(ChatSession.user_id == user_id)
        
        if role:
            query = query.where(ChatMessage.role == role)
        
        query = query.order_by(ChatMessage.created_at.desc()).offset(skip).limit(limit)
        
        result = await self.db.execute(query)
        return result.scalars().all()
    
    async def get_conversation_context(
        self,
        session_id: int,
        max_messages: int = 20,
        max_tokens: int = 4000
    ) -> List[ChatMessage]:
        """Get conversation context for AI model.
        
        Args:
            session_id: Session ID
            max_messages: Maximum number of messages
            max_tokens: Maximum total tokens
            
        Returns:
            List of messages for context (oldest first)
        """
        # Get recent messages
        query = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(max_messages)
        )
        
        result = await self.db.execute(query)
        messages = list(result.scalars().all())
        
        # Filter by token count if needed
        if max_tokens > 0:
            filtered_messages = []
            total_tokens = 0
            
            for message in messages:
                message_tokens = message.tokens_used or len(message.content) // 4  # Rough estimate
                if total_tokens + message_tokens <= max_tokens:
                    filtered_messages.append(message)
                    total_tokens += message_tokens
                else:
                    break
            
            messages = filtered_messages
        
        # Return in chronological order (oldest first)
        return list(reversed(messages))
    
    async def delete_session_messages(
        self,
        session_id: int,
        older_than: Optional[datetime] = None
    ) -> int:
        """Delete messages from a session.
        
        Args:
            session_id: Session ID
            older_than: Only delete messages older than this date
            
        Returns:
            Number of deleted messages
        """
        from sqlalchemy import delete
        
        query = delete(ChatMessage).where(ChatMessage.session_id == session_id)
        
        if older_than:
            query = query.where(ChatMessage.created_at < older_than)
        
        result = await self.db.execute(query)
        return result.rowcount
    
    async def get_user_message_history(
        self,
        user_id: int,
        days: int = 30,
        skip: int = 0,
        limit: int = 100
    ) -> List[ChatMessage]:
        """Get user's message history across all sessions.
        
        Args:
            user_id: User ID
            days: Number of days to look back
            skip: Number of records to skip
            limit: Maximum number of records
            
        Returns:
            List of user's messages
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        query = (
            select(ChatMessage)
            .join(ChatSession)
            .where(
                and_(
                    ChatSession.user_id == user_id,
                    ChatMessage.created_at >= cutoff_date
                )
            )
            .order_by(ChatMessage.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        
        result = await self.db.execute(query)
        return result.scalars().all()