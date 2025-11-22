# React Native Frontend Integration Guide

This guide shows you how to display the Oktoberfest tileset in your React Native app.

## Quick Start

### Option 1: Using react-native-maps (Recommended for beginners)

1. **Install dependencies:**

```bash
npm install react-native-maps
# For iOS, also run:
cd ios && pod install
```

2. **Copy the JSON file:**

   - Copy `backend/oktoberfest_tiles.json` to your `assets` folder
   - Or import it directly: `import tilesData from './path/to/oktoberfest_tiles.json'`

3. **Use the component:**

```tsx
import { OktoberfestMap } from "./OktoberfestMap";

export default function App() {
  return <OktoberfestMap />;
}
```

### Option 2: Using Mapbox GL (Better performance, more features)

1. **Install dependencies:**

```bash
npm install @rnmapbox/maps
```

2. **Get Mapbox access token:**

   - Sign up at https://account.mapbox.com/
   - Get your access token
   - Set it in the component: `Mapbox.setAccessToken('YOUR_TOKEN')`

3. **Use the component:**

```tsx
import { OktoberfestMapWithMapbox } from "./OktoberfestMapWithMapbox";

export default function App() {
  return <OktoberfestMapWithMapbox />;
}
```

## API Integration

The components automatically fetch tile counts from your backend API:

```typescript
// The API endpoint should return:
{
  "tile_0_0": 5,
  "tile_0_1": 12,
  "tile_1_0": 0,
  // ... etc
}
```

Update the `API_BASE_URL` constant in the component files to match your backend URL.

## Customization

### Change colors

Edit the `getColorForCount` function in `OktoberfestMap.tsx`:

```typescript
const getColorForCount = (count: number, maxCount: number): string => {
  // Your custom color logic here
  if (count === 0) return "rgba(0, 0, 0, 0.05)"; // Transparent for empty
  // ... more colors
};
```

### Change refresh interval

Modify the interval in the `useEffect` hook:

```typescript
const interval = setInterval(fetchTileCounts, 30000); // 30 seconds
```

### Add interactivity

Add `onPress` handlers to tiles:

```tsx
<Polygon
  key={tile.id}
  coordinates={coordinates}
  fillColor={fillColor}
  onPress={() => {
    Alert.alert("Tile Info", `Tile: ${tile.id}\nCount: ${count}`);
  }}
/>
```

## Performance Tips

1. **For large datasets:** Consider using Mapbox GL instead of react-native-maps
2. **Reduce re-renders:** Memoize the tile rendering
3. **Optimize API calls:** Use WebSockets for real-time updates instead of polling
4. **Lazy loading:** Only render visible tiles

## Example: Custom Hook

```typescript
// useTileCounts.ts
import { useState, useEffect } from "react";

export const useTileCounts = (apiUrl: string, refreshInterval = 30000) => {
  const [tileCounts, setTileCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTileCounts = async () => {
      try {
        const response = await fetch(`${apiUrl}/map`);
        const data = await response.json();
        setTileCounts(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchTileCounts();
    const interval = setInterval(fetchTileCounts, refreshInterval);
    return () => clearInterval(interval);
  }, [apiUrl, refreshInterval]);

  return { tileCounts, loading, error };
};
```

## Troubleshooting

### Tiles not showing

- Check that the JSON file path is correct
- Verify coordinates are in [longitude, latitude] format
- Ensure map region includes the bounding box

### Performance issues

- Reduce the number of tiles rendered
- Use Mapbox GL instead of react-native-maps
- Implement tile clustering for zoomed-out views

### API connection errors

- Check CORS settings on your backend
- Verify API_BASE_URL is correct
- Check network permissions in app config

## Next Steps

1. Add legend showing color scale
2. Add tooltips/popups on tile press
3. Implement filtering by time range
4. Add animation for count changes
5. Create a heatmap gradient overlay
