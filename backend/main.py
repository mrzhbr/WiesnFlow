from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from fastapi_cache import caches, close_caches
from fastapi_cache.backends.redis import CACHE_KEY, RedisCacheBackend

from app.database import init_supabase, get_supabase_client
from app.routers import health, position, friends
from app.cache_backend import InMemoryCacheBackend
from datetime import datetime, timezone
import asyncio

# Load environment variables
load_dotenv()


async def update_map_data_task():
    """Background task to update map data every minute."""
    while True:
        try:
            from app.routers.position import _calculate_and_cache_map_data
            
            # Generate the current minute key
            current_time = datetime.now(timezone.utc)
            current_minute_key = f"map_{current_time.strftime('%Y-%m-%d_%H:%M')}"
            
            print(f"Updating map data for {current_minute_key}...")
            # Calculate and cache the map data
            await _calculate_and_cache_map_data(current_minute_key)
            print(f"✅ Map data updated successfully for {current_minute_key}")
        except Exception as e:
            print(f"❌ Error updating map data: {e}")
        
        # Wait 60 seconds before next update
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Supabase connection
    init_supabase()
    # Initialize cache - use in-memory by default, Redis if explicitly enabled
    use_redis = os.getenv("USE_REDIS", "false").lower() == "true"
    
    if use_redis:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            rc = RedisCacheBackend(redis_url)
            caches.set(CACHE_KEY, rc)
            print("✅ Redis cache backend initialized (connection will be tested on first use)")
        except Exception as e:
            print(f"⚠️  Redis initialization failed ({e}), falling back to in-memory cache")
            caches.set(CACHE_KEY, InMemoryCacheBackend())
    else:
        print("ℹ️  Using in-memory cache (set USE_REDIS=true to use Redis)")
        caches.set(CACHE_KEY, InMemoryCacheBackend())
    
    # Start the background task for updating map data
    task = asyncio.create_task(update_map_data_task())
    print("✅ Map data update task started (runs every 60 seconds)")
    
    yield
    
    # Shutdown: Cancel the background task and clean up caches
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await close_caches()


# Create FastAPI app
app = FastAPI(
    title="WiesnFlow API",
    description="API for WiesnFlow - Interactive heatmap for Oktoberfest crowd tracking",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="", tags=["health"])
app.include_router(position.router, prefix="", tags=["position"])
app.include_router(friends.router, prefix="", tags=["friends"])


@app.get("/")
async def root():
    return {
        "message": "Welcome to WiesnFlow API",
        "version": "1.0.0",
        "docs": "/docs"
    }

