"""Chat service for AI-powered chatbot functionality.

Handles chat sessions, message processing, AI integration with Gemini/OpenAI,
streaming responses, and conversation context management.
"""

from typing import Optional, List, Dict, Any, AsyncGenerator
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    ValidationError,
    NotFoundError,
    RateLimitError,
    ServiceError,
    PermissionError
)
from app.models.chat import ChatSession, MessageRole
from app.models.user import User, UserRole
from app.models.audit_log import AuditAction, AuditSeverity
from app.repositories.chat_repository import ChatRepository, ChatMessageRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ChatSessionResponse,
    ChatMessageResponse,
    ChatHistoryResponse
)
from app.utils.ai import AIService, get_ai_response, stream_ai_response

from app.utils.content_filter import ContentFilter, filter_user_content, moderate_ai_content
from app.services.cache_service import CacheService


class ChatService:
    """Service for chat and AI interaction operations."""
    
    def __init__(
        self,
        db: Optional[AsyncSession] = None,
        ai_service: Optional[AIService] = None,
        cache_service: Optional[CacheService] = None,
        content_filter: Optional[ContentFilter] = None
    ):
        self.db = db
        self.chat_repo = ChatRepository(db) if db else None
        self.message_repo = ChatMessageRepository(db) if db else None
        self.audit_repo = AuditLogRepository(db) if db else None
        self.ai_service = ai_service or AIService()
        self.cache_service = cache_service
        self.content_filter = content_filter
        
        # Configuration
        self.max_context_messages = 10
        self.max_message_length = 4000
        self.rate_limit_per_hour = 50
        self.rate_limit_per_minute = 10
    
    async def create_session(
        self,
        user: User,
        title: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None
    ) -> ChatSessionResponse:
        """Create a new chat session.
        
        Args:
            user: User creating the session
            title: Optional session title
            metadata: Optional session metadata
            ip_address: Client IP address
            
        Returns:
            Created chat session
        """
        session = await self.chat_repo.create_session(
            user_id=user.id,
            title=title or f"Chat Session {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            context=metadata or {},
            settings={}
        )
        session_uuid = session.session_uuid
        
        # Log audit event
        await self._log_audit(
            AuditAction.CHAT_STARTED,
            actor_id=user.id,
            target_type="chat_session",
            target_id=session.id,
            tenant_id=user.tenant_id,
            details=f"Chat session created: {session_uuid}",
            ip_address=ip_address
        )
        
        return ChatSessionResponse.from_orm(session)
    
    async def get_session(
        self,
        session_uuid: str,
        user: User
    ) -> ChatSessionResponse:
        """Get chat session by UUID.
        
        Args:
            session_uuid: Session UUID
            user: Requesting user
            
        Returns:
            Chat session
            
        Raises:
            NotFoundError: If session not found
            PermissionError: If user lacks access
        """
        session = await self.chat_repo.get_by_uuid(session_uuid)
        if not session:
            raise NotFoundError("Chat session not found")
        
        # Check access permissions
        if not await self._check_session_access(session, user):
            raise PermissionError("Access denied")
        
        return ChatSessionResponse.from_orm(session)
    
    async def chat(
        self,
        chat_request: ChatRequest,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> ChatResponse:
        """Process chat message and get AI response.
        
        Args:
            chat_request: Chat request data
            user: User sending the message
            ip_address: Client IP address
            user_agent: Client user agent
            
        Returns:
            Chat response with AI reply
            
        Raises:
            ValidationError: If request is invalid
            RateLimitError: If rate limit exceeded
            ServiceError: If AI service fails
        """
        # Check rate limits
        await self._check_rate_limits(user.id, ip_address)
        
        # Validate message content
        await self._validate_message_content(chat_request.prompt)
        
        # Get or create session
        session = None
        if chat_request.session_id:
            try:
                session_response = await self.get_session(chat_request.session_id, user)
                session = await self.chat_repo.get_by_uuid(chat_request.session_id)
            except NotFoundError:
                pass
        
        if not session:
            session_response = await self.create_session(
                user=user,
                title=self._generate_session_title(chat_request.prompt),
                metadata=chat_request.metadata,
                ip_address=ip_address
            )
            session = await self.chat_repo.get_by_uuid(session_response.session_uuid)
        
        # Store user message
        user_message = await self.message_repo.create_message(
            session_id=session.id,
            role=MessageRole.USER,
            content=chat_request.prompt,
            metadata={
                'ip_address': ip_address,
                'user_agent': user_agent,
                **chat_request.metadata
            }
        )
        
        try:
            # Get conversation context
            context_messages = await self._get_conversation_context(session.id)
            
            # Check cache for similar queries
            cache_key = None
            if self.cache_service and len(chat_request.prompt) > 20:
                cache_key = f"chat_response:{hash(chat_request.prompt.lower().strip())}"
                cached_response = await self.cache_service.get(cache_key)
                if cached_response:
                    # Store cached response as assistant message
                    assistant_message = await self.message_repo.create_message(
                        session_id=session.id,
                        role=MessageRole.ASSISTANT,
                        content=cached_response['content'],
                        tokens_used=0,  # Cached response
                        metadata={'cached': True, 'original_tokens': cached_response.get('tokens', 0)}
                    )
                    
                    return ChatResponse(
                        session_id=session.session_uuid,
                        message_id=assistant_message.id,
                        content=cached_response['content'],
                        tokens_used=0,
                        cached=True,
                        timestamp=assistant_message.created_at
                    )
            
            # Get AI response
            ai_response = await get_ai_response(
                prompt=chat_request.prompt,
                context_messages=context_messages,
                user_context={
                    'user_id': user.id,
                    'tenant_id': user.tenant_id,
                    'role': user.role.value
                }
            )
            
            # Moderate AI response
            moderation_result = await moderate_ai_content(ai_response.content)
            if not moderation_result.is_safe:
                ai_response.content = moderation_result.filtered_content or "I apologize, but I cannot provide that response due to safety guidelines."
            
            # Store assistant message
            assistant_message = await self.message_repo.create_message(
                session_id=session.id,
                role=MessageRole.ASSISTANT,
                content=ai_response.content,
                tokens_used=ai_response.tokens_used,
                metadata={
                    'model': ai_response.model,
                    'provider': ai_response.provider
                }
            )
            
            # Cache response for future similar queries
            if self.cache_service and cache_key and ai_response.tokens_used > 0:
                await self.cache_service.set(
                    cache_key,
                    {
                        'content': ai_response.content,
                        'tokens': ai_response.tokens_used
                    },
                    expire=3600  # 1 hour
                )
            
            # Update session activity
            await self.chat_repo.update(
                session.id,
                last_message_at=datetime.utcnow(),
                message_count=session.message_count + 2  # user + assistant
            )
            
            # Log audit event
            await self._log_audit(
                AuditAction.CHAT_MESSAGE_SENT,
                actor_id=user.id,
                target_type="chat_session",
                target_id=session.id,
                tenant_id=user.tenant_id,
                details=f"Chat interaction - tokens used: {ai_response.tokens_used}",
                ip_address=ip_address,
                metadata={
                    'tokens_used': ai_response.tokens_used,
                    'model': ai_response.model,
                    'provider': ai_response.provider
                }
            )
            
            return ChatResponse(
                session_id=session.session_uuid,
                message_id=assistant_message.id,
                content=ai_response.content,
                tokens_used=ai_response.tokens_used,
                cached=False,
                timestamp=assistant_message.created_at
            )
            
        except Exception as e:
            # Store error message
            await self.message_repo.create_message(
                session_id=session.id,
                role=MessageRole.SYSTEM,
                content=f"Error processing request: {str(e)}",
                metadata={'error': True, 'error_type': type(e).__name__}
            )
            
            raise ServiceError(f"Failed to process chat request: {str(e)}")
    
    async def stream_chat(
        self,
        chat_request: ChatRequest,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process chat message with streaming response.
        
        Args:
            chat_request: Chat request data
            user: User sending the message
            ip_address: Client IP address
            user_agent: Client user agent
            
        Yields:
            Streaming response chunks
            
        Raises:
            ValidationError: If request is invalid
            RateLimitError: If rate limit exceeded
            ServiceError: If AI service fails
        """
        # Check rate limits
        await self._check_rate_limits(user.id, ip_address)
        
        # Validate message content
        await self._validate_message_content(chat_request.prompt)
        
        # Get or create session
        session = None
        if chat_request.session_id:
            try:
                session_response = await self.get_session(chat_request.session_id, user)
                session = await self.chat_repo.get_by_uuid(chat_request.session_id)
            except NotFoundError:
                pass
        
        if not session:
            session_response = await self.create_session(
                user=user,
                title=self._generate_session_title(chat_request.prompt),
                metadata=chat_request.metadata,
                ip_address=ip_address
            )
            session = await self.chat_repo.get_by_uuid(session_response.session_uuid)
        
        # Store user message
        user_message = await self.message_repo.create_message(
            session_id=session.id,
            role=MessageRole.USER,
            content=chat_request.prompt,
            metadata={
                'ip_address': ip_address,
                'user_agent': user_agent,
                **chat_request.metadata
            }
        )
        
        # Yield session info
        yield {
            'type': 'session',
            'session_id': session.session_uuid,
            'message_id': user_message.id
        }
        
        try:
            # Get conversation context
            context_messages = await self._get_conversation_context(session.id)
            
            # Stream AI response
            full_content = ""
            total_tokens = 0
            
            async for chunk in stream_ai_response(
                prompt=chat_request.prompt,
                context_messages=context_messages,
                user_context={
                    'user_id': user.id,
                    'tenant_id': user.tenant_id,
                    'role': user.role.value
                }
            ):
                full_content += chunk.content
                total_tokens = chunk.tokens_used
                
                yield {
                    'type': 'content',
                    'content': chunk.content,
                    'tokens_used': chunk.tokens_used
                }
            
            # Moderate complete AI response
            moderation_result = await moderate_ai_content(full_content)
            if not moderation_result.is_safe:
                full_content = moderation_result.filtered_content or "I apologize, but I cannot provide that response due to safety guidelines."
            
            # Store complete assistant message
            assistant_message = await self.message_repo.create_message(
                session_id=session.id,
                role=MessageRole.ASSISTANT,
                content=full_content,
                tokens_used=total_tokens,
                metadata={
                    'streamed': True,
                    'model': 'gemini-pro',  # Default model
                    'provider': 'gemini'
                }
            )
            
            # Update session activity
            await self.chat_repo.update(
                session.id,
                last_message_at=datetime.utcnow(),
                message_count=session.message_count + 2
            )
            
            # Yield completion
            yield {
                'type': 'complete',
                'message_id': assistant_message.id,
                'total_tokens': total_tokens
            }
            
            # Log audit event
            await self._log_audit(
                AuditAction.CHAT_MESSAGE_SENT,
                actor_id=user.id,
                target_type="chat_session",
                target_id=session.id,
                tenant_id=user.tenant_id,
                details=f"Streaming chat interaction - tokens used: {total_tokens}",
                ip_address=ip_address,
                metadata={
                    'tokens_used': total_tokens,
                    'streamed': True
                }
            )
            
        except Exception as e:
            yield {
                'type': 'error',
                'error': str(e)
            }
    
    async def get_chat_history(
        self,
        session_uuid: str,
        user: User,
        page: int = 1,
        limit: int = 50
    ) -> ChatHistoryResponse:
        """Get chat history for a session.
        
        Args:
            session_uuid: Session UUID
            user: Requesting user
            page: Page number
            limit: Messages per page
            
        Returns:
            Chat history
            
        Raises:
            NotFoundError: If session not found
            PermissionError: If user lacks access
        """
        session = await self.chat_repo.get_by_uuid(session_uuid)
        if not session:
            raise NotFoundError("Chat session not found")
        
        # Check access permissions
        if not await self._check_session_access(session, user):
            raise PermissionError("Access denied")
        
        # Get messages
        messages = await self.message_repo.get_session_messages(
            session.id,
            skip=(page - 1) * limit,
            limit=limit
        )
        total = await self.message_repo.count({'session_id': session.id})
        
        message_responses = [ChatMessageResponse.from_orm(msg) for msg in messages]
        
        return ChatHistoryResponse(
            session_id=session_uuid,
            messages=message_responses,
            total=total,
            page=page,
            limit=limit,
            total_pages=(total + limit - 1) // limit
        )
    
    async def get_user_sessions(
        self,
        user: User,
        page: int = 1,
        limit: int = 20
    ) -> List[ChatSessionResponse]:
        """Get user's chat sessions.
        
        Args:
            user: User
            page: Page number
            limit: Sessions per page
            
        Returns:
            List of chat sessions
        """
        sessions = await self.chat_repo.get_user_sessions(
            user.id,
            skip=(page - 1) * limit,
            limit=limit
        )
        
        return [ChatSessionResponse.from_orm(session) for session in sessions]
    
    async def delete_session(
        self,
        session_uuid: str,
        user: User,
        ip_address: Optional[str] = None
    ) -> bool:
        """Delete a chat session.
        
        Args:
            session_uuid: Session UUID
            user: User deleting the session
            ip_address: Client IP address
            
        Returns:
            True if deleted successfully
            
        Raises:
            NotFoundError: If session not found
            PermissionError: If user lacks access
        """
        session = await self.chat_repo.get_by_uuid(session_uuid)
        if not session:
            raise NotFoundError("Chat session not found")
        
        # Check access permissions
        if not await self._check_session_access(session, user):
            raise PermissionError("Access denied")
        
        # Delete session and associated messages
        await self.message_repo.delete_session_messages(session.id)
        await self.chat_repo.delete(session.id)
        
        return True
    
    async def _check_rate_limits(
        self,
        user_id: int,
        ip_address: Optional[str] = None
    ) -> None:
        """Check chat rate limits.
        
        Args:
            user_id: User ID
            ip_address: Client IP address
            
        Raises:
            RateLimitError: If rate limit exceeded
        """
        if not self.cache_service:
            return
        
        now = datetime.utcnow()
        
        # Check per-minute limit
        minute_key = f"chat_rate:{user_id}:{now.strftime('%Y%m%d%H%M')}"
        minute_count = await self.cache_service.get(minute_key) or 0
        
        if int(minute_count) >= self.rate_limit_per_minute:
            raise RateLimitError("Too many chat requests per minute")
        
        # Check per-hour limit
        hour_key = f"chat_rate:{user_id}:{now.strftime('%Y%m%d%H')}"
        hour_count = await self.cache_service.get(hour_key) or 0
        
        if int(hour_count) >= self.rate_limit_per_hour:
            raise RateLimitError("Too many chat requests per hour")
        
        # Increment counters
        await self.cache_service.set(minute_key, int(minute_count) + 1, expire=60)
        await self.cache_service.set(hour_key, int(hour_count) + 1, expire=3600)
    
    async def _validate_message_content(self, content: str) -> None:
        """Validate message content.
        
        Args:
            content: Message content
            
        Raises:
            ValidationError: If content is invalid
        """
        if not content or not content.strip():
            raise ValidationError("Message content cannot be empty")
        
        if len(content) > self.max_message_length:
            raise ValidationError(f"Message too long (max {self.max_message_length} characters)")
        
        # Content filtering
        filter_result = await filter_user_content(content)
        if not filter_result.is_safe:
            raise ValidationError(f"Message content violates safety guidelines: {filter_result.reason}")
    
    async def _get_conversation_context(
        self,
        session_id: int
    ) -> List[Dict[str, str]]:
        """Get conversation context for AI.
        
        Args:
            session_id: Session ID
            
        Returns:
            List of context messages
        """
        # Get recent messages from cache or database
        cache_key = f"chat_context:{session_id}"
        if self.cache_service:
            cached_context = await self.cache_service.get(cache_key)
            if cached_context:
                return cached_context
        
        messages = await self.message_repo.get_recent_messages(
            session_id,
            count=self.max_context_messages
        )
        
        context = []
        for msg in messages:
            if msg.role in [MessageRole.USER, MessageRole.ASSISTANT]:
                context.append({
                    'role': msg.role.value,
                    'content': msg.content
                })
        
        # Cache context
        if self.cache_service:
            await self.cache_service.set(
                cache_key,
                context,
                expire=300  # 5 minutes
            )
        
        return context
    
    async def _check_session_access(
        self,
        session: ChatSession,
        user: User
    ) -> bool:
        """Check if user can access session.
        
        Args:
            session: Chat session
            user: User requesting access
            
        Returns:
            True if access allowed
        """
        # Users can only access their own sessions
        if session.user_id == user.id:
            return True
        
        # Admins can access all sessions
        if user.role == UserRole.ADMIN:
            return True
        
        # Tenant admins can access sessions in their tenant
        if user.role == UserRole.TENANT_ADMIN:
            session_user = await self.db.get(User, session.user_id)
            if session_user and session_user.tenant_id == user.tenant_id:
                return True
        
        return False
    
    def _generate_session_title(self, prompt: str) -> str:
        """Generate session title from first prompt.
        
        Args:
            prompt: First user prompt
            
        Returns:
            Generated title
        """
        # Take first 50 characters and clean up
        title = prompt.strip()[:50]
        if len(prompt) > 50:
            title += "..."
        
        # Remove newlines and extra spaces
        title = ' '.join(title.split())
        
        return title or f"Chat {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
    
    async def _log_audit(
        self,
        action: AuditAction,
        actor_id: Optional[int] = None,
        target_type: Optional[str] = None,
        target_id: Optional[int] = None,
        tenant_id: Optional[int] = None,
        details: Optional[str] = None,
        ip_address: Optional[str] = None,
        severity: AuditSeverity = AuditSeverity.INFO,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Log audit event.
        
        Args:
            action: Audit action
            actor_id: Actor user ID
            target_type: Target entity type
            target_id: Target entity ID
            tenant_id: Tenant ID
            details: Event details
            ip_address: Client IP address
            severity: Event severity
            metadata: Additional metadata
        """
        try:
            await self.audit_repo.create_log(
                action=action,
                actor_id=actor_id,
                target_type=target_type,
                target_id=target_id,
                tenant_id=tenant_id,
                details=details,
                ip_address=ip_address,
                severity=severity,
                metadata=metadata
            )
        except Exception:
            # Don't let audit logging failures break the main flow
            pass