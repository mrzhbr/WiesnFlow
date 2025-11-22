"""
Tile definitions for Theresienwiese (Oktoberfest grounds).
Each tile is 50x50 meters, identified by its top-left corner coordinates.
"""

from typing import Dict, Tuple, List
import math
import struct

# Theresienwiese approximate center coordinates
THRESIENWIESE_CENTER_LAT = 48.1315
THRESIENWIESE_CENTER_LON = 11.5498

# Approximate area dimensions (roughly square)
AREA_SIZE_METERS = 648  # meters (sqrt of ~420,000 m²)

# Tile size in meters
TILE_SIZE_METERS = 50

# Conversion factors at Munich's latitude (~48.1315°)
# 1 degree latitude ≈ 111,320 meters
# 1 degree longitude ≈ 111,320 * cos(48.1315°) ≈ 74,500 meters
DEGREES_PER_METER_LAT = 1.0 / 111320.0  # ~0.00000898 degrees per meter
DEGREES_PER_METER_LON = 1.0 / (111320.0 * 0.670)  # ~0.0000134 degrees per meter at 48° latitude

# Tile size in degrees
TILE_SIZE_DEGREES_LAT = TILE_SIZE_METERS * DEGREES_PER_METER_LAT  # ~0.000449 degrees
TILE_SIZE_DEGREES_LON = TILE_SIZE_METERS * DEGREES_PER_METER_LON  # ~0.000671 degrees

# Calculate number of tiles (round up to ensure full coverage)
NUM_TILES_PER_SIDE = math.ceil(AREA_SIZE_METERS / TILE_SIZE_METERS)  # 13 tiles per side (650m coverage)
TOTAL_TILES = NUM_TILES_PER_SIDE * NUM_TILES_PER_SIDE  # 169 tiles

# Calculate top-left corner (northwest corner)
# Offset by half the area size from center
TOP_LEFT_LAT = THRESIENWIESE_CENTER_LAT + (AREA_SIZE_METERS / 2) * DEGREES_PER_METER_LAT
TOP_LEFT_LON = THRESIENWIESE_CENTER_LON - (AREA_SIZE_METERS / 2) * DEGREES_PER_METER_LON

# Generate all tiles as a list of (tile_id, top_left_lat, top_left_lon)
OKTOBERFEST_TILES: List[Tuple[str, float, float]] = []

for row in range(NUM_TILES_PER_SIDE):
    for col in range(NUM_TILES_PER_SIDE):
        tile_id = f"tile_{row}_{col}"
        tile_lat = TOP_LEFT_LAT - (row * TILE_SIZE_DEGREES_LAT)
        tile_lon = TOP_LEFT_LON + (col * TILE_SIZE_DEGREES_LON)
        OKTOBERFEST_TILES.append((tile_id, tile_lat, tile_lon))


def get_tile_id(latitude: float, longitude: float) -> str:
    """
    Determine which tile a given latitude/longitude position belongs to.
    
    Args:
        latitude: Latitude in decimal degrees
        longitude: Longitude in decimal degrees
        
    Returns:
        Tile ID string (e.g., "tile_5_7") or None if outside the area
    """
    # Calculate row and column indices
    # Row: 0 is at TOP_LEFT_LAT, increases as latitude decreases (going south)
    row = int((TOP_LEFT_LAT - latitude) / TILE_SIZE_DEGREES_LAT)
    # Column: 0 is at TOP_LEFT_LON, increases as longitude increases (going east)
    col = int((longitude - TOP_LEFT_LON) / TILE_SIZE_DEGREES_LON)
    
    # Clamp to valid range (this handles edge cases and positions slightly outside bounds)
    row = max(0, min(row, NUM_TILES_PER_SIDE - 1))
    col = max(0, min(col, NUM_TILES_PER_SIDE - 1))
    
    return f"tile_{row}_{col}"


def decode_wkb_point(wkb_hex: str) -> Tuple[float, float]:
    """
    Decode PostGIS Well-Known Binary (WKB) format to extract longitude and latitude.
    
    WKB format for Point with SRID:
    - Byte 0: Endianness (01 = little endian, 00 = big endian)
    - Bytes 1-4: Geometry type (01000020 = Point with SRID)
    - Bytes 5-8: SRID (E6100000 = 4326 in little endian)
    - Bytes 9-16: X coordinate (longitude) as double
    - Bytes 17-24: Y coordinate (latitude) as double
    
    Args:
        wkb_hex: Hexadecimal string representation of WKB binary data
        
    Returns:
        Tuple of (longitude, latitude)
    """
    # Convert hex string to bytes
    wkb_bytes = bytes.fromhex(wkb_hex)
    
    # Check endianness (first byte)
    if wkb_bytes[0] == 1:
        endian = '<'  # little endian
    else:
        endian = '>'  # big endian
    
    # Skip endianness byte (1 byte)
    # Skip geometry type (4 bytes) - should be 0x00000001 for Point or 0x20000001 for Point with SRID
    offset = 1
    
    # Check if it's a Point with SRID (0x20000001) or regular Point (0x00000001)
    geom_type = struct.unpack(f'{endian}I', wkb_bytes[offset:offset+4])[0]
    offset += 4
    
    # If SRID is present (geometry type & 0x20000000), skip SRID (4 bytes)
    if geom_type & 0x20000000:
        # Skip SRID
        offset += 4
    
    # Read longitude (X coordinate) - 8 bytes as double
    longitude = struct.unpack(f'{endian}d', wkb_bytes[offset:offset+8])[0]
    offset += 8
    
    # Read latitude (Y coordinate) - 8 bytes as double
    latitude = struct.unpack(f'{endian}d', wkb_bytes[offset:offset+8])[0]
    
    return (longitude, latitude)


def assign_positions_to_tiles(positions: List[Dict]) -> Dict[str, int]:
    """
    Assign a list of position entries to their corresponding tiles.
    
    Args:
        positions: List of position dictionaries with 'position' field containing PostGIS WKB hex string
        
    Returns:
        Dictionary mapping tile_id to count of positions in that tile
    """
    tile_counts: Dict[str, int] = {}
    
    for pos_entry in positions:
        # Extract position from PostGIS format
        position_data = pos_entry.get("position")
        if not position_data:
            continue
            
        try:
            # Check if it's a hex string (WKB format)
            if isinstance(position_data, str) and len(position_data) > 10:
                # Try to decode as WKB hex string
                # WKB hex strings are typically long hex strings without spaces
                if all(c in '0123456789ABCDEFabcdef' for c in position_data):
                    longitude, latitude = decode_wkb_point(position_data)
                else:
                    # Try parsing as text format: "SRID=4326;POINT(longitude latitude)" or "POINT(longitude latitude)"
                    if ';' in position_data:
                        point_str = position_data.split(';', 1)[1]
                    else:
                        point_str = position_data
                    
                    # Extract coordinates: POINT(longitude latitude)
                    if point_str.upper().startswith('POINT'):
                        coords = point_str[6:-1]  # Remove "POINT(" and ")"
                        parts = coords.split()
                        if len(parts) != 2:
                            continue
                        longitude = float(parts[0])
                        latitude = float(parts[1])
                    else:
                        continue
            else:
                continue
            
            # Get tile ID for this position
            tile_id = get_tile_id(latitude, longitude)
            if tile_id:
                tile_counts[tile_id] = tile_counts.get(tile_id, 0) + 1
                
        except (ValueError, IndexError, struct.error) as e:
            # Skip invalid position entries
            continue
    
    return tile_counts

