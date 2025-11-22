import React, { useRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface MapboxWebViewProps {
    accessToken: string;
    style?: any;
    initialCenter?: [number, number];
    initialZoom?: number;
    colorScheme?: 'light' | 'dark' | null | undefined;
}

export const MapboxWebView: React.FC<MapboxWebViewProps> = ({
    accessToken,
    style,
    initialCenter = [-74.5, 40],
    initialZoom = 9,
    colorScheme = 'light'
}) => {
    const webViewRef = useRef<WebView>(null);
    const mapStyle = colorScheme === 'dark' 
        ? 'mapbox://styles/mapbox/dark-v11' 
        : 'mapbox://styles/mapbox/streets-v12';

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
            if (data === 'mapLoaded') {
                // Send initial style when map reports loaded
                webViewRef.current?.postMessage(JSON.stringify({
                    type: 'setStyle',
                    style: mapStyle
                }));
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
        mapboxgl.accessToken = '${accessToken}';
        const map = new mapboxgl.Map({
          container: 'map',
          style: '${mapStyle}',
          center: [${initialCenter[0]}, ${initialCenter[1]}],
          zoom: ${initialZoom}
        });

        map.on('load', function() {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage('mapLoaded');
            }
        });

        // Listen for messages from React Native
        // iOS
        window.addEventListener('message', handleMessage);
        // Android
        document.addEventListener('message', handleMessage);

        function handleMessage(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'setStyle') {
                    map.setStyle(data.style);
                }
            } catch (e) {
                // console.error('Error handling message', e);
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
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    webview: {
        flex: 1,
    },
});
