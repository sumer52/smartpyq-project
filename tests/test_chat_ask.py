"""Tests for the stateless general-purpose chat endpoint /api/v1/chat/ask.

The contract under test:
- POST /chat/ask with {message} returns an SSE stream of JSON frames
  (type: content | done | error) — no auth required, nothing persisted.
- With no AI provider configured, the stream carries a clean error frame
  (no stack traces, no provider details).
- The greeting shortcut answers bare greetings without an AI call.
- Oversized/empty messages are rejected with 422.
"""
import json

import pytest

from app.main import app


def parse_sse_frames(raw_text):
    """Extract JSON payloads from an SSE text body."""
    frames = []
    for frame in raw_text.split("\n\n"):
        for line in frame.split("\n"):
            if line.startswith("data:"):
                frames.append(json.loads(line[5:].strip()))
    return frames


@pytest.mark.asyncio
async def test_ask_rejects_oversized_message(client):
    """Messages over 4000 chars are rejected by request validation."""
    response = await client.post("/api/v1/chat/ask", json={"message": "x" * 4001})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ask_rejects_empty_message(client):
    response = await client.post("/api/v1/chat/ask", json={"message": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_ask_greeting_short_circuits_without_ai(client):
    """Bare greetings are answered locally; no AI provider needed."""
    response = await client.post("/api/v1/chat/ask", json={"message": "hi"})
    assert response.status_code == 200
    body = response.text
    frames = parse_sse_frames(body)
    types = [f.get("type") for f in frames]
    assert "content" in types
    assert types[-1] == "done"
    content = "".join(f.get("content", "") for f in frames if f.get("type") == "content")
    assert "Ask me anything" in content


@pytest.mark.asyncio
async def test_ask_without_ai_provider_emits_clean_error(client, monkeypatch):
    """No API keys configured (CI): the stream must carry a friendly error
    frame — never a stack trace, provider name, or key material."""
    # Force the no-provider path even on machines with a local .env.
    from app.utils.ai import ai_service
    monkeypatch.setattr(ai_service, "gemini_client", None)
    monkeypatch.setattr(ai_service, "openai_client", None)

    response = await client.post("/api/v1/chat/ask", json={"message": "Explain binary search in simple terms"})
    assert response.status_code == 200
    frames = parse_sse_frames(response.text)
    errors = [f for f in frames if f.get("type") == "error"]
    assert errors, "expected an error frame when no AI provider is configured"
    message = errors[0].get("message", "")
    assert "AI service is not configured" in message
    # No internals leak through the SSE stream.
    raw = response.text.lower()
    assert "traceback" not in raw
    assert "gemini" not in raw
    assert "api_key" not in raw


@pytest.mark.asyncio
async def test_ask_writes_nothing_to_database(client, db_session):
    """Stateless contract: asking a question must not create chat sessions
    or messages. The endpoint never touches the chat repositories."""
    from sqlalchemy import select, func
    from app.models.chat import ChatSession, ChatMessage

    await client.post("/api/v1/chat/ask", json={"message": "hi"})

    sessions = (await db_session.execute(select(func.count()).select_from(ChatSession))).scalar()
    messages = (await db_session.execute(select(func.count()).select_from(ChatMessage))).scalar()
    assert sessions == 0
    assert messages == 0
