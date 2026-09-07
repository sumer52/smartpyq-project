"""Chat API Routes

Handles AI chatbot interactions, streaming responses, and session management.
"""

import json
from datetime import datetime
from typing import List, Optional, AsyncGenerator

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from pydantic import BaseModel, Field
from sse_starlette import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.dependencies import (
    get_current_active_user,
    get_current_tenant,
    get_client_ip
)
from ..core.exceptions import (
    ValidationError,
    RateLimitError,
    NotFoundError
)
from ..models.user import User
from ..models.tenant import Tenant
from ..schemas.chat import ChatRequest as ChatRequestSchema
from ..services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])

# Request/Response Models
class ChatRequest(BaseModel):
    """Chat message request"""
    prompt: str = Field(..., min_length=1, max_length=4000, description="User message")
    session_id: Optional[str] = Field(None, description="Chat session ID (optional for new session)")
    metadata: Optional[dict] = Field(default_factory=dict, description="Additional context metadata")
    stream: bool = Field(default=True, description="Enable streaming response")

class ChatResponse(BaseModel):
    """Chat response model"""
    session_id: str
    message_id: int
    response: str
    tokens_used: int
    model_used: Optional[str] = None
    created_at: datetime

class ChatMessage(BaseModel):
    """Chat message model"""
    id: int
    role: str  # user, assistant, system
    content: str
    tokens_used: int
    created_at: datetime

class ChatSession(BaseModel):
    """Chat session model"""
    id: int
    session_uuid: str
    started_at: datetime
    message_count: int
    total_tokens: int

class ChatHistoryResponse(BaseModel):
    """Chat history response"""
    session: ChatSession
    messages: List[ChatMessage]

class SessionListResponse(BaseModel):
    """User chat sessions list"""
    sessions: List[ChatSession]
    total: int

class StreamChunk(BaseModel):
    """Streaming response chunk"""
    session_id: str
    content: str
    finished: bool = False
    tokens_used: Optional[int] = None
    error: Optional[str] = None


def get_chat_service(db: AsyncSession = Depends(get_db)) -> ChatService:
    """Build a ChatService bound to the request's database session."""
    return ChatService(db=db)


class SimpleChatRequest(BaseModel):
    """Simple chat request (no auth required)"""
    prompt: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = Field(None)

class SimpleChatResponse(BaseModel):
    """Simple chat response"""
    response: str
    session_id: Optional[str] = None

@router.post("/simple", response_model=SimpleChatResponse)
async def simple_chat(request: SimpleChatRequest):
    """Simple chat endpoint - no authentication required"""
    try:
        from app.utils.ai import get_ai_response, ai_service
        has_ai = (ai_service.gemini_client is not None) or (ai_service.openai_client is not None)

        if not has_ai:
            prompt_lower = request.prompt.lower()
            if any(w in prompt_lower for w in ["paper", "pyq", "previous", "question"]):
                response = "You can find previous year papers in the PYQ Hub! Navigate to the PYQ Hub section to browse papers by stream, semester, and subject."
            elif any(w in prompt_lower for w in ["upload", "submit", "add"]):
                response = "To upload a paper, go to the Upload page. You can upload PDF or image files with stream, semester, subject, and year info."
            elif any(w in prompt_lower for w in ["hi", "hello", "hey", "help"]):
                response = "Hello! I am SmartPYQ study assistant. I can help with finding papers, study tips, exam patterns, and navigating the platform. How can I help?"
            elif any(w in prompt_lower for w in ["study", "exam", "prepare", "tip"]):
                response = "Study tips: 1. Practice with PYQs 2. Focus on repeated questions 3. Time management 4. Revise regularly 5. Analyze patterns"
            else:
                response = "I am in basic mode (AI API not configured). I can help you navigate: PYQ Hub for papers, Upload to share papers, Search to find papers, Analysis for exam patterns."
            return SimpleChatResponse(response=response, session_id=request.session_id)

        result = await get_ai_response(prompt=request.prompt)
        return SimpleChatResponse(response=result.content, session_id=request.session_id)
    except (ImportError, Exception):
        # AI not configured or API keys invalid - provide helpful fallback
        prompt_lower = request.prompt.lower()
        if any(w in prompt_lower for w in ["paper", "pyq", "previous", "question"]):
            response = "You can find previous year papers in the PYQ Hub! Navigate to browse papers by stream, semester, and subject."
        elif any(w in prompt_lower for w in ["upload", "submit", "add"]):
            response = "To upload a paper, go to the Upload page. You can upload PDF or image files."
        elif any(w in prompt_lower for w in ["hi", "hello", "hey", "help"]):
            response = "Hello! I am SmartPYQ study assistant. I can help with finding papers, study tips, and exam patterns. How can I help?"
        elif any(w in prompt_lower for w in ["study", "exam", "prepare", "tip"]):
            response = "Study tips: 1. Practice with PYQs 2. Focus on repeated questions 3. Time management 4. Revise regularly 5. Analyze patterns"
        else:
            response = "I am in basic mode. I can help navigate: PYQ Hub for papers, Upload to share, Search to find papers, Analysis for patterns."
        return SimpleChatResponse(response=response, session_id=request.session_id)

@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    chat_service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    client_ip: str = Depends(get_client_ip)
):
    """Send chat message to AI assistant

    Processes user message and returns AI response. Creates a new session
    if session_id is not provided. Streaming requests go to /chat/stream.
    """
    try:
        result = await chat_service.chat(
            chat_request=ChatRequestSchema(
                prompt=request.prompt,
                session_id=request.session_id,
                metadata=request.metadata
            ),
            user=current_user,
            ip_address=client_ip
        )

        return ChatResponse(
            session_id=result.session_id,
            message_id=result.message_id,
            response=result.content,
            tokens_used=result.tokens_used,
            model_used=None,
            created_at=result.timestamp or datetime.utcnow()
        )

    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except RateLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chat processing failed. Please try again."
        )

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    chat_service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user),
    current_tenant: Tenant = Depends(get_current_tenant),
    client_ip: str = Depends(get_client_ip)
):
    """Stream chat response using Server-Sent Events

    Returns streaming response for real-time chat experience.
    Each chunk contains partial response content.
    """
    async def generate_stream() -> AsyncGenerator[str, None]:
        stream_session_id = request.session_id or "unknown"
        try:
            async for chunk in chat_service.stream_chat(
                chat_request=ChatRequestSchema(
                    prompt=request.prompt,
                    session_id=request.session_id,
                    metadata=request.metadata
                ),
                user=current_user,
                ip_address=client_ip
            ):
                chunk_type = chunk.get('type')
                if chunk_type == 'session':
                    stream_session_id = chunk['session_id']
                    yield StreamChunk(session_id=stream_session_id, content='').model_dump_json()
                elif chunk_type == 'content':
                    yield StreamChunk(session_id=stream_session_id, content=chunk['content'], tokens_used=chunk.get('tokens_used')).model_dump_json()
                elif chunk_type == 'complete':
                    yield StreamChunk(session_id=stream_session_id, content='', finished=True, tokens_used=chunk.get('total_tokens')).model_dump_json()
                    break
                elif chunk_type == 'error':
                    yield StreamChunk(session_id=stream_session_id, content='', finished=True, error=chunk.get('error')).model_dump_json()
                    break

        except ValidationError as e:
            yield StreamChunk(
                session_id=stream_session_id,
                content="",
                finished=True,
                error=str(e)
            ).model_dump_json()

        except RateLimitError as e:
            yield StreamChunk(
                session_id=stream_session_id,
                content="",
                finished=True,
                error=f"Rate limit exceeded: {str(e)}"
            ).model_dump_json()

        except Exception as e:
            yield StreamChunk(
                session_id=stream_session_id,
                content="",
                finished=True,
                error="Chat processing failed. Please try again."
            ).model_dump_json()

    return EventSourceResponse(
        generate_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*"
        }
    )

@router.get("/sessions", response_model=SessionListResponse)
async def get_user_sessions(
    page: int = 1,
    per_page: int = 20,
    chat_service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user)
):
    """Get user's chat sessions

    Returns paginated list of user's chat sessions with basic info.
    """
    try:
        sessions = await chat_service.get_user_sessions(
            user=current_user,
            page=page,
            limit=per_page
        )

        return SessionListResponse(
            sessions=[
                ChatSession(
                    id=s.id,
                    session_uuid=s.session_uuid,
                    started_at=s.started_at,
                    message_count=s.message_count,
                    total_tokens=s.total_tokens_used
                )
                for s in sessions
            ],
            total=len(sessions)
        )

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve chat sessions"
        )

@router.get("/{session_id}/history", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user)
):
    """Get chat session history

    Returns complete message history for specified session.
    Only accessible by session owner.
    """
    try:
        session = await chat_service.get_session(session_uuid=session_id, user=current_user)
        history = await chat_service.get_chat_history(session_uuid=session_id, user=current_user)

        return ChatHistoryResponse(
            session=ChatSession(
                id=session.id,
                session_uuid=session.session_uuid,
                started_at=session.started_at,
                message_count=session.message_count,
                total_tokens=session.total_tokens_used
            ),
            messages=[
                ChatMessage(
                    id=m.id,
                    role=m.role,
                    content=m.content,
                    tokens_used=m.tokens_used,
                    created_at=m.created_at
                )
                for m in history.messages
            ]
        )

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve chat history"
        )

@router.delete("/{session_id}")
async def delete_chat_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user),
    client_ip: str = Depends(get_client_ip)
):
    """Delete chat session

    Permanently removes chat session and all associated messages.
    Only accessible by session owner.
    """
    try:
        await chat_service.delete_session(
            session_uuid=session_id,
            user=current_user,
            ip_address=client_ip
        )

        return {"message": "Chat session deleted successfully"}

    except NotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat session not found"
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete chat session"
        )

# WebSocket endpoint for real-time chat (alternative to SSE)
@router.websocket("/ws/{session_id}")
async def websocket_chat(
    websocket,
    session_id: str,
    # Note: WebSocket authentication would need custom implementation
    # current_user: User = Depends(get_current_active_user)  # Not supported in WebSocket
):
    """WebSocket endpoint for real-time chat

    Alternative to SSE for browsers that prefer WebSocket connections.
    Requires custom authentication via query params or headers.
    """
    await websocket.accept()

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)

            # TODO: Implement WebSocket authentication
            # For now, this is a placeholder implementation

            # Process chat message
            # This would integrate with chat_service.stream_chat

            # Send response back to client
            await websocket.send_text(json.dumps({
                "type": "message",
                "content": "WebSocket chat not fully implemented yet",
                "session_id": session_id
            }))

    except Exception as e:
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": "Connection error occurred"
        }))
    finally:
        await websocket.close()