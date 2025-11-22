import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { MapboxWebView } from '../components/MapboxWebView';

export const HomeScreen = () => {
    const colorScheme = useColorScheme();

    return (
        <View style={styles.container}>
            <MapboxWebView
                accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''}
                style={styles.map}
                initialCenter={[11.5492349, 48.1313557]}
                initialZoom={14}
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
