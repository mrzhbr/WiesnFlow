from fastapi import APIRouter, HTTPException
from app.database import get_supabase_client
from app.models.position import Position, PositionCreate, PositionResponse
from app.tiles import assign_positions_to_tiles
from datetime import datetime, timezone, timedelta
router = APIRouter()


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
            "uid": position.uid
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

@router.get("/map")
async def get_map():
    """
    Get the latest position entry for each user (by uid) that is at most one hour old.
    Assign each position to its corresponding 50x50m tile and return a map of tile_id -> count.
    
    Returns:
        Dictionary mapping tile_id (e.g., "tile_5_7") to count of positions in that tile
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
    
    return tile_counts
    