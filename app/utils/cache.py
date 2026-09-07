"""In-process TTL cache for hot paths.

Provides simple key-value caching without Redis dependency.
Use for read-heavy, rarely-changing data like paper stats.
"""

import time
import threading
from typing import Any, Optional


class TTLCache:
    """Thread-safe in-process cache with per-key TTL."""
    
    def __init__(self, default_ttl: int = 300):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
        self.default_ttl = default_ttl
    
    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._store:
                value, expires_at = self._store[key]
                if time.time() < expires_at:
                    return value
                del self._store[key]
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        expires_at = time.time() + (ttl or self.default_ttl)
        with self._lock:
            self._store[key] = (value, expires_at)
    
    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)
    
    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def clear_prefix(self, prefix: str) -> int:
        """Remove all entries whose key starts with prefix. Returns count removed."""
        removed = 0
        with self._lock:
            for k in [k for k in self._store if k.startswith(prefix)]:
                del self._store[k]
                removed += 1
        return removed
    
    def cleanup(self) -> int:
        """Remove expired entries. Returns count removed."""
        now = time.time()
        removed = 0
        with self._lock:
            expired = [k for k, (_, exp) in self._store.items() if now >= exp]
            for k in expired:
                del self._store[k]
                removed += 1
        return removed


# Global cache instance
app_cache = TTLCache(default_ttl=300)
