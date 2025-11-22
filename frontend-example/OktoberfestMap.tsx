/**
 * React Native component to display Oktoberfest tiles as a heatmap
 *
 * Requirements:
 * - react-native-maps: npm install react-native-maps
 * - @react-native-async-storage/async-storage: npm install @react-native-async-storage/async-storage
 *
 * Usage:
 * 1. Copy oktoberfest_tiles.json to your assets folder
 * 2. Import this component
 * 3. Use <OktoberfestMap /> in your app
 */

import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import MapView, { Polygon, PROVIDER_GOOGLE } from "react-native-maps";
import tilesData from "../assets/oktoberfest_tiles.json"; // Adjust path as needed

interface TileCount {
  [tileId: string]: number;
}

interface Tile {
  id: string;
  row: number;
  col: number;
  topLeft: [number, number];
  bottomRight: [number, number];
  geometry: {
    type: string;
    coordinates: number[][][];
  };
}

interface TilesData {
  metadata: {
    boundingBox: {
      topLeft: [number, number];
      bottomRight: [number, number];
    };
  };
  tiles: Tile[];
}

const API_BASE_URL = "http://your-api-url.com"; // Replace with your backend URL

/**
 * Get color based on count (heatmap style)
 */
const getColorForCount = (count: number, maxCount: number): string => {
  if (count === 0) return "rgba(0, 0, 255, 0.1)"; // Blue (low)
  if (maxCount === 0) return "rgba(0, 0, 255, 0.1)";

  const intensity = count / maxCount;

  if (intensity < 0.25) return `rgba(0, 255, 0, ${0.2 + intensity * 0.3})`; // Green (low-medium)
  if (intensity < 0.5) return `rgba(255, 255, 0, ${0.3 + intensity * 0.3})`; // Yellow (medium)
  if (intensity < 0.75) return `rgba(255, 165, 0, ${0.4 + intensity * 0.3})`; // Orange (high-medium)
  return `rgba(255, 0, 0, ${0.5 + intensity * 0.4})`; // Red (high)
};

export const OktoberfestMap: React.FC = () => {
  const [tileCounts, setTileCounts] = useState<TileCount>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load tile counts from API
  useEffect(() => {
    const fetchTileCounts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/map`);
        if (!response.ok) {
          throw new Error("Failed to fetch tile counts");
        }
        const data: TileCount = await response.json();
        setTileCounts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error("Error fetching tile counts:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTileCounts();

    // Refresh every 30 seconds
    const interval = setInterval(fetchTileCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const tilesDataTyped = tilesData as TilesData;
  const { boundingBox } = tilesDataTyped.metadata;

  // Calculate max count for color scaling
  const maxCount = Math.max(...Object.values(tileCounts), 1);

  // Convert GeoJSON coordinates to react-native-maps format
  // GeoJSON: [longitude, latitude]
  // react-native-maps: [{ latitude, longitude }]
  const convertCoordinates = (
    coords: number[][]
  ): Array<{ latitude: number; longitude: number }> => {
    return coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text>Loading map data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: (boundingBox.topLeft[1] + boundingBox.bottomRight[1]) / 2,
          longitude: (boundingBox.topLeft[0] + boundingBox.bottomRight[0]) / 2,
          latitudeDelta:
            boundingBox.topLeft[1] - boundingBox.bottomRight[1] + 0.01,
          longitudeDelta:
            boundingBox.bottomRight[0] - boundingBox.topLeft[0] + 0.01,
        }}
        mapType="standard"
      >
        {tilesDataTyped.tiles.map((tile) => {
          const count = tileCounts[tile.id] || 0;
          const coordinates = convertCoordinates(tile.geometry.coordinates[0]);
          const fillColor = getColorForCount(count, maxCount);

          return (
            <Polygon
              key={tile.id}
              coordinates={coordinates}
              fillColor={fillColor}
              strokeColor="rgba(0, 0, 0, 0.1)"
              strokeWidth={0.5}
            />
          );
        })}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  map: {
    width: "100%",
    height: "100%",
  },
  errorText: {
    color: "red",
    fontSize: 16,
  },
});
