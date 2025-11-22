from fastapi import APIRouter, HTTPException
from app.database import get_supabase_client
from app.tiles import (
    get_tile_id, 
    extract_coordinates, 
    NUM_TILES_HEIGHT, 
    NUM_TILES_WIDTH, 
    TILE_SIZE_DEGREES_LAT, 
    TILE_SIZE_DEGREES_LON,
    TOP_LEFT_LAT,
    TOP_LEFT_LON
)
from app.routers.position import _calculate_map_data
from typing import List, Tuple, Optional

router = APIRouter()


@router.get("/friends/add/{friend_id}")
async def add_friend(friend_id: str, user_id: str):
    """Add a friend to the user's friends list."""
    try:
        supabase = get_supabase_client()
        supabase.table("friends").insert({
            "user_id": user_id,
            "friend_id": friend_id,
            "accepted": False
        }).execute()
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to add friend: {str(e)}"
        }
    return {
        "status": "success",
        "message": "Friend added successfully"
    }

@router.get("/friends/accept/{friend_id}")
async def accept_friend(friend_id: str, user_id: str):
    try:
        supabase = get_supabase_client()
        # Only the friend (receiver) can accept the request
        # Find record where user_id (sender) = friend_id and friend_id (receiver) = user_id
        supabase.table("friends").update({
            "accepted": True
        }).eq("user_id", friend_id).eq("friend_id", user_id).execute()
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to accept friend: {str(e)}"
        }
    return {
        "status": "success",
        "message": "Friend accepted successfully"
    }

@router.get("/friends/reject/{friend_id}")
async def reject_friend(friend_id: str, user_id: str):
    try:
        supabase = get_supabase_client()
        # Only the friend (receiver) can reject the request
        # Find record where user_id (sender) = friend_id and friend_id (receiver) = user_id
        supabase.table("friends").delete().eq("user_id", friend_id).eq("friend_id", user_id).execute()
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to reject friend: {str(e)}"
        }
    return {
        "status": "success",
        "message": "Friend rejected successfully"
    }

@router.get("/friends/remove/{friend_id}")
async def remove_friend(friend_id: str, user_id: str):
    try:
        supabase = get_supabase_client()
        supabase.table("friends").delete().eq("user_id", user_id).eq("friend_id", friend_id).execute()
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to remove friend: {str(e)}"
        }
    return {
        "status": "success",
        "message": "Friend removed successfully"
    }

@router.get("/friends/list")
async def get_friend_list(user_id: str):
    supabase = get_supabase_client()
    # Outgoing: requests sent by user_id (we are sender, friend_id = target)
    sent_resp = supabase.table("friends").select("user_id,friend_id,accepted").eq("user_id", user_id).execute()
    # Incoming: requests received by user_id (we are receiver, user_id = sender, friend_id = us)
    recv_resp = supabase.table("friends").select("user_id,friend_id,accepted").eq("friend_id", user_id).execute()

    friends_list = []
    # Outgoing: we sent, so friend_id is the friend
    for entry in sent_resp.data or []:
        friends_list.append({
            "friend_id": entry["friend_id"],
            "accepted": entry.get("accepted", False),
            "is_sender": True
        })
    # Incoming: we received, so friend_id is the other user (the sender)
    for entry in recv_resp.data or []:
        friends_list.append({
            "friend_id": entry["user_id"],
            "accepted": entry.get("accepted", False),
            "is_sender": False
        })

    return {
        "status": "success",
        "friends": friends_list
    }

@router.get("/friends")
async def get_friend_locations(user_id: str):
    """
    Get all friends (accepted and pending) for the current user_id.
    Returns a list of friends with their user_id, status (accepted/pending), and latest position (if available).
    """
    supabase = get_supabase_client()
    try:
        # 1. Find all friends where user_id is user_id or friend_id (bidirectional friendship)
        # Get both accepted and pending friendships
        # First: user_id as user_id
        resp1 = supabase.table("friends").select("user_id,friend_id,accepted").eq("user_id", user_id).execute()
        # Second: user_id as friend_id
        resp2 = supabase.table("friends").select("user_id,friend_id,accepted").eq("friend_id", user_id).execute()
        
        # Build a map of friend_id -> status (accepted/pending)
        # Also track if the request was sent by us (user_id) or received (friend_id)
        friend_map = {}
        
        for entry in resp1.data or []:
            # If the user is the user_id, friend is the friend_id
            # Current user sent the request (is user_id) - will show "Pending"
            fid = entry['friend_id']
            is_accepted = entry.get('accepted', False)
            # Always add entry - show all entries from DB
            friend_map[fid] = {
                "accepted": is_accepted,
                "is_sent_by_me": True
            }
        
        for entry in resp2.data or []:
            # If the user is the friend_id, friend is the user_id
            # Current user received the request (is friend_id) - will show Accept/Decline buttons
            fid = entry['user_id']
            is_accepted = entry.get('accepted', False)
            # Always add entry - if same friend exists, prefer showing as received (friend_id side)
            # This ensures received requests show accept/decline buttons when pending
            if fid not in friend_map:
                friend_map[fid] = {
                    "accepted": is_accepted,
                    "is_sent_by_me": False
                }
            elif is_accepted or not friend_map[fid]["accepted"]:
                # Update if: accepted (prefer accepted), or both pending (prefer received side for buttons)
                friend_map[fid] = {
                    "accepted": is_accepted,
                    "is_sent_by_me": False
                }
        
        if not friend_map:
            return {
                "status": "success",
                "friends": []
            }
        
        # 2. For each friend, get their latest position (if available)
        results = []
        for fid, friend_info in friend_map.items():
            pos_resp = supabase.table("positions") \
                .select("uid,position,last_update") \
                .eq("uid", fid) \
                .order("last_update", desc=True) \
                .limit(1) \
                .execute()
            
            friend_data = {
                "user_id": fid,
                "accepted": friend_info["accepted"],
                "is_sent_by_me": friend_info["is_sent_by_me"],
                "position": None,
                "last_update": None
            }
            
            # Only one most recent position per friend
            if pos_resp.data and len(pos_resp.data):
                latest = pos_resp.data[0]
                friend_data["position"] = latest.get("position")
                friend_data["last_update"] = latest.get("last_update")
            
            results.append(friend_data)

        return {
            "status": "success",
            "friends": results
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to get friend locations: {str(e)}"
        }

@router.get("/friends/assemble")
async def assemble_friends(user_id: str):
    """
    Assemble friends algorithm that:
    1. Gets all friends of the user_id (including the user themselves)
    2. Gets the location of all friends
    3. Calculates the center point between all users
    4. Creates a force that pulls the point to the 4 surrounding tiles depending on how FEW people there are (less people = stronger force)
    5. Returns the final point
    
    Returns:
        Dictionary with:
        - "status": "success" or "error"
        - "final_point": {"longitude": float, "latitude": float} or None
        - "center_point": {"longitude": float, "latitude": float} or None
        - "message": str (error message if status is "error")
    """
    supabase = get_supabase_client()
    try:
        # Step 1: Get all friends (including user_id)
        friend_ids = set([user_id])  # Start with user_id
        
        # Find all accepted friends where user_id is user_id or friend_id (bidirectional friendship)
        resp1 = supabase.table("friends").select("user_id,friend_id").eq("user_id", user_id).eq("accepted", True).execute()
        resp2 = supabase.table("friends").select("user_id,friend_id").eq("friend_id", user_id).eq("accepted", True).execute()
        
        for entry in resp1.data or []:
            friend_ids.add(entry['friend_id'])
        for entry in resp2.data or []:
            friend_ids.add(entry['user_id'])
        
        # Step 2: Get locations of all friends (including user_id)
        positions: List[Tuple[float, float]] = []  # List of (longitude, latitude) tuples
        
        for fid in friend_ids:
            pos_resp = supabase.table("positions") \
                .select("uid,position,last_update") \
                .eq("uid", fid) \
                .order("last_update", desc=True) \
                .limit(1) \
                .execute()
            
            if pos_resp.data and len(pos_resp.data):
                latest = pos_resp.data[0]
                position_data = latest.get("position")
                if position_data:
                    coords = extract_coordinates(position_data)
                    if coords:
                        longitude, latitude = coords
                        positions.append((longitude, latitude))
        
        if not positions:
            return {
                "status": "error",
                "message": "No positions found for user or friends",
                "final_point": None,
                "center_point": None
            }
        
        # Step 3: Calculate center point (average of all positions)
        center_lon = sum(pos[0] for pos in positions) / len(positions)
        center_lat = sum(pos[1] for pos in positions) / len(positions)
        
        # Step 4: Get the tile the center point is in and find 4 surrounding tiles
        center_tile_id = get_tile_id(center_lat, center_lon)
        if not center_tile_id:
            return {
                "status": "error",
                "message": "Center point is outside the tile area",
                "final_point": None,
                "center_point": {"longitude": center_lon, "latitude": center_lat}
            }
        
        # Parse tile_id to get row and col (format: "tile_{row}_{col}")
        tile_parts = center_tile_id.split("_")
        if len(tile_parts) != 3:
            return {
                "status": "error",
                "message": f"Invalid tile ID format: {center_tile_id}",
                "final_point": None,
                "center_point": {"longitude": center_lon, "latitude": center_lat}
            }
        
        center_row = int(tile_parts[1])
        center_col = int(tile_parts[2])
        
        # Get 4 surrounding tiles (north, south, east, west)
        # North: row - 1, South: row + 1, East: col + 1, West: col - 1
        surrounding_tiles = []
        directions = [
            ("north", center_row - 1, center_col),
            ("south", center_row + 1, center_col),
            ("east", center_row, center_col + 1),
            ("west", center_row, center_col - 1)
        ]
        
        for direction, row, col in directions:
            # Check if tile is within bounds
            if 0 <= row < NUM_TILES_HEIGHT and 0 <= col < NUM_TILES_WIDTH:
                tile_id = f"tile_{row}_{col}"
                surrounding_tiles.append((direction, tile_id, row, col))
        
        # Step 5: Get tile counts for surrounding tiles
        # Use the map data calculation to get current tile counts
        map_data = _calculate_map_data()
        tile_counts = map_data.get("tiles", {})
        
        # Step 6: Calculate forces based on inverse population (fewer people = stronger force)
        # Force strength = 1 / (population + 1) to avoid division by zero
        # Higher force means stronger pull towards that tile
        forces = []
        total_force = 0.0
        
        for direction, tile_id, row, col in surrounding_tiles:
            population = tile_counts.get(tile_id, 0)
            # Inverse relationship: fewer people = stronger force
            # Add 1 to avoid division by zero, and use a scaling factor
            force_strength = 1.0 / (population + 1)
            forces.append((direction, tile_id, row, col, force_strength))
            total_force += force_strength
        
        if total_force == 0:
            # If no forces, return center point
            return {
                "status": "success",
                "final_point": {"longitude": center_lon, "latitude": center_lat},
                "center_point": {"longitude": center_lon, "latitude": center_lat}
            }
        
        # Step 7: Calculate weighted displacement towards each tile
        # Each tile's center is at: top_left_lat - (row * TILE_SIZE_DEGREES_LAT) - TILE_SIZE_DEGREES_LAT/2
        #                            top_left_lon + (col * TILE_SIZE_DEGREES_LON) + TILE_SIZE_DEGREES_LON/2
        displacement_lon = 0.0
        displacement_lat = 0.0
        
        for direction, tile_id, row, col, force_strength in forces:
            # Calculate tile center coordinates
            tile_center_lat = TOP_LEFT_LAT - (row * TILE_SIZE_DEGREES_LAT) - (TILE_SIZE_DEGREES_LAT / 2)
            tile_center_lon = TOP_LEFT_LON + (col * TILE_SIZE_DEGREES_LON) + (TILE_SIZE_DEGREES_LON / 2)
            
            # Normalize force (0 to 1)
            normalized_force = force_strength / total_force
            
            # Calculate displacement vector from center point to tile center
            delta_lon = tile_center_lon - center_lon
            delta_lat = tile_center_lat - center_lat
            
            # Apply force (weighted by normalized force strength)
            # Use a scaling factor to control how much the point moves
            # Scale factor: 0.5 means the point can move up to 50% of the way to the tile center
            scale_factor = 0.5
            displacement_lon += delta_lon * normalized_force * scale_factor
            displacement_lat += delta_lat * normalized_force * scale_factor
        
        # Step 8: Calculate final point
        final_lon = center_lon + displacement_lon
        final_lat = center_lat + displacement_lat
        
        return {
            "status": "success",
            "final_point": {"longitude": final_lon, "latitude": final_lat},
            "center_point": {"longitude": center_lon, "latitude": center_lat}
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to assemble friends: {str(e)}",
            "final_point": None,
            "center_point": None
        }