import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import oktoberfestTiles from '../data/oktoberfest_tiles.json';

interface MapboxWebViewProps {
    accessToken: string;
    style?: any;
    initialCenter?: [number, number];
    initialZoom?: number;
    colorScheme?: 'light' | 'dark' | null | undefined;
}

export interface MapboxWebViewRef {
    flyTo: (center: [number, number], zoom?: number) => void;
}

export const MapboxWebView = forwardRef<MapboxWebViewRef, MapboxWebViewProps>(({
    accessToken,
    style,
    initialCenter = [-74.5, 40],
    initialZoom = 9,
    colorScheme = 'light'
}, ref) => {
    const webViewRef = useRef<WebView>(null);
    const mapStyle = colorScheme === 'dark'
        ? 'mapbox://styles/mapbox/dark-v11'
        : 'mapbox://styles/mapbox/streets-v12';

    useImperativeHandle(ref, () => ({
        flyTo: (center, zoom) => {
            webViewRef.current?.postMessage(JSON.stringify({
                type: 'flyTo',
                center,
                zoom: zoom ?? initialZoom
            }));
        }
    }));

    useEffect(() => {
        if (webViewRef.current) {
            webViewRef.current.postMessage(JSON.stringify({
                type: 'setStyle',
                style: mapStyle
            }));
        }
    }, [mapStyle]);

    const handleWebViewMessage = (event: any) => {
        try {
            const data = event.nativeEvent.data;
            // console.log('WebView Message:', data);
            if (data === 'mapLoaded') {
                // Send initial style when map reports loaded
                webViewRef.current?.postMessage(JSON.stringify({
                    type: 'setStyle',
                    style: mapStyle
                }));
            } else if (data.startsWith('log:')) {
                console.log('MapboxWebView Log:', data);
            }
        } catch (e) {
            console.error('Error handling WebView message', e);
        }
    };

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
      <script src='https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.js'></script>
      <link href='https://api.mapbox.com/mapbox-gl-js/v3.1.2/mapbox-gl.css' rel='stylesheet' />
      <style>
        body { margin: 0; padding: 0; }
        #map { position: absolute; top: 0; bottom: 0; width: 100%; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        function log(msg) {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage('log:' + msg);
            }
        }

        const tilesGeoJSON = ${JSON.stringify(oktoberfestTiles)};
        const API_BASE_URL = 'http://localhost:8000';
        let tileIntensityMap = {};

        mapboxgl.accessToken = '${accessToken}';
        const map = new mapboxgl.Map({
          container: 'map',
          style: '${mapStyle}',
          center: [${initialCenter[0]}, ${initialCenter[1]}],
          zoom: ${initialZoom}
        });

        // Function to get color based on intensity (0-100)
        function getColorForIntensity(intensity) {
            if (intensity === null || intensity === undefined || intensity === 0) {
                return 'rgba(59, 130, 246, 0.3)'; // Light blue for no data
            }
            
            // Gradient from yellow to orange to red based on intensity
            if (intensity < 20) {
                return 'rgba(34, 197, 94, 0.6)'; // Green for low
            } else if (intensity < 40) {
                return 'rgba(234, 179, 8, 0.6)'; // Yellow for medium-low
            } else if (intensity < 60) {
                return 'rgba(249, 115, 22, 0.7)'; // Orange for medium
            } else if (intensity < 80) {
                return 'rgba(239, 68, 68, 0.8)'; // Red for high
            } else {
                return 'rgba(220, 38, 38, 0.9)'; // Dark red for very high
            }
        }

        // Fetch tile data from API
        async function fetchTileData() {
            try {
                const response = await fetch(API_BASE_URL + '/map');
                if (!response.ok) {
                    log('API response not OK: ' + response.status);
                    return;
                }
                const data = await response.json();
                
                // Extract tiles from response (backend returns {tiles: {...}, tents: {...}})
                const tiles = data.tiles || {};
                
                // Create a map of tile ID to count, then normalize to intensity (0-100)
                tileIntensityMap = {};
                
                // Find max count for normalization
                let maxCount = 0;
                Object.values(tiles).forEach(count => {
                    if (count > maxCount) maxCount = count;
                });
                
                // Convert counts to intensity (0-100 scale)
                // If maxCount is 0, all intensities will be 0
                Object.keys(tiles).forEach(tileId => {
                    const count = tiles[tileId];
                    // Normalize to 0-100, with a minimum threshold to show some color
                    const intensity = maxCount > 0 ? Math.min(100, (count / maxCount) * 100) : 0;
                    tileIntensityMap[tileId] = intensity;
                });
                
                log('Fetched ' + Object.keys(tiles).length + ' tiles from API, max count: ' + maxCount);
                updateTileColors();
            } catch (error) {
                log('Error fetching tile data: ' + error.toString());
            }
        }

        // Update tile colors based on intensity data
        function updateTileColors() {
            if (!map.getSource('oktoberfest-tiles')) {
                return;
            }

            // Update the GeoJSON data with intensity values
            const updatedGeoJSON = JSON.parse(JSON.stringify(tilesGeoJSON));
            updatedGeoJSON.features.forEach(feature => {
                const tileId = feature.id || feature.properties.tileId;
                const intensity = tileIntensityMap[tileId];
                feature.properties.intensity = intensity !== undefined ? intensity : 0;
            });

            // Update the source data
            map.getSource('oktoberfest-tiles').setData(updatedGeoJSON);
        }

        function addTiles() {
            if (!map.getSource('oktoberfest-tiles')) {
                map.addSource('oktoberfest-tiles', {
                    type: 'geojson',
                    data: tilesGeoJSON
                });
                
                map.addLayer({
                    id: 'oktoberfest-tiles-fill',
                    type: 'fill',
                    source: 'oktoberfest-tiles',
                    paint: {
                        'fill-color': [
                            'case',
                            ['==', ['get', 'intensity'], null], 'rgba(59, 130, 246, 0.3)',
                            ['<', ['get', 'intensity'], 20], 'rgba(34, 197, 94, 0.6)',
                            ['<', ['get', 'intensity'], 40], 'rgba(234, 179, 8, 0.6)',
                            ['<', ['get', 'intensity'], 60], 'rgba(249, 115, 22, 0.7)',
                            ['<', ['get', 'intensity'], 80], 'rgba(239, 68, 68, 0.8)',
                            'rgba(220, 38, 38, 0.9)'
                        ],
                        'fill-opacity': 1
                    }
                });

                map.addLayer({
                    id: 'oktoberfest-tiles-outline',
                    type: 'line',
                    source: 'oktoberfest-tiles',
                    paint: {
                        'line-color': '#1d4ed8',
                        'line-width': 1,
                        'line-opacity': 0.5
                    }
                });
                log('Tiles added');
                
                // Fetch initial data
                fetchTileData();
            }
        }

        map.on('load', function() {
            log('Map loaded');
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage('mapLoaded');
            }
        });

        // Re-add tiles whenever style data loads or changes
        map.on('styledata', function() {
            addTiles();
        });

        // Poll API every 5 seconds for updates
        setInterval(fetchTileData, 5000);

        // Listen for messages from React Native
        window.addEventListener('message', handleMessage);
        document.addEventListener('message', handleMessage);

        function handleMessage(event) {
            try {
                log('Received message: ' + JSON.stringify(event.data));
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data.type === 'setStyle') {
                    log('Setting style to: ' + data.style);
                    map.setStyle(data.style);
                } else if (data.type === 'flyTo') {
                    log('Flying to: ' + data.center);
                    map.flyTo({
                        center: data.center,
                        zoom: data.zoom,
                        essential: true
                    });
                }
            } catch (e) {
                log('Error handling message: ' + e.toString());
            }
        }
      </script>
    </body>
    </html>
  `;

    return (
        <View style={[styles.container, style]}>
            <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: htmlContent }}
                style={styles.webview}
                scrollEnabled={false}
                onMessage={handleWebViewMessage}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    webview: {
        flex: 1,
    },
});
