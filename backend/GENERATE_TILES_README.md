# Generate Tiles JSON - Static Data Only

This script generates a JSON file with static tile geometry data for Theresienwiese (Oktoberfest). The file contains only static coordinates and geometry - counts and colors are handled in the frontend.

## Usage

```bash
cd backend
python generate_tiles_json.py
```

## Output Format

The script generates `oktoberfest_tiles.json` as a **GeoJSON FeatureCollection** that's ready to use with Mapbox.

### Structure

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "area": "Theresienwiese (Oktoberfest)",
    "tileSizeMeters": 50,
    "numTilesHeight": 22,
    "numTilesWidth": 13,
    "totalTiles": 286,
    "boundingBox": {
      "topLeft": [11.544973, 48.136293],
      "bottomRight": [11.553518, 48.126496]
    }
  },
  "features": [
    {
      "type": "Feature",
      "id": "tile_0_0",
      "properties": {
        "tileId": "tile_0_0",
        "row": 0,
        "col": 0
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [11.544973, 48.136293],
          [11.545646, 48.136293],
          [11.545646, 48.135844],
          [11.544973, 48.135844],
          [11.544973, 48.136293]
        ]]
      }
    }
  ]
}
```

## Frontend Usage with Mapbox

### Step 1: Load the JSON file

```typescript
import tilesData from './oktoberfest_tiles.json';
```

### Step 2: Fetch counts from API

```typescript
const response = await fetch('http://your-api.com/map');
const tileCounts: Record<string, number> = await response.json();
// Returns: { "tile_0_0": 5, "tile_0_1": 12, ... }
```

### Step 3: Add counts and colors to features

```typescript
const maxCount = Math.max(...Object.values(tileCounts), 1);

const featuresWithData = tilesData.features.map(feature => {
  const count = tileCounts[feature.id] || 0;
  const intensity = count / maxCount;
  
  // Calculate color (green to red gradient)
  let color: string;
  if (count === 0) {
    color = 'rgba(0, 255, 0, 0.2)'; // Green
  } else if (intensity < 0.5) {
    const r = Math.floor(255 * (intensity * 2));
    color = `rgba(${r}, 255, 0, ${0.2 + intensity * 0.3})`;
  } else {
    const g = Math.floor(255 * (2 - intensity * 2));
    color = `rgba(255, ${g}, 0, ${0.5 + intensity * 0.3})`;
  }
  
  return {
    ...feature,
    properties: {
      ...feature.properties,
      count,
      color
    }
  };
});
```

### Step 4: Use with Mapbox

```typescript
<Mapbox.ShapeSource id="tiles" shape={{
  type: 'FeatureCollection',
  features: featuresWithData
}}>
  <Mapbox.FillLayer
    id="tileFill"
    style={{
      fillColor: ['get', 'color'],
      fillOpacity: 0.6
    }}
  />
</Mapbox.ShapeSource>
```

## Properties Available

Each feature has the following properties:

- `tileId`: Unique identifier (e.g., "tile_0_0")
- `row`: Row index (0-based)
- `col`: Column index (0-based)

**Frontend should add:**
- `count`: Number of positions in this tile (from API)
- `color`: Color string for rendering (calculated from count)

## Tile Coordinates

Each tile includes:
- `topLeft`: `[longitude, latitude]` of top-left corner
- `bottomRight`: `[longitude, latitude]` of bottom-right corner
- `bbox`: Bounding box `[west, south, east, north]`
- `geometry`: GeoJSON Polygon geometry

## Notes

- All coordinates are in WGS84 (EPSG:4326)
- Coordinates are in `[longitude, latitude]` format (GeoJSON standard)
- Each tile is exactly 50x50 meters
- The grid covers the entire Theresienwiese area
- Tiles are numbered from top-left (tile_0_0) to bottom-right
