"""Shared SlowAPI rate limiter.

Lives in its own module so routers can decorate endpoints with the same
limiter instance the app registers on app.state (main.py imports this —
importing main from a router would be circular).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
