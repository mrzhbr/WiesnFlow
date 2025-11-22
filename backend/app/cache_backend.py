"""
Simple in-memory cache backend for fastapi-cache.
Used as a fallback when Redis is not available.
"""
from typing import Optional, Any
import asyncio
from datetime import datetime, timedelta


class InMemoryCacheBackend:
    """Simple in-memory cache backend implementation."""
    
    def __init__(self):
        self._cache: dict[str, tuple[Any, datetime]] = {}
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[Any]:
        """Get a value from cache."""
        async with self._lock:
            if key not in self._cache:
                return None
            
            value, expiry = self._cache[key]
            
            # Check if expired
            if expiry and datetime.now() > expiry:
                del self._cache[key]
                return None
            
            return value
    
    async def set(self, key: str, value: Any, expire: Optional[int] = None) -> None:
        """Set a value in cache with optional expiration in seconds."""
        async with self._lock:
            expiry = None
            if expire:
                expiry = datetime.now() + timedelta(seconds=expire)
            
            self._cache[key] = (value, expiry)
    
    async def delete(self, key: str) -> None:
        """Delete a key from cache."""
        async with self._lock:
            if key in self._cache:
                del self._cache[key]
    
    async def clear(self) -> None:
        """Clear all cache entries."""
        async with self._lock:
            self._cache.clear()

