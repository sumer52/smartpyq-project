"""Public support intake.

The /contact and /report-issue forms used to fake a successful send with a
client-side timeout: nothing was transmitted, so every visitor message was
lost while the UI claimed success.

POST /api/v1/support/message records one submission as a JSON line in
logs/support_messages.jsonl (no schema change; readable by whoever operates
the site). It answers 201 only after the record is on disk, so the UI cannot
report a delivery that never happened.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from ..core.limiter import limiter

router = APIRouter(prefix="/support", tags=["support"])
logger = logging.getLogger(__name__)

# Same logs/ directory the app already writes to.
MESSAGE_LOG_PATH = Path("logs") / "support_messages.jsonl"
MAX_TEXT = 5000


class SupportMessageRequest(BaseModel):
    """One contact message or issue report.

    Both frontend forms share this intake; fields not used by a form stay unset.
    """

    model_config = ConfigDict(extra="forbid")

    kind: Literal["contact", "issue"]
    name: Optional[str] = Field(None, max_length=120)
    email: Optional[EmailStr] = None
    subject: Optional[str] = Field(None, max_length=200)
    category: Optional[str] = Field(None, max_length=60)
    priority: Optional[str] = Field(None, max_length=20)
    message: Optional[str] = Field(None, max_length=MAX_TEXT)
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=MAX_TEXT)
    steps_to_reproduce: Optional[str] = Field(None, max_length=MAX_TEXT)
    expected_behavior: Optional[str] = Field(None, max_length=MAX_TEXT)
    actual_behavior: Optional[str] = Field(None, max_length=MAX_TEXT)
    browser_info: Optional[str] = Field(None, max_length=300)
    device_info: Optional[str] = Field(None, max_length=300)
    # File contents are not uploaded; the form sends the chosen file names.
    attachments: Optional[List[str]] = Field(default=None, max_length=10)


@router.post("/message", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def submit_support_message(payload: SupportMessageRequest, request: Request):
    """Record a contact message or issue report."""
    data = payload.model_dump(exclude_none=True)
    body = (data.get("message") or data.get("description") or "").strip()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A message or description is required.",
        )

    record: Dict[str, Any] = {
        **data,
        "received_at": datetime.now(timezone.utc).isoformat(),
        "request_id": getattr(request.state, "request_id", None),
    }
    try:
        MESSAGE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with MESSAGE_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        logger.exception("Could not persist support message")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Could not record your message right now. "
                "Please email smartpyq@gmail.com instead."
            ),
        )

    return {"status": "received", "kind": payload.kind}
