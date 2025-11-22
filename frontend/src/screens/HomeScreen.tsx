import React, { useRef, useCallback } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MapboxWebView, MapboxWebViewRef } from '../components/MapboxWebView';

const INITIAL_CENTER: [number, number] = [11.5492349, 48.1313557];
const INITIAL_ZOOM = 14;

export const HomeScreen = () => {
    const colorScheme = useColorScheme();
    const mapRef = useRef<MapboxWebViewRef>(null);

    useFocusEffect(
        useCallback(() => {
            // Reset camera when screen comes into focus
            mapRef.current?.flyTo(INITIAL_CENTER, INITIAL_ZOOM);
        }, [])
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
