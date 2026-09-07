"""AI service integration for Gemini and OpenAI APIs.

Provides unified interface for AI chat functionality with fallback support.
"""

import asyncio
import logging
from enum import Enum
from typing import Dict, List, Optional, AsyncGenerator, Any, Union
from dataclasses import dataclass
from datetime import datetime

import google.generativeai as genai
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.exceptions import ServiceError, RateLimitError

logger = logging.getLogger(__name__)


class AIProvider(str, Enum):
    """AI provider enumeration."""
    GEMINI = "gemini"
    OPENAI = "openai"


@dataclass
class AIMessage:
    """AI message data structure."""
    role: str  # 'user', 'assistant', 'system'
    content: str
    timestamp: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class AIResponse:
    """AI response data structure."""
    content: str
    provider: AIProvider
    model: str
    tokens_used: int
    finish_reason: str
    metadata: Optional[Dict[str, Any]] = None


class AIService:
    """Unified AI service for chat functionality."""
    
    def __init__(self):
        """Initialize AI service with API clients."""
        self.gemini_client = None
        self.openai_client = None
        
        # Initialize Gemini
        if settings.GEMINI_API_KEY:
            try:
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self.gemini_client = genai.GenerativeModel('gemini-pro')
                logger.info("Gemini AI client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
        
        # Initialize OpenAI
        if settings.OPENAI_API_KEY:
            try:
                self.openai_client = AsyncOpenAI(
                    api_key=settings.OPENAI_API_KEY,
                    base_url=settings.OPENAI_BASE_URL,
                    timeout=30.0,  # 30s timeout for all AI calls
                    max_retries=2   # Auto-retry on transient errors
                )
                logger.info("OpenAI client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize OpenAI client: {e}")
        
        if not self.gemini_client and not self.openai_client:
            logger.warning("No AI providers configured")
    
    async def chat_completion(
        self,
        messages: List[AIMessage],
        provider: Optional[AIProvider] = None,
        stream: bool = False,
        **kwargs
    ) -> Union[AIResponse, AsyncGenerator[str, None]]:
        """Generate chat completion using specified or fallback provider.
        
        Args:
            messages: List of conversation messages
            provider: Preferred AI provider (optional)
            stream: Whether to stream response
            **kwargs: Additional provider-specific parameters
            
        Returns:
            AIResponse or async generator for streaming
            
        Raises:
            ServiceError: If no providers available or all fail
        """
        # Determine provider order
        providers_to_try = []
        if provider:
            providers_to_try.append(provider)
        
        # Add fallback providers
        if AIProvider.GEMINI not in providers_to_try and self.gemini_client:
            providers_to_try.append(AIProvider.GEMINI)
        if AIProvider.OPENAI not in providers_to_try and self.openai_client:
            providers_to_try.append(AIProvider.OPENAI)
        
        if not providers_to_try:
            raise ServiceError("No AI providers available")
        
        last_error = None
        
        for provider_type in providers_to_try:
            try:
                if stream:
                    return self._stream_completion(messages, provider_type, **kwargs)
                else:
                    return await self._complete_chat(messages, provider_type, **kwargs)
            except Exception as e:
                logger.warning(f"Provider {provider_type} failed: {e}")
                last_error = e
                continue
        
        raise ServiceError(f"All AI providers failed. Last error: {last_error}")
    
    async def _complete_chat(
        self,
        messages: List[AIMessage],
        provider: AIProvider,
        **kwargs
    ) -> AIResponse:
        """Complete chat using specific provider."""
        if provider == AIProvider.GEMINI:
            return await self._gemini_completion(messages, **kwargs)
        elif provider == AIProvider.OPENAI:
            return await self._openai_completion(messages, **kwargs)
        else:
            raise ServiceError(f"Unsupported provider: {provider}")
    
    async def _stream_completion(
        self,
        messages: List[AIMessage],
        provider: AIProvider,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion using specific provider."""
        if provider == AIProvider.GEMINI:
            async for chunk in self._gemini_stream(messages, **kwargs):
                yield chunk
        elif provider == AIProvider.OPENAI:
            async for chunk in self._openai_stream(messages, **kwargs):
                yield chunk
        else:
            raise ServiceError(f"Unsupported provider: {provider}")
    
    async def _gemini_completion(
        self,
        messages: List[AIMessage],
        **kwargs
    ) -> AIResponse:
        """Generate completion using Gemini API."""
        if not self.gemini_client:
            raise ServiceError("Gemini client not initialized")
        
        try:
            # Convert messages to Gemini format
            prompt = self._format_messages_for_gemini(messages)
            
            # Generate response
            response = await asyncio.to_thread(
                self.gemini_client.generate_content,
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=kwargs.get('temperature', 0.7),
                    max_output_tokens=kwargs.get('max_tokens', 1000),
                    top_p=kwargs.get('top_p', 0.8),
                    top_k=kwargs.get('top_k', 10)
                )
            )
            
            return AIResponse(
                content=response.text,
                provider=AIProvider.GEMINI,
                model="gemini-pro",
                tokens_used=response.usage_metadata.total_token_count if hasattr(response, 'usage_metadata') else 0,
                finish_reason=response.candidates[0].finish_reason.name if response.candidates else "unknown",
                metadata={
                    "safety_ratings": [rating.category.name for rating in response.candidates[0].safety_ratings] if response.candidates else []
                }
            )
            
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            if "quota" in str(e).lower() or "rate" in str(e).lower():
                raise RateLimitError("Gemini API rate limit exceeded")
            raise ServiceError(f"Gemini API error: {e}")
    
    async def _gemini_stream(
        self,
        messages: List[AIMessage],
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """Stream completion using Gemini API."""
        if not self.gemini_client:
            raise ServiceError("Gemini client not initialized")
        
        try:
            prompt = self._format_messages_for_gemini(messages)
            
            response = await asyncio.to_thread(
                self.gemini_client.generate_content,
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=kwargs.get('temperature', 0.7),
                    max_output_tokens=kwargs.get('max_tokens', 1000)
                ),
                stream=True
            )
            
            for chunk in response:
                if chunk.text:
                    yield chunk.text
                    
        except Exception as e:
            logger.error(f"Gemini streaming error: {e}")
            if "quota" in str(e).lower() or "rate" in str(e).lower():
                raise RateLimitError("Gemini API rate limit exceeded")
            raise ServiceError(f"Gemini streaming error: {e}")
    
    async def _openai_completion(
        self,
        messages: List[AIMessage],
        **kwargs
    ) -> AIResponse:
        """Generate completion using OpenAI API."""
        if not self.openai_client:
            raise ServiceError("OpenAI client not initialized")
        
        try:
            # Convert messages to OpenAI format
            openai_messages = self._format_messages_for_openai(messages)
            
            response = await self.openai_client.chat.completions.create(
                model=kwargs.get('model', settings.OPENAI_MODEL),
                messages=openai_messages,
                temperature=kwargs.get('temperature', 0.7),
                max_tokens=kwargs.get('max_tokens', 1000),
                top_p=kwargs.get('top_p', 1.0),
                frequency_penalty=kwargs.get('frequency_penalty', 0.0),
                presence_penalty=kwargs.get('presence_penalty', 0.0)
            )
            
            return AIResponse(
                content=response.choices[0].message.content,
                provider=AIProvider.OPENAI,
                model=response.model,
                tokens_used=response.usage.total_tokens,
                finish_reason=response.choices[0].finish_reason,
                metadata={
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens
                }
            )
            
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            if "rate_limit" in str(e).lower() or "quota" in str(e).lower():
                raise RateLimitError("OpenAI API rate limit exceeded")
            raise ServiceError(f"OpenAI API error: {e}")
    
    async def _openai_stream(
        self,
        messages: List[AIMessage],
        **kwargs
    ) -> AsyncGenerator[str, None]:
        """Stream completion using OpenAI API."""
        if not self.openai_client:
            raise ServiceError("OpenAI client not initialized")
        
        try:
            openai_messages = self._format_messages_for_openai(messages)
            
            stream = await self.openai_client.chat.completions.create(
                model=kwargs.get('model', settings.OPENAI_MODEL),
                messages=openai_messages,
                temperature=kwargs.get('temperature', 0.7),
                max_tokens=kwargs.get('max_tokens', 1000),
                stream=True
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            logger.error(f"OpenAI streaming error: {e}")
            if "rate_limit" in str(e).lower() or "quota" in str(e).lower():
                raise RateLimitError("OpenAI API rate limit exceeded")
            raise ServiceError(f"OpenAI streaming error: {e}")
    
    def _format_messages_for_gemini(self, messages: List[AIMessage]) -> str:
        """Format messages for Gemini API."""
        formatted_parts = []
        
        for message in messages:
            if message.role == "system":
                formatted_parts.append(f"System: {message.content}")
            elif message.role == "user":
                formatted_parts.append(f"User: {message.content}")
            elif message.role == "assistant":
                formatted_parts.append(f"Assistant: {message.content}")
        
        return "\n\n".join(formatted_parts)
    
    def _format_messages_for_openai(self, messages: List[AIMessage]) -> List[Dict[str, str]]:
        """Format messages for OpenAI API."""
        return [
            {
                "role": message.role,
                "content": message.content
            }
            for message in messages
        ]
    
    async def health_check(self) -> Dict[str, Any]:
        """Check health of AI providers."""
        health = {
            "gemini": {"available": bool(self.gemini_client), "status": "unknown"},
            "openai": {"available": bool(self.openai_client), "status": "unknown"}
        }
        
        # Test Gemini
        if self.gemini_client:
            try:
                test_response = await asyncio.to_thread(
                    self.gemini_client.generate_content,
                    "Hello",
                    generation_config=genai.types.GenerationConfig(max_output_tokens=10)
                )
                health["gemini"]["status"] = "healthy" if test_response.text else "error"
            except Exception as e:
                health["gemini"]["status"] = f"error: {str(e)[:100]}"
        
        # Test OpenAI
        if self.openai_client:
            try:
                test_response = await self.openai_client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": "Hello"}],
                    max_tokens=10
                )
                health["openai"]["status"] = "healthy" if test_response.choices[0].message.content else "error"
            except Exception as e:
                health["openai"]["status"] = f"error: {str(e)[:100]}"
        
        return health


# Global AI service instance
ai_service = AIService()


# Convenience functions
async def generate_chat_response(
    messages: List[Dict[str, str]],
    stream: bool = False,
    provider: Optional[AIProvider] = None
) -> Union[str, AsyncGenerator[str, None]]:
    """Generate chat response using AI service.
    
    Args:
        messages: List of message dictionaries with 'role' and 'content'
        stream: Whether to stream response
        provider: Preferred AI provider
        
    Returns:
        Response string or async generator for streaming
    """
    ai_messages = [
        AIMessage(role=msg["role"], content=msg["content"])
        for msg in messages
    ]
    
    if stream:
        return ai_service.chat_completion(ai_messages, provider=provider, stream=True)
    else:
        response = await ai_service.chat_completion(ai_messages, provider=provider, stream=False)
        return response.content


async def get_ai_health() -> Dict[str, Any]:
    """Get AI service health status."""
    return await ai_service.health_check()


SMARTPYQ_SYSTEM_PROMPT = """You are SmartPYQ AI, a friendly, intelligent, helpful, and conversational AI assistant built into the SmartPYQ website.

## Core Behavior

You are a general-purpose AI assistant. Do NOT restrict yourself to a fixed list of questions, predefined questions, or only education-related questions.

Users can ask you anything that is appropriate and within their capabilities, including:
- Education and academics
- Programming and computer science
- Mathematics, Science, History, General Knowledge
- Technology and Career advice
- Writing, Rewriting, Languages
- Coding and Debugging
- Explanations of concepts
- Study planning and Exam preparation
- Everyday questions and Casual conversations
- Questions unrelated to SmartPYQ or academics

Treat every user message as an independent request and determine what the user actually wants.

## Do NOT Restrict Questions

Never force the user to choose from predefined questions.
Never respond with messages such as:
- "Please ask one of the supported questions."
- "I can only answer questions about PYQs."
- "That question is outside my scope."

Instead, understand the user intent and provide the best answer you can.

## Conversational Intelligence

Understand follow-up questions, context from previous messages, short questions, misspelled words, informal language, Hinglish, different writing styles, and incomplete questions when the intended meaning is reasonably clear.

For example:
User: "what is recursion" - Answer normally.
User: "give example" - Understand they want an example of recursion from the previous message.
User: "in python" - Understand they want the recursion example in Python.

Do not make the user repeat the entire context.

## Friendly Personality

Be friendly, approachable, and conversational without being overly childish or excessively enthusiastic. Use a natural tone similar to a helpful AI assistant.

Be clear, helpful, patient, respectful, concise when the question is simple, and detailed when the question requires explanation.

Do not start every response with "Sure!", "Absolutely!", or "Great question!"

## Answer Quality

For simple questions: Give a direct answer.
For complex questions: Break the answer into logical sections.
For technical questions: Provide accurate explanations, examples, and code when appropriate.
For educational questions: Explain concepts in a way appropriate to the user level.

If the question is ambiguous and the ambiguity materially affects the answer, ask a concise clarification question. If the intended meaning is obvious, do NOT ask unnecessary clarification questions.

## SmartPYQ Knowledge

SmartPYQ is an educational platform for accessing and studying previous-year question papers. When users ask about SmartPYQ, PYQs, subjects, semesters, courses, exam patterns, repeated questions, or related academic content, provide SmartPYQ-specific assistance.

However, SmartPYQ context must NOT prevent you from answering unrelated questions. The user can ask about anything.

## Accuracy and Uncertainty

Never confidently invent facts. If you are uncertain, say so clearly.
Distinguish between known facts, reasonable explanations, estimates, and uncertain information.

## Programming

You can answer programming questions in Python, Java, JavaScript, C, C++, SQL, HTML, CSS, PHP, and other commonly used languages.
When providing code: make it readable, explain important parts, fix errors when the user provides code.

## Language

Respond in the language used by the user whenever practical. Support English, Hindi, Hinglish, and other languages when capable.

## Safety

Do not provide assistance that facilitates illegal, dangerous, malicious, or harmful activity.

## Most Important Rule

You are NOT a fixed-question chatbot. You are a general-purpose conversational AI assistant integrated into SmartPYQ. The user can ask any appropriate question. Your job is to understand the user intent and provide the most useful answer possible.

SmartPYQ is your platform context, not a restriction on what the user can ask. Be helpful, accurate, and conversational."""

async def get_ai_response(
    prompt: str,
    context_messages: Optional[List[Dict[str, str]]] = None,
    user_context: Optional[Dict[str, Any]] = None
) -> AIResponse:
    """Get AI response for a prompt.
    
    Args:
        prompt: User prompt
        context_messages: Conversation context
        user_context: Additional user context
        
    Returns:
        AIResponse object
    """
    messages = []
    
    # Add system message with context
    system_msg = SMARTPYQ_SYSTEM_PROMPT
    if user_context:
        system_msg += " User context: ID=" + str(user_context.get("user_id", "unknown")) + ", Role=" + str(user_context.get("role", "student"))
    messages.append(AIMessage(role="system", content=system_msg))
    
    # Add context messages
    if context_messages:
        for msg in context_messages:
            messages.append(AIMessage(role=msg["role"], content=msg["content"]))
    
    # Add user prompt
    messages.append(AIMessage(role="user", content=prompt))
    
    return await ai_service.chat_completion(messages, stream=False)


async def stream_ai_response(
    prompt: str,
    context_messages: Optional[List[Dict[str, str]]] = None,
    user_context: Optional[Dict[str, Any]] = None
) -> AsyncGenerator:
    """Stream AI response for a prompt.
    
    Args:
        prompt: User prompt
        context_messages: Conversation context
        user_context: Additional user context
        
    Yields:
        AIResponse chunks
    """
    messages = []
    
    # Add system message with context
    system_msg = SMARTPYQ_SYSTEM_PROMPT
    if user_context:
        system_msg += " User context: ID=" + str(user_context.get("user_id", "unknown")) + ", Role=" + str(user_context.get("role", "student"))
    messages.append(AIMessage(role="system", content=system_msg))
    
    # Add context messages
    if context_messages:
        for msg in context_messages:
            messages.append(AIMessage(role=msg["role"], content=msg["content"]))
    
    # Add user prompt
    messages.append(AIMessage(role="user", content=prompt))
    
    stream = await ai_service.chat_completion(messages, stream=True)
    async for chunk in stream:
        yield AIResponse(
            content=chunk,
            provider=AIProvider.GEMINI,
            model="gemini-pro",
            tokens_used=0,
            finish_reason="streaming"
        )