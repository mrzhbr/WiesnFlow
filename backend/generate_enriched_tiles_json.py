"""
Generate an enriched JSON file with tile data including counts and colors.
Counts are based on actual position data from the database.
Colors are calculated: 1 = green, 10 = red (with interpolation).
Also includes tent information with their counts.
"""

import json
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

# Import tile utilities
from app.tiles import (
    OKTOBERFEST_TILES,
    OKTOBERFEST_TENTS,
    assign_positions_to_tiles,
    assign_positions_to_tents,
    count_to_color,
    TILE_SIZE_METERS,
    NUM_TILES_HEIGHT,
    NUM_TILES_WIDTH,
    TOP_LEFT_LAT,
    TOP_LEFT_LON,
    BOTTOM_RIGHT_LAT,
    BOTTOM_RIGHT_LON,
    TILE_SIZE_DEGREES_LAT,
    TILE_SIZE_DEGREES_LON,
)
from app.database import init_supabase, get_supabase_client

# Load environment variables
load_dotenv()


def get_latest_positions():
    """
    Get the latest position for each user from the last hour.
    Similar to the /map endpoint logic.
    """
    supabase = get_supabase_client()
    
    # Calculate timestamp for one hour ago
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    one_hour_ago_iso = one_hour_ago.isoformat()
    
    # Get all positions from the last hour, ordered by last_update desc
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
    
    return latest_by_user


def generate_enriched_tiles_json():
    """
    Generate enriched tileset JSON with counts and colors.
    """
    print("🔄 Fetching latest positions from database...")
    
    # Get latest positions
    try:
        positions = get_latest_positions()
        print(f"   Found {len(positions)} unique user positions")
    except Exception as e:
        print(f"⚠️  Warning: Could not fetch positions from database: {e}")
        print("   Using empty position list (all tiles will have count=0)")
        positions = []
    
    # Assign positions to tiles and get counts
    print("🔄 Assigning positions to tiles...")
    tile_counts = assign_positions_to_tiles(positions)
    
    # Count positions within radius of each tent
    print("🔄 Counting positions near tents...")
    tent_counts = assign_positions_to_tents(positions)
    
    # Generate tiles with counts and colors
    print("🔄 Generating enriched tile data...")
    features = []
    
    for tile_id, top_left_lat, top_left_lon in OKTOBERFEST_TILES:
        # Extract row and col from tile_id (format: "tile_row_col")
        parts = tile_id.split("_")
        row = int(parts[1])
        col = int(parts[2])
        
        # Bottom-right corner of this tile
        bottom_right_lat = top_left_lat - TILE_SIZE_DEGREES_LAT
        bottom_right_lon = top_left_lon + TILE_SIZE_DEGREES_LON
        
        # Create GeoJSON polygon coordinates
        coordinates = [[
            [top_left_lon, top_left_lat],  # Top-left
            [bottom_right_lon, top_left_lat],  # Top-right
            [bottom_right_lon, bottom_right_lat],  # Bottom-right
            [top_left_lon, bottom_right_lat],  # Bottom-left
            [top_left_lon, top_left_lat]  # Close polygon
        ]]
        
        # Get count for this tile (default to 0)
        count = tile_counts.get(tile_id, 0)
        
        # Calculate color based on count (1 = green, 10 = red)
        color = count_to_color(count, min_count=1, max_count=10)
        
        feature = {
            "type": "Feature",
            "id": tile_id,
            "properties": {
                "tileId": tile_id,
                "row": row,
                "col": col,
                "count": count,
                "color": color
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": coordinates
            }
        }
        
        features.append(feature)
    
    # Generate tent features with counts
    print("🔄 Generating tent data...")
    tent_features = []
    for tent_name, tent_lon, tent_lat in OKTOBERFEST_TENTS:
        count = tent_counts.get(tent_name, 0)
        
        tent_feature = {
            "type": "Feature",
            "id": f"tent_{tent_name}",
            "properties": {
                "name": tent_name,
                "type": "tent",
                "count": count
            },
            "geometry": {
                "type": "Point",
                "coordinates": [tent_lon, tent_lat]
            }
        }
        
        tent_features.append(tent_feature)
    
    # Create the output structure
    output = {
        "type": "FeatureCollection",
        "metadata": {
            "area": "Theresienwiese (Oktoberfest)",
            "tileSizeMeters": TILE_SIZE_METERS,
            "numTilesHeight": NUM_TILES_HEIGHT,
            "numTilesWidth": NUM_TILES_WIDTH,
            "totalTiles": len(features),
            "totalPositions": len(positions),
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "boundingBox": {
                "topLeft": [TOP_LEFT_LON, TOP_LEFT_LAT],
                "bottomRight": [BOTTOM_RIGHT_LON, BOTTOM_RIGHT_LAT]
            },
            "colorScale": {
                "minCount": 1,
                "maxCount": 10,
                "minColor": "rgba(0, 255, 0, 0.5)",  # Green
                "maxColor": "rgba(255, 0, 0, 0.5)"   # Red
            }
        },
        "features": features,
        "tents": tent_features
    }
    
    # Write to JSON file
    output_file = "oktoberfest_tiles_enriched.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Generated enriched tileset in {output_file}")
    print(f"   Grid size: {NUM_TILES_WIDTH} x {NUM_TILES_HEIGHT} tiles")
    print(f"   Total tiles: {len(features)}")
    print(f"   Tiles with positions: {len([f for f in features if f['properties']['count'] > 0])}")
    print(f"   Total positions: {len(positions)}")
    print(f"   Tents: {len(tent_features)}")
    print(f"\n📊 Tent counts:")
    for tent_feature in tent_features:
        print(f"   {tent_feature['properties']['name']}: {tent_feature['properties']['count']} positions")
    print(f"\n🎨 Color scale: 1 (green) → 10 (red)")
    print(f"   Format: GeoJSON FeatureCollection with count and color properties")


if __name__ == "__main__":
    try:
        # Initialize database connection
        init_supabase()
        
        # Generate enriched tileset
        generate_enriched_tiles_json()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

