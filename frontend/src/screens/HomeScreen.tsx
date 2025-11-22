import React, { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MapboxWebView, MapboxWebViewRef } from '../components/MapboxWebView';
import oktoberfestTiles from '../data/oktoberfest_tiles.json';

const INITIAL_CENTER: [number, number] = [11.5492349, 48.1313557];
const INITIAL_ZOOM = 14;
const API_BASE_URL = "http://localhost:8000";

export const HomeScreen = () => {
    const colorScheme = useColorScheme();
    const mapRef = useRef<MapboxWebViewRef>(null);

    const fetchMapData = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/map`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            
            if (data.tiles) {
                mapRef.current?.updateTileData(data.tiles);
            }
        } catch (error) {
            console.error('Error fetching map data:', error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            // Reset camera when screen comes into focus
            mapRef.current?.flyTo(INITIAL_CENTER, INITIAL_ZOOM);
            
            // Initialize tiles with 0s
            const initialTiles: Record<string, number> = {};
            oktoberfestTiles.features.forEach((feature: any) => {
                if (feature.id) {
                    initialTiles[feature.id] = 0;
                }
            });
            mapRef.current?.updateTileData(initialTiles);
            
            // Fetch initial data
            fetchMapData();

            // Set up polling
            const interval = setInterval(fetchMapData, 30000); // Poll every 30 seconds

            return () => clearInterval(interval);
        }, [fetchMapData])
    );

    return (
        <View style={styles.container}>
            <MapboxWebView
                ref={mapRef}
                accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''}
                style={styles.map}
                initialCenter={INITIAL_CENTER}
                initialZoom={INITIAL_ZOOM}
                colorScheme={colorScheme}
            />
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
});
