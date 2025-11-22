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
  colorScheme?: "light" | "dark" | null | undefined;
  onTilePress?: (tile: { tileId: string; row: number; col: number }) => void;
  onMarkerPress?: (markerId: string) => void;
  onFriendMarkerPress?: (friendId: string) => void;
  onMapLongPress?: (coords: { longitude: number; latitude: number }) => void;
  tileInteractionsEnabled?: boolean;
}

export interface MapboxWebViewRef {
  flyTo: (center: [number, number], zoom?: number) => void;
  updateTileData: (tiles: Record<string, number>) => void;
  addMarkers: (markers: any[]) => void;
  addFriendMarkers: (friends: any[]) => void;
  updateMyPosition: (position: { longitude: number; latitude: number; name: string } | null) => void;
  highlightMarker: (markerId: string) => void;
  showAssembleMarkers: (centerPoint: { longitude: number; latitude: number }, finalPoint: { longitude: number; latitude: number }) => void;
  hideAssembleMarkers: () => void;
  showRoute: (origin: { longitude: number; latitude: number }, destination: { longitude: number; latitude: number }) => void;
  hideRoute: () => void;
}

export const MapboxWebView = forwardRef<MapboxWebViewRef, MapboxWebViewProps>(
  (
    {
      accessToken,
      style,
      initialCenter = [-74.5, 40],
      initialZoom = 9,
      colorScheme = "light",
      onTilePress,
      onMarkerPress,
      onFriendMarkerPress,
      onMapLongPress,
      tileInteractionsEnabled = true,
    },
    ref
  ) => {
    const webViewRef = useRef<WebView>(null);
    const mapStyle =
      colorScheme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/streets-v12";
    const API_BASE_URL =
      process.env.API_BASE_URL || "https://wiesnflow.onrender.com";

    useImperativeHandle(ref, () => ({
      flyTo: (center, zoom) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "flyTo",
            center,
            zoom: zoom ?? initialZoom,
          })
        );
      },
      updateTileData: (tiles) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "updateTileData",
            tiles,
          })
        );
      },
      addMarkers: (markers) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "addMarkers",
            markers,
          })
        );
      },
      highlightMarker: (markerId) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "highlightMarker",
            markerId,
          })
        );
      },
      addFriendMarkers: (friends) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "addFriendMarkers",
            friends,
          })
        );
      },
      updateMyPosition: (position) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "updateMyPosition",
            position,
          })
        );
      },
      showAssembleMarkers: (centerPoint, finalPoint) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "showAssembleMarkers",
            centerPoint,
            finalPoint,
          })
        );
      },
      hideAssembleMarkers: () => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "hideAssembleMarkers",
          })
        );
      },
      showRoute: (origin, destination) => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "showRoute",
            origin,
            destination,
          })
        );
      },
      hideRoute: () => {
        webViewRef.current?.postMessage(
          JSON.stringify({
            type: "hideRoute",
          })
        );
      },
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
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: "setTileInteractions",
          enabled: tileInteractionsEnabled,
        })
      );
    }, [tileInteractionsEnabled]);

    const handleWebViewMessage = (event: any) => {
      try {
        const raw = event.nativeEvent.data;
        if (raw === "mapLoaded") {
          webViewRef.current?.postMessage(
            JSON.stringify({
              type: "setStyle",
              style: mapStyle,
            })
          );
        } else if (typeof raw === "string" && raw.startsWith("log:")) {
          console.log("MapboxWebView Log:", raw);
        } else if (typeof raw === "string") {
          try {
            const message = JSON.parse(raw);
            if (message.type === "tilePress" && message.tile && onTilePress) {
              onTilePress(message.tile);
            } else if (
              message.type === "markerPress" &&
              message.markerId &&
              onMarkerPress
            ) {
              onMarkerPress(message.markerId);
            } else if (
              message.type === "friendMarkerPress" &&
              message.friendId &&
              onFriendMarkerPress
            ) {
              onFriendMarkerPress(message.friendId);
            } else if (
              message.type === "mapLongPress" &&
              message.coords &&
              onMapLongPress
            ) {
              onMapLongPress(message.coords);
            }
          } catch (parseError) {
            console.error("Error parsing WebView message", parseError);
          }
        }
      } catch (e) {
        console.error("Error handling WebView message", e);
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
        
        // Long press detection for position override
        let longPressTimeout = null;
        let longPressCoords = null;
        
        map.on('mousedown', function(e) {
            longPressCoords = e.lngLat;
            longPressTimeout = setTimeout(() => {
                if (longPressCoords && window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'mapLongPress',
                        coords: {
                            longitude: longPressCoords.lng,
                            latitude: longPressCoords.lat
                        }
                    }));
                    log('Long press detected at: ' + longPressCoords.lng + ', ' + longPressCoords.lat);
                }
            }, 800); // 800ms for long press
        });
        
        map.on('mouseup', function() {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
            longPressCoords = null;
        });
        
        map.on('mousemove', function() {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
        });
        
        // Touch events for mobile
        map.on('touchstart', function(e) {
            if (e.originalEvent.touches.length === 1) {
                longPressCoords = e.lngLat;
                longPressTimeout = setTimeout(() => {
                    if (longPressCoords && window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'mapLongPress',
                            coords: {
                                longitude: longPressCoords.lng,
                                latitude: longPressCoords.lat
                            }
                        }));
                        log('Long press detected at: ' + longPressCoords.lng + ', ' + longPressCoords.lat);
                    }
                }, 800);
            }
        });
        
        map.on('touchend', function() {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
            }
            longPressCoords = null;
        });
        
        map.on('touchmove', function() {
            if (longPressTimeout) {
                clearTimeout(longPressTimeout);
                longPressTimeout = null;
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

        function updateFriendMarkers(friends) {
            if (!friends || friends.length === 0) {
                // Clear friend markers
                if (map.getSource('friend-markers')) {
                    map.getSource('friend-markers').setData({
                        type: 'FeatureCollection',
                        features: []
                    });
                }
                return;
            }
            
            // Process friends
            const features = friends.map(f => {
                const lng = parseFloat(f.longitude);
                const lat = parseFloat(f.latitude);
                
                // Validate coordinates
                if (isNaN(lng) || isNaN(lat)) {
                    log('Invalid coordinates for friend: ' + f.user_id);
                    return null;
                }
                
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    properties: {
                        userId: f.user_id,
                        name: f.name || 'Friend'
                    }
                };
            }).filter(f => f !== null);
            
            const geojson = {
                type: 'FeatureCollection',
                features: features
            };
            
            // Add or update source and layers
            if (!map.getSource('friend-markers')) {
                // Add source
                map.addSource('friend-markers', {
                    type: 'geojson',
                    data: geojson
                });
                
                // Add ping animation layer (outer ring)
                map.addLayer({
                    id: 'friend-markers-ping',
                    type: 'circle',
                    source: 'friend-markers',
                    paint: {
                        'circle-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 8,
                            16, 20
                        ],
                        'circle-color': '#3b82f6',
                        'circle-opacity': 0,
                        'circle-stroke-width': 0,
                        'circle-stroke-opacity': 0
                    }
                });
                
                // Add main circle layer
                map.addLayer({
                    id: 'friend-markers-circle',
                    type: 'circle',
                    source: 'friend-markers',
                    paint: {
                        'circle-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 6,
                            16, 14
                        ],
                        'circle-color': '#3b82f6',
                        'circle-stroke-width': 3,
                        'circle-stroke-color': '#ffffff',
                        'circle-opacity': 1
                    }
                });
                
                // Add text label layer with first letter of name
                map.addLayer({
                    id: 'friend-markers-label',
                    type: 'symbol',
                    source: 'friend-markers',
                    layout: {
                        'text-field': ['upcase', ['slice', ['get', 'name'], 0, 1]],
                        'text-size': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 10,
                            16, 16
                        ],
                        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                        'text-allow-overlap': true,
                        'text-ignore-placement': true
                    },
                    paint: {
                        'text-color': '#ffffff'
                    }
                });
                
                // Add click handler for friend markers (both circle and label)
                const handleFriendClick = (e) => {
                    if (e.features && e.features.length > 0) {
                        const userId = e.features[0].properties.userId;
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'friendMarkerPress',
                                friendId: userId
                            }));
                        }
                    }
                };
                
                map.on('click', 'friend-markers-circle', handleFriendClick);
                map.on('click', 'friend-markers-label', handleFriendClick);
                
                // Change cursor on hover (both circle and label)
                map.on('mouseenter', 'friend-markers-circle', () => {
                    map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', 'friend-markers-circle', () => {
                    map.getCanvas().style.cursor = '';
                });
                map.on('mouseenter', 'friend-markers-label', () => {
                    map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', 'friend-markers-label', () => {
                    map.getCanvas().style.cursor = '';
                });
                
                // Start ping animation
                animateFriendPing();
            } else {
                // Update existing source
                map.getSource('friend-markers').setData(geojson);
            }
        }
        
        // Animate the ping effect
        let pingAnimationId = null;
        function animateFriendPing() {
            if (pingAnimationId) {
                cancelAnimationFrame(pingAnimationId);
            }
            
            let start = null;
            const duration = 2000; // 2 second cycle
            
            function animate(timestamp) {
                if (!start) start = timestamp;
                const elapsed = timestamp - start;
                const progress = (elapsed % duration) / duration;
                
                if (map.getLayer('friend-markers-ping')) {
                    // Scale from 1 to 2.5
                    const scale = 1 + (progress * 1.5);
                    // Fade from 0.6 to 0
                    const opacity = progress < 0.75 ? (0.6 * (1 - progress / 0.75)) : 0;
                    
                    map.setPaintProperty('friend-markers-ping', 'circle-radius', [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, 8 * scale,
                        16, 20 * scale
                    ]);
                    map.setPaintProperty('friend-markers-ping', 'circle-opacity', opacity);
                }
                
                // Also animate my position ping
                if (map.getLayer('my-position-ping')) {
                    const scale = 1 + (progress * 1.5);
                    const opacity = progress < 0.75 ? (0.6 * (1 - progress / 0.75)) : 0;
                    
                    map.setPaintProperty('my-position-ping', 'circle-radius', [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        10, 8 * scale,
                        16, 20 * scale
                    ]);
                    map.setPaintProperty('my-position-ping', 'circle-opacity', opacity);
                }
                
                pingAnimationId = requestAnimationFrame(animate);
            }
            
            pingAnimationId = requestAnimationFrame(animate);
        }
        
        function updateMyPositionMarker(position) {
            if (!position) {
                // Clear my position marker
                if (map.getSource('my-position-marker')) {
                    map.getSource('my-position-marker').setData({
                        type: 'FeatureCollection',
                        features: []
                    });
                }
                return;
            }
            
            const lng = parseFloat(position.longitude);
            const lat = parseFloat(position.latitude);
            
            // Validate coordinates
            if (isNaN(lng) || isNaN(lat)) {
                log('Invalid coordinates for my position');
                return;
            }
            
            const geojson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    properties: {
                        name: position.name || 'Me'
                    }
                }]
            };
            
            // Add or update source and layers
            if (!map.getSource('my-position-marker')) {
                // Add source
                map.addSource('my-position-marker', {
                    type: 'geojson',
                    data: geojson
                });
                
                // Add ping animation layer (outer ring) - GREEN
                map.addLayer({
                    id: 'my-position-ping',
                    type: 'circle',
                    source: 'my-position-marker',
                    paint: {
                        'circle-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 8,
                            16, 20
                        ],
                        'circle-color': '#22c55e',
                        'circle-opacity': 0,
                        'circle-stroke-width': 0,
                        'circle-stroke-opacity': 0
                    }
                });
                
                // Add main circle layer - GREEN
                map.addLayer({
                    id: 'my-position-circle',
                    type: 'circle',
                    source: 'my-position-marker',
                    paint: {
                        'circle-radius': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 6,
                            16, 14
                        ],
                        'circle-color': '#22c55e',
                        'circle-stroke-width': 3,
                        'circle-stroke-color': '#ffffff',
                        'circle-opacity': 1
                    }
                });
                
                // Add text label layer with first letter of name
                map.addLayer({
                    id: 'my-position-label',
                    type: 'symbol',
                    source: 'my-position-marker',
                    layout: {
                        'text-field': ['upcase', ['slice', ['get', 'name'], 0, 1]],
                        'text-size': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 10,
                            16, 16
                        ],
                        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                        'text-allow-overlap': true,
                        'text-ignore-placement': true
                    },
                    paint: {
                        'text-color': '#ffffff'
                    }
                });
                
                // Start ping animation if not already running
                if (!pingAnimationId) {
                    animateFriendPing();
                }
            } else {
                // Update existing source
                map.getSource('my-position-marker').setData(geojson);
            }
        }

        function showAssembleMarkers(centerPoint, finalPoint) {
            // Add sources and layers for assemble markers
            // 1. Center point (light red smaller circle)
            const centerGeojson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [centerPoint.longitude, centerPoint.latitude]
                    },
                    properties: {}
                }]
            };
            
            // 2. Final point (bigger redder target marker)
            const finalGeojson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [finalPoint.longitude, finalPoint.latitude]
                    },
                    properties: {}
                }]
            };
            
            // 3. Arrow line from center to final
            const arrowGeojson = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [
                            [centerPoint.longitude, centerPoint.latitude],
                            [finalPoint.longitude, finalPoint.latitude]
                        ]
                    },
                    properties: {}
                }]
            };
            
            // Add or update center point
            if (!map.getSource('assemble-center')) {
                map.addSource('assemble-center', {
                    type: 'geojson',
                    data: centerGeojson
                });
                
                map.addLayer({
                    id: 'assemble-center-circle',
                    type: 'circle',
                    source: 'assemble-center',
                    paint: {
                        'circle-radius': 10,
                        'circle-color': '#fca5a5',
                        'circle-opacity': 0.7,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ef4444'
                    }
                });
            } else {
                map.getSource('assemble-center').setData(centerGeojson);
            }
            
            // Add or update final point
            if (!map.getSource('assemble-final')) {
                map.addSource('assemble-final', {
                    type: 'geojson',
                    data: finalGeojson
                });
                
                // Outer glow
                map.addLayer({
                    id: 'assemble-final-glow',
                    type: 'circle',
                    source: 'assemble-final',
                    paint: {
                        'circle-radius': 20,
                        'circle-color': '#dc2626',
                        'circle-opacity': 0.3
                    }
                });
                
                // Main circle
                map.addLayer({
                    id: 'assemble-final-circle',
                    type: 'circle',
                    source: 'assemble-final',
                    paint: {
                        'circle-radius': 15,
                        'circle-color': '#dc2626',
                        'circle-opacity': 0.9,
                        'circle-stroke-width': 3,
                        'circle-stroke-color': '#ffffff'
                    }
                });
            } else {
                map.getSource('assemble-final').setData(finalGeojson);
            }
            
            // Add or update arrow line
            if (!map.getSource('assemble-arrow')) {
                map.addSource('assemble-arrow', {
                    type: 'geojson',
                    data: arrowGeojson
                });
                
                map.addLayer({
                    id: 'assemble-arrow-line',
                    type: 'line',
                    source: 'assemble-arrow',
                    paint: {
                        'line-color': '#dc2626',
                        'line-width': 3,
                        'line-opacity': 0.6
                    }
                });
            } else {
                map.getSource('assemble-arrow').setData(arrowGeojson);
            }
        }
        
        function hideAssembleMarkers() {
            // Remove sources and layers
            if (map.getLayer('assemble-center-circle')) {
                map.removeLayer('assemble-center-circle');
            }
            if (map.getSource('assemble-center')) {
                map.removeSource('assemble-center');
            }
            
            if (map.getLayer('assemble-final-glow')) {
                map.removeLayer('assemble-final-glow');
            }
            if (map.getLayer('assemble-final-circle')) {
                map.removeLayer('assemble-final-circle');
            }
            if (map.getSource('assemble-final')) {
                map.removeSource('assemble-final');
            }
            
            if (map.getLayer('assemble-arrow-line')) {
                map.removeLayer('assemble-arrow-line');
            }
            if (map.getSource('assemble-arrow')) {
                map.removeSource('assemble-arrow');
            }
        }
        
        async function showRoute(origin, destination) {
            try {
                // Call Mapbox Directions API to get walking route
                const url = 'https://api.mapbox.com/directions/v5/mapbox/walking/' + 
                    origin.longitude + ',' + origin.latitude + ';' +
                    destination.longitude + ',' + destination.latitude +
                    '?geometries=geojson&access_token=' + mapboxgl.accessToken;
                
                log('Fetching route from: ' + url);
                const response = await fetch(url);
                
                if (!response.ok) {
                    log('Error fetching route: ' + response.status);
                    return;
                }
                
                const data = await response.json();
                log('Route data received: ' + JSON.stringify(data));
                
                if (!data.routes || data.routes.length === 0) {
                    log('No routes found');
                    return;
                }
                
                const route = data.routes[0];
                const routeGeometry = route.geometry;
                
                // Create GeoJSON for the route
                const routeGeojson = {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: routeGeometry,
                        properties: {}
                    }]
                };
                
                // Add or update route source
                if (!map.getSource('navigation-route')) {
                    map.addSource('navigation-route', {
                        type: 'geojson',
                        data: routeGeojson
                    });
                    
                    // Add route line layer (background/casing)
                    map.addLayer({
                        id: 'navigation-route-casing',
                        type: 'line',
                        source: 'navigation-route',
                        paint: {
                            'line-color': '#1e3a8a',
                            'line-width': 10,
                            'line-opacity': 0.4
                        }
                    });
                    
                    // Add route line layer (main line)
                    map.addLayer({
                        id: 'navigation-route-line',
                        type: 'line',
                        source: 'navigation-route',
                        paint: {
                            'line-color': '#3b82f6',
                            'line-width': 6,
                            'line-opacity': 0.9
                        }
                    });
                } else {
                    map.getSource('navigation-route').setData(routeGeojson);
                }
                
                // Fit the map to show the entire route
                const coordinates = routeGeometry.coordinates;
                const bounds = coordinates.reduce(function(bounds, coord) {
                    return bounds.extend(coord);
                }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
                
                map.fitBounds(bounds, {
                    padding: { top: 100, bottom: 100, left: 50, right: 50 },
                    duration: 1000
                });
                
                log('Route displayed successfully');
            } catch (error) {
                log('Error showing route: ' + error.toString());
            }
        }
        
        function hideRoute() {
            // Remove route layers and source
            if (map.getLayer('navigation-route-line')) {
                map.removeLayer('navigation-route-line');
            }
            if (map.getLayer('navigation-route-casing')) {
                map.removeLayer('navigation-route-casing');
            }
            if (map.getSource('navigation-route')) {
                map.removeSource('navigation-route');
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
                } else if (data.type === 'addFriendMarkers') {
                    log('Adding friend markers: ' + data.friends.length);
                    updateFriendMarkers(data.friends);
                } else if (data.type === 'updateMyPosition') {
                    log('Updating my position: ' + JSON.stringify(data.position));
                    updateMyPositionMarker(data.position);
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
                } else if (data.type === 'showAssembleMarkers') {
                    log('Showing assemble markers');
                    showAssembleMarkers(data.centerPoint, data.finalPoint);
                } else if (data.type === 'hideAssembleMarkers') {
                    log('Hiding assemble markers');
                    hideAssembleMarkers();
                } else if (data.type === 'showRoute') {
                    log('Showing route');
                    showRoute(data.origin, data.destination);
                } else if (data.type === 'hideRoute') {
                    log('Hiding route');
                    hideRoute();
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
