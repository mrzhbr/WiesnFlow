from supabase import create_client, Client
import os
from typing import Optional

# Global Supabase client
_supabase: Optional[Client] = None


def init_supabase() -> None:
    """Initialize Supabase client with environment variables."""
    global _supabase
    
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    
    if not supabase_url or not supabase_key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_KEY must be set in environment variables"
        )
    
    _supabase = create_client(supabase_url, supabase_key)
    print("✅ Supabase client initialized successfully")


def get_supabase_client() -> Client:
    """Get the initialized Supabase client."""
    if _supabase is None:
        raise RuntimeError("Supabase client not initialized. Call init_supabase() first.")
    return _supabase

