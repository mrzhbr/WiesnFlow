/**
 * React Native component using Mapbox GL for better performance
 *
 * Requirements:
 * - @rnmapbox/maps: npm install @rnmapbox/maps
 *
 * Setup:
 * 1. Get Mapbox access token from https://account.mapbox.com/
 * 2. Set MAPBOX_ACCESS_TOKEN in your environment or config
 * 3. Copy oktoberfest_tiles.json to your assets folder
 */

import React, { useEffect, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text } from "react-native";
import Mapbox from "@rnmapbox/maps";

// Set your Mapbox access token
Mapbox.setAccessToken("YOUR_MAPBOX_ACCESS_TOKEN"); // Replace with your token

interface TileCount {
  [tileId: string]: number;
}

interface Tile {
  id: string;
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
  features: Array<{
    type: string;
    id: string;
    properties: {
      tileId: string;
    };
    geometry: {
      type: string;
      coordinates: number[][][];
    };
  }>;
}

const API_BASE_URL = "http://your-api-url.com"; // Replace with your backend URL

export const OktoberfestMapWithMapbox: React.FC = () => {
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
    const interval = setInterval(fetchTileCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const tilesDataTyped =
    require("../assets/oktoberfest_tiles.json") as TilesData;
  const { boundingBox } = tilesDataTyped.metadata;

  // Create GeoJSON with count data
  const geoJsonData = {
    type: "FeatureCollection" as const,
    features: tilesDataTyped.features.map((feature) => {
      const count = tileCounts[feature.id] || 0;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          count,
        },
      };
    }),
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
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera
          zoomLevel={15}
          centerCoordinate={[
            (boundingBox.topLeft[0] + boundingBox.bottomRight[0]) / 2,
            (boundingBox.topLeft[1] + boundingBox.bottomRight[1]) / 2,
          ]}
        />

        <Mapbox.ShapeSource id="tiles" shape={geoJsonData}>
          <Mapbox.FillLayer
            id="tileFill"
            style={{
              fillColor: [
                "interpolate",
                ["linear"],
                ["get", "count"],
                0,
                "rgba(0, 0, 255, 0.1)", // Blue for 0
                1,
                "rgba(0, 255, 0, 0.3)", // Green for low
                5,
                "rgba(255, 255, 0, 0.5)", // Yellow for medium
                10,
                "rgba(255, 165, 0, 0.7)", // Orange for high
                20,
                "rgba(255, 0, 0, 0.9)", // Red for very high
              ],
              fillOpacity: 0.6,
            }}
          />
          <Mapbox.LineLayer
            id="tileLines"
            style={{
              lineColor: "rgba(0, 0, 0, 0.1)",
              lineWidth: 0.5,
            }}
          />
        </Mapbox.ShapeSource>
      </Mapbox.MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  errorText: {
    color: "red",
    fontSize: 16,
  },
});
