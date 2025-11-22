"""
Generate a JSON file with static tile data for Mapbox visualization.
Contains only static geometry data - counts and colors are handled in the frontend.
"""

import json
import math
from typing import List, Dict

# Theresienwiese bounding box coordinates
# Top-left (northwest) corner
TOP_LEFT_LAT = 48.136293
TOP_LEFT_LON = 11.544973

# Bottom-right (southeast) corner
BOTTOM_RIGHT_LAT = 48.126496
BOTTOM_RIGHT_LON = 11.553518

# Tile size in meters
TILE_SIZE_METERS = 100

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

# Generate tiles
tiles: List[Dict] = []

for row in range(NUM_TILES_HEIGHT):
    for col in range(NUM_TILES_WIDTH):
        tile_id = f"tile_{row}_{col}"
        
        # Top-left corner of this tile
        top_left_lat = TOP_LEFT_LAT - (row * TILE_SIZE_DEGREES_LAT)
        top_left_lon = TOP_LEFT_LON + (col * TILE_SIZE_DEGREES_LON)
        
        # Bottom-right corner of this tile
        bottom_right_lat = top_left_lat - TILE_SIZE_DEGREES_LAT
        bottom_right_lon = top_left_lon + TILE_SIZE_DEGREES_LON
        
        # Create GeoJSON polygon coordinates
        # GeoJSON format: [longitude, latitude]
        coordinates = [[
            [top_left_lon, top_left_lat],  # Top-left
            [bottom_right_lon, top_left_lat],  # Top-right
            [bottom_right_lon, bottom_right_lat],  # Bottom-right
            [top_left_lon, bottom_right_lat],  # Bottom-left
            [top_left_lon, top_left_lat]  # Close polygon
        ]]
        
        tile_data = {
            "id": tile_id,
            "row": row,
            "col": col,
            "topLeft": [top_left_lon, top_left_lat],  # [longitude, latitude] for Mapbox
            "bottomRight": [bottom_right_lon, bottom_right_lat],  # [longitude, latitude] for Mapbox
            "bbox": [
                top_left_lon,  # West
                bottom_right_lat,  # South
                bottom_right_lon,  # East
                top_left_lat  # North
            ],
            "geometry": {
                "type": "Polygon",
                "coordinates": coordinates
            }
        }
        
        tiles.append(tile_data)

# Create GeoJSON FeatureCollection for direct Mapbox use
# Frontend can add 'count' and 'color' to properties as needed
features = [
    {
        "type": "Feature",
        "id": tile["id"],
        "properties": {
            "tileId": tile["id"],
            "row": tile["row"],
            "col": tile["col"]
            # Frontend will add: "count": number, "color": string
        },
        "geometry": tile["geometry"]
    }
    for tile in tiles
]

# Create the output structure
output = {
    "type": "FeatureCollection",
    "metadata": {
        "area": "Theresienwiese (Oktoberfest)",
        "tileSizeMeters": TILE_SIZE_METERS,
        "numTilesHeight": NUM_TILES_HEIGHT,
        "numTilesWidth": NUM_TILES_WIDTH,
        "totalTiles": len(tiles),
        "boundingBox": {
            "topLeft": [TOP_LEFT_LON, TOP_LEFT_LAT],
            "bottomRight": [BOTTOM_RIGHT_LON, BOTTOM_RIGHT_LAT]
        }
    },
    "features": features
}

# Write to JSON file
output_file = "oktoberfest_tiles.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"✅ Generated {len(tiles)} static tiles in {output_file}")
print(f"   Grid size: {NUM_TILES_WIDTH} x {NUM_TILES_HEIGHT} tiles")
print(f"   Total area: ~{AREA_WIDTH_METERS:.0f}m x {AREA_HEIGHT_METERS:.0f}m")
print(f"   Format: GeoJSON FeatureCollection (Mapbox-ready)")
print()
print("📝 Note: Frontend should add 'count' and 'color' to feature.properties")
print("   Example: feature.properties.count = 5")
print("            feature.properties.color = 'rgba(255, 0, 0, 0.5)'")
