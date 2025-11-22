from fastapi import APIRouter, HTTPException
from app.database import get_supabase_client

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

@router.get("/friends")
async def get_friend_locations(user_id: str):
    """
    Get the latest locations of users that the current user_id is befriended with (i.e., accepted friendships).
    Returns a list of friends with their user_id and latest position (if available).
    """
    supabase = get_supabase_client()
    try:
        # 1. Find all accepted friends where user_id is user_id or friend_id (bidirectional friendship)
        # Friendship can be initiated in either direction - so check both ways
        # First: user_id as user_id, accepted
        resp1 = supabase.table("friends").select("user_id,friend_id").eq("user_id", user_id).eq("accepted", True).execute()
        # Second: user_id as friend_id, accepted
        resp2 = supabase.table("friends").select("user_id,friend_id").eq("friend_id", user_id).eq("accepted", True).execute()
        
        # Extract all friend user_ids (the user that is NOT user_id in each row)
        friend_ids = set()
        
        for entry in resp1.data or []:
            # If the user is the user_id, friend is the friend_id
            friend_ids.add(entry['friend_id'])
        for entry in resp2.data or []:
            # If the user is the friend_id, friend is the user_id
            friend_ids.add(entry['user_id'])
        
        if not friend_ids:
            return {
                "status": "success",
                "friends": []
            }
        
        # 2. For each friend, get their latest position (if available)
        # Query 'positions' table for rows where uid in friend_ids, get the one with latest last_update
        placeholders = ",".join([f"'{fid}'" for fid in friend_ids])
        query = (
            f"SELECT uid, position, last_update "
            f"FROM positions "
            f"WHERE uid IN ({placeholders}) "
            f"ORDER BY last_update DESC"
        )
        # Use Supabase RPC or the python client for this query (the .select().in_... does not support limiting to latest per uid easily)
        # So, fallback: for each friend, get their latest position
        results = []
        for fid in friend_ids:
            pos_resp = supabase.table("positions") \
                .select("uid,position,last_update") \
                .eq("uid", fid) \
                .order("last_update", desc=True) \
                .limit(1) \
                .execute()
            # Only one most recent position per friend
            if pos_resp.data and len(pos_resp.data):
                latest = pos_resp.data[0]
                results.append({
                    "user_id": fid,
                    "position": latest.get("position"),
                    "last_update": latest.get("last_update")
                })
            else:
                results.append({
                    "user_id": fid,
                    "position": None,
                    "last_update": None
                })

        return {
            "status": "success",
            "friends": results
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Failed to get friend locations: {str(e)}"
        }