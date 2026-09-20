"""Shared SlowAPI rate limiter.

Lives in its own module so routers can decorate endpoints with the same
limiter instance the app registers on app.state (main.py imports this —
importing main from a router would be circular).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# OpenAPI declaration for SlowAPI's 429 response (see slowapi/extension.py:
# JSONResponse({"error": "Rate limit exceeded: ..."}, 429)). Spread into
# each rate-limited route's responses= so the contract is documented.
RATE_LIMITED = {
    429: {
        "description": "Rate limit exceeded",
        "content": {
            "application/json": {
                "example": {"error": "Rate limit exceeded: limit per interval"},
            }
        },
    }
}
