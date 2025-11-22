import React, {
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import oktoberfestTiles from "../data/oktoberfest_tiles.json";

interface MapboxWebViewProps {
    accessToken: string;
    style?: any;
    initialCenter?: [number, number];
    initialZoom?: number;
    colorScheme?: 'light' | 'dark' | null | undefined;
    onTilePress?: (tile: { tileId: string; row: number; col: number }) => void;
    onMarkerPress?: (markerId: string) => void;
    tileInteractionsEnabled?: boolean;
}

export interface MapboxWebViewRef {
    flyTo: (center: [number, number], zoom?: number) => void;
    updateTileData: (tiles: Record<string, number>) => void;
    addMarkers: (markers: any[]) => void;
    highlightMarker: (markerId: string) => void;
}

export const MapboxWebView = forwardRef<MapboxWebViewRef, MapboxWebViewProps>(({
    accessToken,
    style,
    initialCenter = [-74.5, 40],
    initialZoom = 9,
    colorScheme = 'light',
    onTilePress,
    onMarkerPress,
    tileInteractionsEnabled = true
}, ref) => {
    const webViewRef = useRef<WebView>(null);
    const mapStyle =
      colorScheme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/streets-v12";
    const API_BASE_URL =
      process.env.API_BASE_URL || "https://wiesnflow.onrender.com";

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
        },
        addMarkers: (markers) => {
            webViewRef.current?.postMessage(JSON.stringify({
                type: 'addMarkers',
                markers
            }));
        },
        highlightMarker: (markerId) => {
            webViewRef.current?.postMessage(JSON.stringify({
                type: 'highlightMarker',
                markerId
            }));
        }
    }));

    useEffect(() => {
      if (webViewRef.current) {
        webViewRef.current.postMessage(
          JSON.stringify({
            type: "setStyle",
            style: mapStyle,
          })
        );
      }
    }, [mapStyle]);

    useEffect(() => {
        webViewRef.current?.postMessage(JSON.stringify({
            type: 'setTileInteractions',
            enabled: tileInteractionsEnabled
        }));
    }, [tileInteractionsEnabled]);

    const handleWebViewMessage = (event: any) => {
        try {
            const raw = event.nativeEvent.data;
            if (raw === 'mapLoaded') {
                webViewRef.current?.postMessage(JSON.stringify({
                    type: 'setStyle',
                    style: mapStyle
                }));
            } else if (typeof raw === 'string' && raw.startsWith('log:')) {
                console.log('MapboxWebView Log:', raw);
            } else if (typeof raw === 'string') {
                try {
                    const message = JSON.parse(raw);
                    if (message.type === 'tilePress' && message.tile && onTilePress) {
                        onTilePress(message.tile);
                    } else if (message.type === 'markerPress' && message.markerId && onMarkerPress) {
                        onMarkerPress(message.markerId);
                    }
                } catch (parseError) {
                    console.error('Error parsing WebView message', parseError);
                }
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
        const API_BASE_URL = '${API_BASE_URL}';
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
                const url = API_BASE_URL + '/map';
                log('Fetching tile data from: ' + url);
                const response = await fetch(url);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    log('API response not OK: ' + response.status + ' - ' + errorText);
                    return;
                }
                
                const data = await response.json();
                log('Successfully fetched tile data');
                
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
                log('Error details: ' + JSON.stringify({
                    message: error?.message,
                    name: error?.name,
                    stack: error?.stack
                }));
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
                
                // 3. Heatmap Layer
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

                // 4. Polygon Fill Layer for interaction (tap targets)
                map.addLayer({
                    id: 'oktoberfest-tiles-fill',
                    type: 'fill',
                    source: 'oktoberfest-tiles',
                    paint: {
                        'fill-color': [
                            'interpolate',
                            ['linear'],
                            ['coalesce', ['feature-state', 'density'], 0],
                            0, 'rgba(59, 130, 246, 0.3)',   // very low / no data
                            20, 'rgba(34, 197, 94, 0.6)',   // low
                            40, 'rgba(234, 179, 8, 0.6)',   // medium
                            60, 'rgba(249, 115, 22, 0.7)',  // medium-high
                            80, 'rgba(239, 68, 68, 0.8)',   // high
                            100, 'rgba(220, 38, 38, 0.9)'   // very high
                        ],
                        'fill-opacity': 0
                    }
                });

                map.on('click', 'oktoberfest-tiles-fill', function(e) {
                    if (!tileInteractionsEnabled) return;
                    try {
                        const feature = e.features && e.features[0];
                        if (!feature) {
                            return;
                        }
                        const props = feature.properties || {};
                        const tileId = props.tileId || feature.id;
                        const row = props.row;
                        const col = props.col;
                        if (window.ReactNativeWebView && tileId !== undefined && tileId !== null) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'tilePress',
                                tile: { tileId, row, col }
                            }));
                        }
                    } catch (err) {
                        log('Error handling tile click: ' + err.toString());
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

        let tileInteractionsEnabled = true;

        function updateMarkers(markers) {
            const features = markers.map(m => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [m.long || m.longitude, m.lat || m.latitude] 
                },
                properties: {
                    title: m.tent_name || m.name,
                    description: 'Score: ' + (m.score ? m.score.toFixed(2) : 'N/A'),
                    type: m.type
                }
            }));
            
            const geojson = {
                type: 'FeatureCollection',
                features: features
            };
            
            if (map.getSource('recommendation-markers')) {
                map.getSource('recommendation-markers').setData(geojson);
            } else {
                map.addSource('recommendation-markers', {
                    type: 'geojson',
                    data: geojson
                });
                
                map.addLayer({
                    id: 'recommendation-markers-circles',
                    type: 'circle',
                    source: 'recommendation-markers',
                    paint: {
                        'circle-radius': 8,
                        'circle-radius-transition': { duration: 300 },
                        'circle-color': '#ffffff',
                        'circle-color-transition': { duration: 300 },
                        'circle-stroke-width': 3,
                        'circle-stroke-width-transition': { duration: 300 },
                        'circle-stroke-color': '#16a34a'
                    }
                });

                map.on('click', 'recommendation-markers-circles', (e) => {
                    if (e.features && e.features.length > 0) {
                         const id = e.features[0].properties.title;
                         if (window.ReactNativeWebView) {
                             window.ReactNativeWebView.postMessage(JSON.stringify({
                                 type: 'markerPress',
                                 markerId: id
                             }));
                         }
                    }
                });
                
                map.on('mouseenter', 'recommendation-markers-circles', () => {
                    map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', 'recommendation-markers-circles', () => {
                    map.getCanvas().style.cursor = '';
                });
            }
        }

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
                } else if (data.type === 'addMarkers') {
                    log('Adding markers: ' + data.markers.length);
                    updateMarkers(data.markers);
                } else if (data.type === 'highlightMarker') {
                    const id = data.markerId;
                    if (map.getLayer('recommendation-markers-circles')) {
                         map.setPaintProperty('recommendation-markers-circles', 'circle-color', '#ffffff');
                         map.setPaintProperty('recommendation-markers-circles', 'circle-radius', [
                            'case',
                            ['==', ['get', 'title'], id],
                            12, 
                            6
                        ]);
                         map.setPaintProperty('recommendation-markers-circles', 'circle-stroke-width', [
                            'case',
                            ['==', ['get', 'title'], id],
                            4, 
                            2
                        ]);
                    }
                } else if (data.type === 'setTileInteractions') {
                    tileInteractionsEnabled = data.enabled;
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
          originWhitelist={["*"]}
          source={{ html: htmlContent }}
          style={styles.webview}
          scrollEnabled={false}
          onMessage={handleWebViewMessage}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
  },
});
