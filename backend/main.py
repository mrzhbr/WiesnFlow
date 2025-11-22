from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from app.database import init_supabase, get_supabase_client
from app.routers import health, position

# Load environment variables
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Supabase connection
    init_supabase()
    yield
    # Shutdown: Clean up if needed
    pass


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


@app.get("/")
async def root():
    return {
        "message": "Welcome to WiesnFlow API",
        "version": "1.0.0",
        "docs": "/docs"
    }

