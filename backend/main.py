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

# Load environment variables
load_dotenv()


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
    
    yield
    # Shutdown: Clean up caches
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

