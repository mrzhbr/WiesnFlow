from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from app.database import get_supabase_client
from app.models.position import Position, PositionCreate, PositionResponse
from app.tiles import assign_positions_to_tiles, assign_positions_to_tents
from datetime import datetime, timezone, timedelta
from fastapi_cache import caches
from fastapi_cache.backends.redis import CACHE_KEY, RedisCacheBackend
from app.cache_backend import InMemoryCacheBackend
from typing import Any
import uuid
import asyncio

router = APIRouter()

# Fallback in-memory cache if Redis fails
_fallback_cache = InMemoryCacheBackend()


def get_cache():
    """Dependency to get the cache backend."""
    cache = caches.get(CACHE_KEY)
    if cache is None:
        return _fallback_cache
    return cache


@router.post("/position")
async def update_position(position: PositionCreate):
    """
    Update or create a position.
    Accepts 'long', 'lat', and 'uid' in POST body, converts to PostGIS format.
    
    Example request body:
    {
        "long": 11.5498,
        "lat": 48.1351,
        "uid": "user123"
    }
    """
    try:
        # Convert to Position model for PostGIS operations
        pos = position.to_position()
        
        # Convert to PostGIS format for database storage
        postgis_point = pos.to_postgis_geography()
        
        supabase = get_supabase_client()

        # Get the most recent entry for this user
        old_entry_result = supabase.table("positions").select("*").eq("uid", position.uid).order("last_update", desc=True).limit(1).execute()
        
        current_time = datetime.now(timezone.utc)
        should_update = False
        entry_id = None
        
        # Check if there's an old entry and if it's in the same minute
        if old_entry_result.data and len(old_entry_result.data) > 0:
            old_entry = old_entry_result.data[0]
            old_created_at = old_entry.get("last_update")
            
            if old_created_at:
                # Parse the timestamp (Supabase returns ISO format strings)
                if isinstance(old_created_at, str):
                    old_timestamp = datetime.fromisoformat(old_created_at.replace('Z', '+00:00'))
                else:
                    old_timestamp = old_created_at
                
                # Check if timestamps are in the same minute
                if (old_timestamp.year == current_time.year and
                    old_timestamp.month == current_time.month and
                    old_timestamp.day == current_time.day and
                    old_timestamp.hour == current_time.hour and
                    old_timestamp.minute == current_time.minute):
                    should_update = True
                    entry_id = old_entry.get("id")
        
        # Prepare the data to insert/update
        data = {
            "position": postgis_point,
            "uid": position.uid,
        }
        
        if should_update and entry_id:
            # Update existing entry in the same minute
            response = supabase.table("positions").update(data).eq("id", entry_id).execute()
            return {"message": "Position updated successfully", "action": "updated"}
        else:
            # Insert new entry
            response = supabase.table("positions").insert(data).execute()
            return {"message": "Position created successfully", "action": "created"}


    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process position: {str(e)}"
        )

def _calculate_map_data() -> dict:
    """
    Helper function to calculate map data (tile counts and tent counts).
    This is the actual aggregation logic that gets cached.
    """
    supabase = get_supabase_client()
    
    # Calculate timestamp for one hour ago
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    one_hour_ago_iso = one_hour_ago.isoformat()
    
    # Get all positions from the last hour, ordered by last_update desc
    # Then group by uid in Python - first occurrence of each uid is the latest
    response = supabase.table("positions").select("*").gte("last_update", one_hour_ago_iso).order("last_update", desc=True).execute()
    # Group by uid - since results are ordered by last_update desc,
    # the first entry we encounter for each uid is the latest one
    latest_by_user = []
    seen_uids = set()
    for entry in response.data:
        uid = entry.get("uid")
        if uid and uid not in seen_uids:
            latest_by_user.append(entry)
            seen_uids.add(uid)
    
    # Assign positions to tiles and get counts
    tile_counts = assign_positions_to_tiles(latest_by_user)
    
    # Count positions within 50m radius of each tent
    tent_counts = assign_positions_to_tents(latest_by_user)
    
    return {
        "tiles": tile_counts,
        "tents": tent_counts
    }


async def _calculate_and_cache_map_data(minute_key: str):
    """
    Async function to calculate map data and cache it.
    This runs in the background while we return the old cached value.
    """
    try:
        # Calculate the new map data (includes both tiles and tents)
        map_data = _calculate_map_data()
        
        # Cache it with the minute key
        cache = caches.get(CACHE_KEY)
        if cache is None:
            cache = _fallback_cache
        try:
            await cache.set(minute_key, map_data, expire=3600)  # Expire after 1 hour
        except Exception as cache_error:
            # If Redis fails, use fallback
            print(f"Cache set error in background task ({cache_error}), using fallback")
            await _fallback_cache.set(minute_key, map_data, expire=3600)
    except Exception as e:
        # Log error but don't fail - we've already returned the old value
        print(f"Error calculating/caching map data for {minute_key}: {e}")


@router.get("/map")
async def get_map(
    background_tasks: BackgroundTasks,
    bypass_cache: bool = True,
    cache = Depends(get_cache)
):
    """
    Get the latest position entry for each user (by uid) that is at most one hour old.
    Assign each position to its corresponding 50x50m tile and return a map of tile_id -> count.
    Also count positions within 50m radius of each Oktoberfest tent.
    
    Uses minute-based caching:
    - If cache exists for current minute, return it immediately
    - If not, return the previous minute's cache (if available) and start async calculation for new minute
    
    Args:
        bypass_cache: If True, always calculate fresh data and skip cache lookup
    
    Returns:
        Dictionary with:
        - "tiles": Dictionary mapping tile_id (e.g., "tile_5_7") to count of positions in that tile
        - "tents": Dictionary mapping tent name to count of positions within 50m radius
    """
    # Get current time and create minute-based cache key
    current_time = datetime.now(timezone.utc)
    current_minute_key = f"map_{current_time.strftime('%Y-%m-%d_%H:%M')}"
    
    # Helper function to safely get from cache with fallback
    async def safe_cache_get(key: str):
        try:
            return await cache.get(key)
        except Exception as e:
            # If Redis connection fails, use fallback cache
            print(f"Cache get error ({e}), using fallback")
            return await _fallback_cache.get(key)
    
    async def safe_cache_set(key: str, value: Any, expire: int):
        try:
            await cache.set(key, value, expire=expire)
        except Exception as e:
            # If Redis connection fails, use fallback cache
            print(f"Cache set error ({e}), using fallback")
            await _fallback_cache.set(key, value, expire=expire)
    
    # If bypass_cache is True, always calculate fresh data
    if bypass_cache:
        map_data = _calculate_map_data()
        # Still cache the result for future requests
        await safe_cache_set(current_minute_key, map_data, expire=3600)
        return map_data
    
    # Check if cache exists for current minute
    current_cached = await safe_cache_get(current_minute_key)
    if current_cached is not None:
        return current_cached
    
    # Current minute not cached - check for previous minute
    previous_minute = current_time - timedelta(minutes=1)
    previous_minute_key = f"map_{previous_minute.strftime('%Y-%m-%d_%H:%M')}"
    previous_cached = await safe_cache_get(previous_minute_key)
    
    # Start background task to calculate and cache the new minute
    background_tasks.add_task(_calculate_and_cache_map_data, current_minute_key)
    
    # Return previous cached value if available, otherwise calculate synchronously
    if previous_cached is not None:
        return previous_cached
    
    # No cache available - calculate synchronously (fallback for first request)
    map_data = _calculate_map_data()
    await safe_cache_set(current_minute_key, map_data, expire=3600)
    return map_data
    