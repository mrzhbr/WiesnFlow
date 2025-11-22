/**
 * Simple standalone example - displays tiles without API integration
 * Good for testing the visualization
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import tilesData from '../assets/oktoberfest_tiles.json'; // Adjust path

interface TilesData {
  metadata: {
    boundingBox: {
      topLeft: [number, number];
      bottomRight: [number, number];
    };
  };
  tiles: Array<{
    id: string;
    geometry: {
      coordinates: number[][][];
    };
  }>;
}

export const OktoberfestMapSimple: React.FC = () => {
  const tilesDataTyped = tilesData as TilesData;
  const { boundingBox } = tilesDataTyped.metadata;

  // Convert GeoJSON coordinates to react-native-maps format
  const convertCoordinates = (coords: number[][]): Array<{ latitude: number; longitude: number }> => {
    return coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  };

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: (boundingBox.topLeft[1] + boundingBox.bottomRight[1]) / 2,
          longitude: (boundingBox.topLeft[0] + boundingBox.bottomRight[0]) / 2,
          latitudeDelta: boundingBox.topLeft[1] - boundingBox.bottomRight[1] + 0.01,
          longitudeDelta: boundingBox.bottomRight[0] - boundingBox.topLeft[0] + 0.01,
        }}
      >
        {tilesDataTyped.tiles.map((tile) => {
          const coordinates = convertCoordinates(tile.geometry.coordinates[0]);

          return (
            <Polygon
              key={tile.id}
              coordinates={coordinates}
              fillColor="rgba(0, 100, 255, 0.2)"
              strokeColor="rgba(0, 0, 0, 0.3)"
              strokeWidth={1}
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
  },
  map: {
    width: '100%',
    height: '100%',
  },
});

