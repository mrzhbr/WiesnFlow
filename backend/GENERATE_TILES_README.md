# Generate Tiles JSON with Live Data

This script generates a JSON file with all Oktoberfest tiles, including current counts and colors from the API.

## Usage

### Basic Usage (with default localhost API)

```bash
cd backend
python generate_tiles_json.py
```

### With Custom API URL

```bash
# Set environment variable
export API_BASE_URL="http://your-api-url.com"
python generate_tiles_json.py

# Or on Windows:
set API_BASE_URL=http://your-api-url.com
python generate_tiles_json.py
```

## Output

The script generates `oktoberfest_tiles.json` with:

1. **Tile coordinates** - Top-left and bottom-right corners for each tile
2. **Current counts** - Fetched from `/map` API endpoint
3. **Colors** - Automatically calculated based on count (green → yellow → red)
4. **GeoJSON features** - Ready for Mapbox/MapLibre rendering

## Color Scheme

- **Green** (`#00FF00`) - Empty tiles (count = 0)
- **Yellow** (`#FFFF00`) - Medium density (around 50% of max)
- **Red** (`#FF0000`) - High density (max count)

Colors are interpolated smoothly between these points based on the count relative to the maximum count.

## Output Format

Each tile includes:

```json
{
  "id": "tile_0_0",
  "row": 0,
  "col": 0,
  "count": 5,
  "color": {
    "hex": "#80FF00",
    "rgb": "rgb(128, 255, 0)",
    "rgba": "rgba(128, 255, 0, 0.50)",
    "rgbaMapbox": "rgba(128, 255, 0, 0.50)"
  },
  "topLeft": [11.544973, 48.136293],
  "bottomRight": [11.545646, 48.135844],
  "geometry": { ... },
  "bbox": [ ... ]
}
```

## Features Array

The `features` array contains GeoJSON features with count and color in properties:

```json
{
  "type": "Feature",
  "id": "tile_0_0",
  "properties": {
    "tileId": "tile_0_0",
    "row": 0,
    "col": 0,
    "count": 5,
    "color": { ... }
  },
  "geometry": { ... }
}
```

## Error Handling

If the API is unavailable:
- The script will continue with all counts set to 0
- All tiles will be colored green (empty)
- A warning message will be displayed

## Requirements

- Python 3.7+
- `requests` library (or falls back to urllib)
- Running FastAPI backend with `/map` endpoint

Install dependencies:
```bash
pip install -r requirements.txt
```

