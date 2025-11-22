from fastapi import APIRouter, HTTPException, Query
from app.database import get_supabase_client
from app.tiles import OKTOBERFEST_TENTS, OKTOBERFEST_POI_TYPES, haversine_distance, extract_coordinates
from typing import List, Dict, Literal
from pydantic import BaseModel, Field

router = APIRouter()


class TentRecommendation(BaseModel):
    """Model for tent recommendation response."""
    tent_name: str
    type: str = Field(description="Type of POI: tent, roller_coaster, or food")
    distance: float = Field(description="Distance to tent in meters")
    count: int = Field(description="Number of people at the tent")
    score: float = Field(description="Recommendation score (lower is better)")


@router.get("/recommendations", response_model=List[TentRecommendation])
async def get_recommendations(
    user_id: str = Query(..., description="User ID to get recommendations for"),
    distance_preference: float = Query(0.5, ge=0.0, le=1.0, description="Preference for distance (0-1, where 1 means distance is very important)"),
    type: Literal["all", "roller_coaster", "food", "tent"] = Query("all", description="Filter POIs by type: all, roller_coaster, food, or tent")
):
    """
    Get POI recommendations for a user based on their location and preferences.
    
    Algorithm:
    1. Get the latest location of the user
    2. Filter POIs by type (if specified)
    3. Calculate distances to filtered POIs
    4. Get the count for each POI
    5. Calculate count_preference as 1 - distance_preference
    6. Calculate SCORE = distance_preference * distance + count_preference * count
    7. Return POIs sorted by score (ascending, lower scores are better)
    
    Args:
        user_id: The user ID to get recommendations for
        distance_preference: How important distance is (0-1). 1 means distance is very important, 0 means count is very important.
        type: Filter POIs by type: "all" (all POIs), "roller_coaster", "food", or "tent"
    
    Returns:
        List of POI recommendations sorted by score (ascending)
    """
    try:
        supabase = get_supabase_client()
        
        # Step 1: Get the latest location of the user
        position_result = supabase.table("positions") \
            .select("position") \
            .eq("uid", user_id) \
            .order("last_update", desc=True) \
            .limit(1) \
            .execute()
        
        if not position_result.data or len(position_result.data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No position found for user_id: {user_id}"
            )
        
        user_position_data = position_result.data[0].get("position")
        if not user_position_data:
            raise HTTPException(
                status_code=404,
                detail=f"Invalid position data for user_id: {user_id}"
            )
        
        # Extract user coordinates
        user_coords = extract_coordinates(user_position_data)
        if not user_coords:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse position data for user_id: {user_id}"
            )
        
        user_lon, user_lat = user_coords
        
        # Filter POIs by type if specified
        filtered_pois = []
        if type == "all":
            filtered_pois = OKTOBERFEST_TENTS
        else:
            for poi_name, poi_lon, poi_lat in OKTOBERFEST_TENTS:
                poi_type = OKTOBERFEST_POI_TYPES.get(poi_name)
                if poi_type == type:
                    filtered_pois.append((poi_name, poi_lon, poi_lat))
        
        if not filtered_pois:
            return []  # No POIs match the filter
        
        # Step 2 & 3: Get tent counts from pois table (much faster than recalculating)
        # Query the latest count for each POI from the pois table
        poi_names = [poi_name for poi_name, _, _ in filtered_pois]
        tent_counts = {name: 0 for name in poi_names}  # Initialize all to 0
        
        # Get all POI counts in a single query by getting the latest entry for each POI
        # We'll query all pois entries for the filtered POIs and then get the latest for each
        all_pois_result = supabase.table("pois") \
            .select("name,count,created_at") \
            .in_("name", poi_names) \
            .order("created_at", desc=True) \
            .execute()
        
        # Group by name and take the first (most recent) entry for each POI
        seen_pois = set()
        for poi_entry in all_pois_result.data:
            poi_name = poi_entry.get("name")
            if poi_name and poi_name in tent_counts and poi_name not in seen_pois:
                tent_counts[poi_name] = poi_entry.get("count", 0)
                seen_pois.add(poi_name)
        
        # Step 4: Calculate count_preference
        count_preference = 1.0 - distance_preference
        
        # Step 5: Calculate scores for each POI
        recommendations = []
        
        # Calculate scores for each filtered POI
        for poi_name, poi_lon, poi_lat in filtered_pois:
            distance = haversine_distance(user_lat, user_lon, poi_lat, poi_lon)
            count = tent_counts.get(poi_name, 0)
            poi_type = OKTOBERFEST_POI_TYPES.get(poi_name, "unknown")
            
            # Calculate score: distance_preference * distance + count_preference * count
            score = distance_preference * distance + count_preference * count
            
            recommendations.append(TentRecommendation(
                tent_name=poi_name,
                type=poi_type,
                distance=distance,
                count=count,
                score=score
            ))
        
        # Step 6: Sort by score (ascending, lower is better)
        recommendations.sort(key=lambda x: x.score)
        
        # Return top 3 recommendations
        return recommendations[:3]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get recommendations: {str(e)}"
        )

