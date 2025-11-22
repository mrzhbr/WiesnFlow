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
    updateTileData: (tiles: Record<string, number>) => void;
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
        },
        updateTileData: (tiles) => {
            webViewRef.current?.postMessage(JSON.stringify({
                type: 'updateTileData',
                tiles
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
        .mapboxgl-popup-content {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
            padding: 12px;
            color: #333;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .mapboxgl-popup-tip {
            border-top-color: white !important;
        }
        .popup-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 4px;
            opacity: 0.8;
        }
        .popup-count {
            font-size: 24px;
            font-weight: 700;
            background: linear-gradient(135deg, #2563eb, #9333ea);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .popup-label {
            font-size: 12px;
            color: #6b7280;
            font-weight: 500;
        }
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
        
        // Generate centroids for heatmap
        const pointsFeatures = tilesGeoJSON.features.map(feature => {
            // Simple centroid calculation for rects
            const coords = feature.geometry.coordinates[0];
            const lons = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const centerLon = (minLon + maxLon) / 2;
            const centerLat = (minLat + maxLat) / 2;
            
            return {
                type: 'Feature',
                id: feature.properties.tileId, // Same ID for state sync
                properties: feature.properties,
                geometry: {
                    type: 'Point',
                    coordinates: [centerLon, centerLat]
                }
            };
        });
        
        const pointsGeoJSON = {
            type: 'FeatureCollection',
            features: pointsFeatures
        };

        mapboxgl.accessToken = '${accessToken}';
        const map = new mapboxgl.Map({
          container: 'map',
          style: '${mapStyle}',
          center: [${initialCenter[0]}, ${initialCenter[1]}],
          zoom: ${initialZoom}
        });

        function addTiles() {
            if (!map.getSource('oktoberfest-tiles')) {
                // 1. Polygon Source for Interaction
                map.addSource('oktoberfest-tiles', {
                    type: 'geojson',
                    data: tilesGeoJSON,
                    promoteId: 'tileId'
                });
                
                // 2. Point Source for Heatmap
                map.addSource('oktoberfest-points', {
                    type: 'geojson',
                    data: pointsGeoJSON,
                    promoteId: 'tileId'
                });
                
                // 3. Invisible Fill Layer for Clicks
                map.addLayer({
                    id: 'oktoberfest-tiles-fill',
                    type: 'fill',
                    source: 'oktoberfest-tiles',
                    paint: {
                        'fill-color': '#000000',
                        'fill-opacity': 0 // Invisible
                    }
                });

                // 4. Heatmap Layer
                map.addLayer({
                    id: 'oktoberfest-heatmap',
                    type: 'heatmap',
                    source: 'oktoberfest-points',
                    maxzoom: 16,
                    paint: {
                        // Increase the heatmap weight based on density state
                        'heatmap-weight': [
                            'interpolate',
                            ['linear'],
                            ['coalesce', ['feature-state', 'density'], 0],
                            0, 0,
                            1, 0.2,
                            10, 1
                        ],
                        // Heatmap intensity multiplier
                        'heatmap-intensity': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            12, 1,
                            16, 3
                        ],
                        // Color ramp from transparent to green to yellow to red
                        'heatmap-color': [
                            'interpolate',
                            ['linear'],
                            ['heatmap-density'],
                            0, 'rgba(33,102,172,0)',
                            0.2, 'rgb(103,169,207)',
                            0.4, '#22c55e', // Green
                            0.6, '#eab308', // Yellow
                            0.8, '#ef4444', // Red
                            1, '#b91c1c'   // Dark Red
                        ],
                        // Adjust radius by zoom level
                        'heatmap-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            12, 20,
                            16, 50 
                        ],
                        'heatmap-opacity': 0.7
                    }
                });
                
            // Add click listener for popups (still on the fill layer)
            map.on('click', 'oktoberfest-tiles-fill', (e) => {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const id = feature.id || feature.properties.tileId; // Try both
                    const state = map.getFeatureState({ source: 'oktoberfest-tiles', id: id });
                    const count = state.density || 0;
                    
                    new mapboxgl.Popup({
                        closeButton: false,
                        maxWidth: '300px',
                        className: 'glassy-popup'
                    })
                    .setLngLat(e.lngLat)
                    .setHTML('<div class="popup-content"><div class="popup-title">Crowd Density</div><div class="popup-count">' + count + '</div><div class="popup-label">People in this area</div></div>')
                    .addTo(map);
                }
            });
            
            // Change cursor on hover
                map.on('mouseenter', 'oktoberfest-tiles-fill', () => {
                    map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', 'oktoberfest-tiles-fill', () => {
                    map.getCanvas().style.cursor = '';
                });

                log('Tiles added');
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
            // log('Style data loaded'); // This can be spammy
            addTiles();
        });

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
                } else if (data.type === 'updateTileData') {
                    log('Updating tile data with ' + Object.keys(data.tiles).length + ' entries');
                    const incomingTiles = data.tiles;
                    
                    // Iterate over all features in the source to ensure we update everything (including resetting to 0)
                    if (tilesGeoJSON && tilesGeoJSON.features) {
                         log('Processing ' + tilesGeoJSON.features.length + ' features');
                         tilesGeoJSON.features.forEach(feature => {
                             // Use the promoted ID (tileId)
                             const id = feature.properties.tileId;
                             if (id) {
                                 const count = incomingTiles[id] || 0;
                                 
                                 // Update state for BOTH polygon source (for interactions) and point source (for heatmap)
                                 map.setFeatureState(
                                     { source: 'oktoberfest-tiles', id: id },
                                     { density: count }
                                 );
                                 
                                 map.setFeatureState(
                                     { source: 'oktoberfest-points', id: id },
                                     { density: count }
                                 );
                             }
                         });
                    }
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
