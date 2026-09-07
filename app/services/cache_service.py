"""Async cache service for Smart PYQ application.

Provides async caching functionality for services that need it.
"""

import asyncio

import logging
import pickle
from typing import Any, Dict, List, Optional, Union
from redis import asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

class CacheService:
    """Async Redis-based cache service."""
    
    def __init__(self, redis_client=None):
        """Initialize cache service.
        
        Args:
            redis_client: Async Redis client instance
        """
        self.redis_client = redis_client
        self._initialized = False
    
    async def initialize(self) -> None:
        """Initialize Redis connection."""
        if self._initialized:
            return
        
        if not self.redis_client:
            try:
                self.redis_client = aioredis.from_url(
                    settings.REDIS_URL,
                    decode_responses=False  # Keep binary for pickle
                )
                # Test connection
                await self.redis_client.ping()
                logger.info("Async cache service initialized with Redis")
            except Exception as e:
                logger.warning(f"Redis not available for async caching: {str(e)}")
                self.redis_client = None
        
        self._initialized = True
    
    async def get(self, key: str, default: Any = None) -> Any:
        """Get value from cache.
        
        Args:
            key: Cache key
            default: Default value if key not found
            
        Returns:
            Cached value or default
        """
        await self.initialize()
        
        if not self.redis_client:
            return default
        
        try:
            value = await self.redis_client.get(key)
            if value is None:
                return default
            
            # Try to unpickle, fallback to string
            try:
                return pickle.loads(value)
            except (pickle.PickleError, TypeError):
                return value.decode('utf-8') if isinstance(value, bytes) else value
                
        except Exception as e:
            logger.error(f"Cache get error for key {key}: {str(e)}")
            return default
    
    async def set(self, key: str, value: Any, expire: Optional[int] = None) -> bool:
        """Set value in cache.
        
        Args:
            key: Cache key
            value: Value to cache
            expire: Expiration time in seconds
            
        Returns:
            True if successful
        """
        await self.initialize()
        
        if not self.redis_client:
            return False
        
        try:
            # Serialize value
            if isinstance(value, (str, int, float, bool)):
                serialized_value = pickle.dumps(value)
            else:
                serialized_value = pickle.dumps(value)
            
            # Set with expiration
            if expire:
                return await self.redis_client.setex(key, expire, serialized_value)
            else:
                return await self.redis_client.set(key, serialized_value)
                
        except Exception as e:
            logger.error(f"Cache set error for key {key}: {str(e)}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from cache.
        
        Args:
            key: Cache key to delete
            
        Returns:
            True if successful
        """
        await self.initialize()
        
        if not self.redis_client:
            return False
        
        try:
            return bool(await self.redis_client.delete(key))
        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {str(e)}")
            return False
    
    async def delete_pattern(self, pattern: str) -> int:
        """Delete keys matching pattern.
        
        Args:
            pattern: Key pattern (e.g., 'user:*')
            
        Returns:
            Number of keys deleted
        """
        await self.initialize()
        
        if not self.redis_client:
            return 0
        
        try:
            keys = await self.redis_client.keys(pattern)
            if keys:
                return await self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Cache delete pattern error for {pattern}: {str(e)}")
            return 0
    
    async def exists(self, key: str) -> bool:
        """Check if key exists in cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key exists
        """
        await self.initialize()
        
        if not self.redis_client:
            return False
        
        try:
            return bool(await self.redis_client.exists(key))
        except Exception as e:
            logger.error(f"Cache exists error for key {key}: {str(e)}")
            return False
    
    async def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """Increment numeric value in cache.
        
        Args:
            key: Cache key
            amount: Amount to increment
            
        Returns:
            New value or None if error
        """
        await self.initialize()
        
        if not self.redis_client:
            return None
        
        try:
            return await self.redis_client.incr(key, amount)
        except Exception as e:
            logger.error(f"Cache increment error for key {key}: {str(e)}")
            return None
    
    async def expire(self, key: str, ttl: int) -> bool:
        """Set expiration for existing key.
        
        Args:
            key: Cache key
            ttl: Time to live in seconds
            
        Returns:
            True if successful
        """
        await self.initialize()
        
        if not self.redis_client:
            return False
        
        try:
            return bool(await self.redis_client.expire(key, ttl))
        except Exception as e:
            logger.error(f"Cache expire error for key {key}: {str(e)}")
            return False
    
    async def get_ttl(self, key: str) -> Optional[int]:
        """Get time to live for key.
        
        Args:
            key: Cache key
            
        Returns:
            TTL in seconds or None
        """
        await self.initialize()
        
        if not self.redis_client:
            return None
        
        try:
            ttl = await self.redis_client.ttl(key)
            return ttl if ttl > 0 else None
        except Exception as e:
            logger.error(f"Cache TTL error for key {key}: {str(e)}")
            return None
    
    async def flush_all(self) -> bool:
        """Clear all cache entries.
        
        Returns:
            True if successful
        """
        await self.initialize()
        
        if not self.redis_client:
            return False
        
        try:
            await self.redis_client.flushdb()
            logger.info("Cache flushed")
            return True
        except Exception as e:
            logger.error(f"Cache flush error: {str(e)}")
            return False
    
    async def close(self) -> None:
        """Close Redis connection."""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("Cache service connection closed")

class AsyncCacheDecorator:
    """Async cache decorator for functions."""
    
    def __init__(self, cache_service: CacheService):
        """Initialize cache decorator.
        
        Args:
            cache_service: Cache service instance
        """
        self.cache_service = cache_service
    
    def cached(self, ttl: int = 300, key_prefix: str = ""):
        """Cache async function results.
        
        Args:
            ttl: Time to live in seconds
            key_prefix: Prefix for cache key
            
        Returns:
            Decorator function
        """
        def decorator(func):
            async def wrapper(*args, **kwargs):
                # Generate cache key
                key_parts = [key_prefix or func.__name__]
                
                # Add args to key
                for arg in args:
                    if isinstance(arg, (str, int, float, bool)):
                        key_parts.append(str(arg))
                    else:
                        key_parts.append(str(hash(str(arg))))
                
                # Add kwargs to key
                for k, v in sorted(kwargs.items()):
                    if isinstance(v, (str, int, float, bool)):
                        key_parts.append(f"{k}:{v}")
                    else:
                        key_parts.append(f"{k}:{hash(str(v))}")
                
                cache_key = ":".join(key_parts)
                
                # Try to get from cache
                cached_result = await self.cache_service.get(cache_key)
                if cached_result is not None:
                    logger.debug(f"Cache hit for {cache_key}")
                    return cached_result
                
                # Execute function and cache result
                result = await func(*args, **kwargs)
                await self.cache_service.set(cache_key, result, ttl)
                logger.debug(f"Cache miss for {cache_key}, result cached")
                
                return result
            
            return wrapper
        return decorator
    
    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate cache entries matching pattern.
        
        Args:
            pattern: Key pattern
            
        Returns:
            Number of keys invalidated
        """
        return await self.cache_service.delete_pattern(pattern)

class AsyncSessionCache:
    """Async session-specific caching."""
    
    def __init__(self, cache_service: CacheService, session_id: str):
        """Initialize session cache.
        
        Args:
            cache_service: Cache service instance
            session_id: Session identifier
        """
        self.cache_service = cache_service
        self.session_id = session_id
        self.key_prefix = f"session:{session_id}"
    
    async def get(self, key: str, default: Any = None) -> Any:
        """Get session-specific cached value.
        
        Args:
            key: Cache key
            default: Default value
            
        Returns:
            Cached value or default
        """
        full_key = f"{self.key_prefix}:{key}"
        return await self.cache_service.get(full_key, default)
    
    async def set(self, key: str, value: Any, expire: Optional[int] = None) -> bool:
        """Set session-specific cached value.
        
        Args:
            key: Cache key
            value: Value to cache
            expire: Expiration time in seconds
            
        Returns:
            True if successful
        """
        full_key = f"{self.key_prefix}:{key}"
        return await self.cache_service.set(full_key, value, expire)
    
    async def delete(self, key: str) -> bool:
        """Delete session-specific cached value.
        
        Args:
            key: Cache key
            
        Returns:
            True if successful
        """
        full_key = f"{self.key_prefix}:{key}"
        return await self.cache_service.delete(full_key)
    
    async def clear_session(self) -> int:
        """Clear all session data.
        
        Returns:
            Number of keys deleted
        """
        pattern = f"{self.key_prefix}:*"
        return await self.cache_service.delete_pattern(pattern)

# Global cache service instance
cache_service = CacheService()

# Convenience functions
async def get_session_cache(session_id: str) -> AsyncSessionCache:
    """Get async session cache instance.
    
    Args:
        session_id: Session identifier
        
    Returns:
        AsyncSessionCache instance
    """
    return AsyncSessionCache(cache_service, session_id)

def async_cached(ttl: int = 300, key_prefix: str = ""):
    """Async cache decorator shortcut.
    
    Args:
        ttl: Time to live in seconds
        key_prefix: Prefix for cache key
        
    Returns:
        Decorator function
    """
    decorator = AsyncCacheDecorator(cache_service)
    return decorator.cached(ttl, key_prefix)

async def invalidate_cache_pattern(pattern: str) -> int:
    """Invalidate cache entries matching pattern.
    
    Args:
        pattern: Key pattern
        
    Returns:
        Number of keys invalidated
    """
    return await cache_service.delete_pattern(pattern)