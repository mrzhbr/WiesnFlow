"""
Generate a JSON file listing all tiles with their coordinates for Mapbox visualization.
Fetches current tile counts from the API and assigns colors based on density.
"""

import json
import math
import os
import sys
from typing import List, Dict, Optional

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    print("⚠️  'requests' library not found. Install it with: pip install requests")
    print("   Falling back to urllib...")
    HAS_REQUESTS = False

# Theresienwiese bounding box coordinates
# Top-left (northwest) corner
TOP_LEFT_LAT = 48.136293
TOP_LEFT_LON = 11.544973

# Bottom-right (southeast) corner
BOTTOM_RIGHT_LAT = 48.126496
BOTTOM_RIGHT_LON = 11.553518

# Tile size in meters
TILE_SIZE_METERS = 50

# Conversion factors at Munich's latitude (~48.13°)
# 1 degree latitude ≈ 111,320 meters
# 1 degree longitude ≈ 111,320 * cos(48.13°) ≈ 74,500 meters
DEGREES_PER_METER_LAT = 1.0 / 111320.0
DEGREES_PER_METER_LON = 1.0 / (111320.0 * math.cos(math.radians(48.13)))

# Calculate dimensions in degrees
LAT_SPAN = TOP_LEFT_LAT - BOTTOM_RIGHT_LAT  # North-south span
LON_SPAN = BOTTOM_RIGHT_LON - TOP_LEFT_LON  # East-west span

# Calculate dimensions in meters
AREA_HEIGHT_METERS = LAT_SPAN / DEGREES_PER_METER_LAT  # North-south height
AREA_WIDTH_METERS = LON_SPAN / DEGREES_PER_METER_LON   # East-west width

# Tile size in degrees
TILE_SIZE_DEGREES_LAT = TILE_SIZE_METERS * DEGREES_PER_METER_LAT
TILE_SIZE_DEGREES_LON = TILE_SIZE_METERS * DEGREES_PER_METER_LON

# Calculate number of tiles (round up to ensure full coverage)
NUM_TILES_HEIGHT = math.ceil(AREA_HEIGHT_METERS / TILE_SIZE_METERS)
NUM_TILES_WIDTH = math.ceil(AREA_WIDTH_METERS / TILE_SIZE_METERS)

# API configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")  # Default to localhost
API_ENDPOINT = f"{API_BASE_URL}/map"


def fetch_tile_counts() -> Dict[str, int]:
    """
    Fetch current tile counts from the API.
    Returns a dictionary mapping tile_id to count.
    """
    try:
        if HAS_REQUESTS:
            response = requests.get(API_ENDPOINT, timeout=10)
            response.raise_for_status()
            return response.json()
        else:
            # Fallback to urllib
            from urllib.request import urlopen
            from urllib.error import URLError
            with urlopen(API_ENDPOINT, timeout=10) as response:
                data = json.loads(response.read().decode())
                return data
    except Exception as e:
        print(f"⚠️  Warning: Could not fetch tile counts from API: {e}")
        print(f"   Endpoint: {API_ENDPOINT}")
        print("   Continuing with all tiles set to count 0...")
        return {}


def get_color_for_count(count: int, max_count: int) -> Dict[str, str]:
    """
    Calculate color based on count (green to red gradient).
    Returns color in multiple formats for different use cases.
    """
    if max_count == 0 or count == 0:
        # Green for empty/low
        return {
            "hex": "#00FF00",  # Green
            "rgb": "rgb(0, 255, 0)",
            "rgba": "rgba(0, 255, 0, 0.2)",
            "rgbaMapbox": "rgba(0, 255, 0, 0.2)"
        }
    
    # Normalize count to 0-1 range
    intensity = count / max_count
    
    # Interpolate from green (0) to red (1)
    # Green: RGB(0, 255, 0)
    # Yellow: RGB(255, 255, 0) at 0.5
    # Red: RGB(255, 0, 0)
    
    if intensity < 0.5:
        # Green to Yellow
        r = int(255 * (intensity * 2))  # 0 -> 255
        g = 255
        b = 0
    else:
        # Yellow to Red
        r = 255
        g = int(255 * (2 - intensity * 2))  # 255 -> 0
        b = 0
    
    # Calculate opacity based on intensity (more intense = more opaque)
    opacity = 0.2 + (intensity * 0.6)  # 0.2 to 0.8
    
    return {
        "hex": f"#{r:02X}{g:02X}{b:02X}",
        "rgb": f"rgb({r}, {g}, {b})",
        "rgba": f"rgba({r}, {g}, {b}, {opacity:.2f})",
        "rgbaMapbox": f"rgba({r}, {g}, {b}, {opacity:.2f})"
    }

# Fetch tile counts from API
print("📡 Fetching tile counts from API...")
tile_counts = fetch_tile_counts()

# Calculate max count for color scaling
max_count = max(tile_counts.values()) if tile_counts else 0
print(f"   Max count: {max_count}")
print(f"   Tiles with data: {len(tile_counts)}/{NUM_TILES_HEIGHT * NUM_TILES_WIDTH}")

# Generate tiles
tiles: List[Dict] = []

for row in range(NUM_TILES_HEIGHT):
    for col in range(NUM_TILES_WIDTH):
        tile_id = f"tile_{row}_{col}"
        
        # Get count for this tile (default to 0 if not found)
        count = tile_counts.get(tile_id, 0)
        
        # Calculate color based on count
        color = get_color_for_count(count, max_count)
        
        # Top-left corner of this tile
        top_left_lat = TOP_LEFT_LAT - (row * TILE_SIZE_DEGREES_LAT)
        top_left_lon = TOP_LEFT_LON + (col * TILE_SIZE_DEGREES_LON)
        
        # Bottom-right corner of this tile
        bottom_right_lat = top_left_lat - TILE_SIZE_DEGREES_LAT
        bottom_right_lon = top_left_lon + TILE_SIZE_DEGREES_LON
        
        tile_data = {
            "id": tile_id,
            "row": row,
            "col": col,
            "count": count,
            "color": color,
            "topLeft": [top_left_lon, top_left_lat],  # [longitude, latitude] for Mapbox
            "bottomRight": [bottom_right_lon, bottom_right_lat],  # [longitude, latitude] for Mapbox
            # Also provide as GeoJSON polygon for easy rendering
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [top_left_lon, top_left_lat],  # Top-left
                    [bottom_right_lon, top_left_lat],  # Top-right
                    [bottom_right_lon, bottom_right_lat],  # Bottom-right
                    [top_left_lon, bottom_right_lat],  # Bottom-left
                    [top_left_lon, top_left_lat]  # Close polygon
                ]]
            },
            "bbox": [
                top_left_lon,  # West
                bottom_right_lat,  # South
                bottom_right_lon,  # East
                top_left_lat  # North
            ]
        }
        
        tiles.append(tile_data)

# Create the output structure
output = {
    "type": "FeatureCollection",
    "metadata": {
        "area": "Theresienwiese (Oktoberfest)",
        "tileSizeMeters": TILE_SIZE_METERS,
        "numTilesHeight": NUM_TILES_HEIGHT,
        "numTilesWidth": NUM_TILES_WIDTH,
        "totalTiles": len(tiles),
        "maxCount": max_count,
        "tilesWithData": len(tile_counts),
        "boundingBox": {
            "topLeft": [TOP_LEFT_LON, TOP_LEFT_LAT],
            "bottomRight": [BOTTOM_RIGHT_LON, BOTTOM_RIGHT_LAT]
        }
    },
    "tiles": tiles,
    # Also provide as GeoJSON FeatureCollection for direct Mapbox use
    "features": [
        {
            "type": "Feature",
            "id": tile["id"],
            "properties": {
                "tileId": tile["id"],
                "row": tile["row"],
                "col": tile["col"],
                "count": tile["count"],
                "color": tile["color"]
            },
            "geometry": tile["geometry"]
        }
        for tile in tiles
    ]
}

# Write to JSON file
output_file = "oktoberfest_tiles.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"✅ Generated {len(tiles)} tiles in {output_file}")
print(f"   Grid size: {NUM_TILES_WIDTH} x {NUM_TILES_HEIGHT} tiles")
print(f"   Total area: ~{AREA_WIDTH_METERS:.0f}m x {AREA_HEIGHT_METERS:.0f}m")
print(f"   Max count: {max_count}")
print(f"   Tiles with data: {len(tile_counts)}")

