"""
Tile definitions for Theresienwiese (Oktoberfest grounds).
Each tile is 50x50 meters, identified by its top-left corner coordinates.
"""

from typing import Dict, Tuple, List, Optional
import math
import struct

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
DEGREES_PER_METER_LAT = 1.0 / 111320.0  # ~0.00000898 degrees per meter
DEGREES_PER_METER_LON = 1.0 / (111320.0 * math.cos(math.radians(48.13)))  # ~0.0000134 degrees per meter at 48° latitude

# Calculate dimensions in degrees
LAT_SPAN = TOP_LEFT_LAT - BOTTOM_RIGHT_LAT  # North-south span
LON_SPAN = BOTTOM_RIGHT_LON - TOP_LEFT_LON  # East-west span

# Calculate dimensions in meters
AREA_HEIGHT_METERS = LAT_SPAN / DEGREES_PER_METER_LAT  # North-south height
AREA_WIDTH_METERS = LON_SPAN / DEGREES_PER_METER_LON   # East-west width

# Tile size in degrees
TILE_SIZE_DEGREES_LAT = TILE_SIZE_METERS * DEGREES_PER_METER_LAT  # ~0.000449 degrees
TILE_SIZE_DEGREES_LON = TILE_SIZE_METERS * DEGREES_PER_METER_LON  # ~0.000671 degrees

# Calculate number of tiles (round up to ensure full coverage)
NUM_TILES_HEIGHT = math.ceil(AREA_HEIGHT_METERS / TILE_SIZE_METERS)  # Number of tiles vertically (north-south)
NUM_TILES_WIDTH = math.ceil(AREA_WIDTH_METERS / TILE_SIZE_METERS)    # Number of tiles horizontally (east-west)
TOTAL_TILES = NUM_TILES_HEIGHT * NUM_TILES_WIDTH

# Generate all tiles as a list of (tile_id, top_left_lat, top_left_lon)
OKTOBERFEST_TILES: List[Tuple[str, float, float]] = []

for row in range(NUM_TILES_HEIGHT):
    for col in range(NUM_TILES_WIDTH):
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
    row = max(0, min(row, NUM_TILES_HEIGHT - 1))
    col = max(0, min(col, NUM_TILES_WIDTH - 1))
    
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
        
        coords = extract_coordinates(position_data)
        if coords is None:
            continue
        
        longitude, latitude = coords
        
        # Get tile ID for this position
        tile_id = get_tile_id(latitude, longitude)
        if tile_id:
            tile_counts[tile_id] = tile_counts.get(tile_id, 0) + 1
    
    return tile_counts


# Oktoberfest tent POIs (Points of Interest)
# Format: (poi_name, longitude, latitude)
# Note: All POIs are treated the same way in the database (as "tents")
# Types are stored locally in OKTOBERFEST_POI_TYPES for local use only
OKTOBERFEST_TENTS: List[Tuple[str, float, float]] = [
    # Tents
    ("schottenhammel", 11.548353, 48.132072),
    ("loewenbraeu", 11.549452, 48.130993),
    ("hacker_festzelt", 11.548750, 48.132990),
    ("paulaner", 11.547958, 48.131006),
    ("kaefer", 11.547610, 48.130425),
    ("augustiner", 11.549934, 48.132894),
    # Roller Coasters
    ("wilde_maus", 11.551921, 48.132814),
    ("teufelsrad", 11.551595, 48.132216),
    ("hexenschaukel", 11.551471, 48.132642),
    # Food
    ("kalbsbratierei_heimer", 11.550964, 48.133435),
    ("cafe_kaiserschmarn_rischart", 11.550630, 48.130582),
]

# POI types for local use only (not stored in database)
# Maps poi_name -> type
OKTOBERFEST_POI_TYPES: Dict[str, str] = {
    # Tents
    "schottenhammel": "tent",
    "loewenbraeu": "tent",
    "hacker_festzelt": "tent",
    "paulaner": "tent",
    "kaefer": "tent",
    "augustiner": "tent",
    # Roller Coasters
    "wilde_maus": "roller_coaster",
    "teufelsrad": "roller_coaster",
    "hexenschaukel": "roller_coaster",
    # Food
    "kalbsbratierei_heimer": "food",
    "cafe_kaiserschmarn_rischart": "food",
}

# Radius for tent counting in meters
TENT_RADIUS_METERS = 80


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth using the Haversine formula.
    
    Args:
        lat1, lon1: Latitude and longitude of first point in decimal degrees
        lat2, lon2: Latitude and longitude of second point in decimal degrees
        
    Returns:
        Distance in meters
    """
    # Earth's radius in meters
    R = 6371000
    
    # Convert degrees to radians
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    # Haversine formula
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def extract_coordinates(position_data: str) -> Optional[Tuple[float, float]]:
    """
    Extract longitude and latitude from PostGIS position data.
    
    Args:
        position_data: PostGIS WKB hex string or POINT format string
        
    Returns:
        Tuple of (longitude, latitude) or None if parsing fails
    """
    if not position_data:
        return None
    
    try:
        # Check if it's a hex string (WKB format)
        if isinstance(position_data, str) and len(position_data) > 10:
            # Try to decode as WKB hex string
            if all(c in '0123456789ABCDEFabcdef' for c in position_data):
                return decode_wkb_point(position_data)
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
                        return None
                    longitude = float(parts[0])
                    latitude = float(parts[1])
                    return (longitude, latitude)
    except (ValueError, IndexError, struct.error):
        pass
    
    return None


def assign_positions_to_tents(positions: List[Dict]) -> Dict[str, int]:
    """
    Count positions within 50 meters of each Oktoberfest tent.
    Similar to assign_positions_to_tiles, but uses distance-based counting.
    
    Args:
        positions: List of position dictionaries with 'position' field containing PostGIS WKB hex string
        
    Returns:
        Dictionary mapping tent name to count of positions within 50m radius
    """
    tent_counts: Dict[str, int] = {}
    
    # Initialize all tent counts to 0
    for tent_name, _, _ in OKTOBERFEST_TENTS:
        tent_counts[tent_name] = 0
    
    for pos_entry in positions:
        # Extract position from PostGIS format
        position_data = pos_entry.get("position")
        if not position_data:
            continue
        
        coords = extract_coordinates(position_data)
        if coords is None:
            continue
        
        longitude, latitude = coords
        
        # Check distance to each tent
        for tent_name, tent_lon, tent_lat in OKTOBERFEST_TENTS:
            distance = haversine_distance(latitude, longitude, tent_lat, tent_lon)
            if distance <= TENT_RADIUS_METERS:
                tent_counts[tent_name] = tent_counts.get(tent_name, 0) + 1
    
    return tent_counts


def count_to_color(count: int, min_count: int = 1, max_count: int = 10) -> str:
    """
    Convert a count value to a color string (RGBA format).
    Maps count from min_count (green) to max_count (red) with interpolation.
    Count of 0 returns transparent gray.
    
    Args:
        count: The count value to convert
        min_count: Minimum count value (maps to green)
        max_count: Maximum count value (maps to red)
        
    Returns:
        RGBA color string like "rgba(0, 255, 0, 0.5)" for green or "rgba(255, 0, 0, 0.5)" for red
        Returns "rgba(128, 128, 128, 0.1)" for count=0
    """
    # If count is 0, return transparent gray
    if count == 0:
        return "rgba(128, 128, 128, 0.1)"
    
    # Clamp count to valid range
    count = max(min_count, min(count, max_count))
    
    # Normalize count to 0-1 range
    normalized = (count - min_count) / (max_count - min_count) if max_count > min_count else 0
    
    # Interpolate between green (0, 255, 0) and red (255, 0, 0)
    # Green: RGB(0, 255, 0)
    # Red: RGB(255, 0, 0)
    red = int(255 * normalized)
    green = int(255 * (1 - normalized))
    blue = 0
    
    # Use 0.5 opacity for visibility
    return f"rgba({red}, {green}, {blue}, 0.5)"