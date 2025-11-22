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

        mapboxgl.accessToken = '${accessToken}';
        const map = new mapboxgl.Map({
          container: 'map',
          style: '${mapStyle}',
          style: '${mapStyle}',
          center: [${initialCenter[0]}, ${initialCenter[1]}],
          zoom: ${initialZoom}
        });

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
                        'fill-color': '#2563eb',
                        'fill-opacity': 0.4
                    }
                });

                map.addLayer({
                    id: 'oktoberfest-tiles-outline',
                    type: 'line',
                    source: 'oktoberfest-tiles',
                    paint: {
                        'line-color': '#1d4ed8',
                        'line-width': 1
                    }
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
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html: htmlContent }}
                style={styles.webview}
                scrollEnabled={false}
                onMessage={handleWebViewMessage}
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
