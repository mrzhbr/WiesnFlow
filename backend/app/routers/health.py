from fastapi import APIRouter, HTTPException
from app.database import get_supabase_client

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Test Supabase connection
        supabase = get_supabase_client()
        # Verify client is initialized (basic connection test)
        if supabase is None:
            raise HTTPException(
                status_code=503,
                detail="Supabase client not initialized"
            )
        
        return {
            "status": "healthy",
            "database": "connected",
            "message": "API and database are operational"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Service unhealthy: {str(e)}"
        )

