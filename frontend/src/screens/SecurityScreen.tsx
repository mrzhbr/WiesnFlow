import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, useColorScheme, Text, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MapboxWebView, MapboxWebViewRef, Marker, RouteIndicator } from '../components/MapboxWebView';
import oktoberfestTiles from '../data/oktoberfest_tiles.json';
import wiesnLocations from '../data/wiesn_locations.json';
import { API_BASE_URL } from '../config';
import { useSecurityMode } from '../contexts/SecurityModeContext';

const INITIAL_CENTER: [number, number] = [11.5492349, 48.1313557];
const INITIAL_ZOOM = 14;

export const SecurityScreen = () => {
    const colorScheme = useColorScheme();
    const mapRef = useRef<MapboxWebViewRef>(null);
    const [tileData, setTileData] = useState<Record<string, number>>({});
    const { isSecurityMode } = useSecurityMode();
    const [showSecurityPersonnel, setShowSecurityPersonnel] = useState(true);
    
    // Combine all markers from entrances and U-Bahn stations
    const markers: Marker[] = useMemo(
        () => [
            ...wiesnLocations.entrances as Marker[],
            ...wiesnLocations.ubahn_stations as Marker[]
        ],
        []
    );

    // Function to check if a route is overcrowded for a given tile snapshot
    const isRouteOvercrowded = (
        tiles: Record<string, number>,
        monitoredTiles: string[],
    ): boolean => {
        return monitoredTiles.some(tileId => {
            const count = tiles[tileId] || 0;
            return count > 60;
        });
    };

    // Mock security personnel data - many small points moving slowly
    const [securityPersonnel, setSecurityPersonnel] = useState<Array<{
        id: string;
        longitude: number;
        latitude: number;
        velocityLng: number;
        velocityLat: number;
    }>>([]);

    // Initialize mock data
    useEffect(() => {
        const personnel: typeof securityPersonnel = [];

        const entrances = (wiesnLocations.entrances as any[]) || [];
        const ubahnStations = (wiesnLocations.ubahn_stations as any[]) || [];

        // 1) Around entrances (small groups)
        entrances.forEach((entrance, idx) => {
            const [lng, lat] = entrance.coordinates as [number, number];
            const groupSize = 2;
            const baseOffset = 0.00015;

            for (let i = 0; i < groupSize; i++) {
                const angle = (i * (360 / groupSize)) * (Math.PI / 180);
                const factor = 0.5 + Math.random() * 0.7;
                personnel.push({
                    id: `security-entrance-${idx}-${i}`,
                    longitude: lng + Math.cos(angle) * baseOffset * factor,
                    latitude: lat + Math.sin(angle) * baseOffset * factor,
                    velocityLng: (Math.random() - 0.5) * 0.00001,
                    velocityLat: (Math.random() - 0.5) * 0.00001,
                });
            }
        });

        // 2) Around U-Bahn stations
        ubahnStations.forEach((station, idx) => {
            const [lng, lat] = station.coordinates as [number, number];
            const groupSize = 3;
            const baseOffset = 0.00018;

            for (let i = 0; i < groupSize; i++) {
                const angle = (i * (360 / groupSize)) * (Math.PI / 180);
                const factor = 0.5 + Math.random() * 0.7;
                personnel.push({
                    id: `security-ubahn-${idx}-${i}`,
                    longitude: lng + Math.cos(angle) * baseOffset * factor,
                    latitude: lat + Math.sin(angle) * baseOffset * factor,
                    velocityLng: (Math.random() - 0.5) * 0.00001,
                    velocityLat: (Math.random() - 0.5) * 0.00001,
                });
            }
        });

        // 3) Central areas inside the Wiesn
        const centralPoints: [number, number][] = [
            [11.5492, 48.1314],
            [11.5500, 48.1310],
            [11.5488, 48.1310],
        ];

        centralPoints.forEach((center, idx) => {
            const [lng, lat] = center;
            const groupSize = 4;
            const baseOffset = 0.00012;

            for (let i = 0; i < groupSize; i++) {
                const angle = (i * (360 / groupSize)) * (Math.PI / 180);
                const factor = 0.5 + Math.random() * 0.8;
                personnel.push({
                    id: `security-center-${idx}-${i}`,
                    longitude: lng + Math.cos(angle) * baseOffset * factor,
                    latitude: lat + Math.sin(angle) * baseOffset * factor,
                    velocityLng: (Math.random() - 0.5) * 0.00001,
                    velocityLat: (Math.random() - 0.5) * 0.00001,
                });
            }
        });

        setSecurityPersonnel(personnel);
    }, []);

    // Animate security personnel
    useEffect(() => {
        if (!isSecurityMode) return;

        const interval = setInterval(() => {
            if (showSecurityPersonnel) {
                setSecurityPersonnel(prev => prev.map(person => {
                    let newLng = person.longitude + person.velocityLng;
                    let newLat = person.latitude + person.velocityLat;
                    let newVelLng = person.velocityLng;
                    let newVelLat = person.velocityLat;

                    // Bounce off boundaries of the Oktoberfest area
                    if (newLng < 11.547 || newLng > 11.552) newVelLng *= -1;
                    if (newLat < 48.130 || newLat > 48.133) newVelLat *= -1;

                    return {
                        ...person,
                        longitude: newLng,
                        latitude: newLat,
                        velocityLng: newVelLng,
                        velocityLat: newVelLat,
                    };
                }));
            }
        }, 2000); // Update every 2 seconds for slow movement

        return () => clearInterval(interval);
    }, [isSecurityMode, showSecurityPersonnel]);

    const fetchMapData = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/map`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            
            if (data.tiles) {
                const tiles: Record<string, number> = data.tiles;

                // Update local tile state and map tiles
                setTileData(tiles);
                mapRef.current?.updateTileData(tiles);

                const ubahnStations = wiesnLocations.ubahn_stations as any[];
                const entrances = wiesnLocations.entrances as any[];

                const theresienwiese = ubahnStations.find(
                    (s) => s.id === 'ubahn-theresienwiese'
                );
                const goetheplatz = ubahnStations.find(
                    (s) => s.id === 'ubahn-goetheplatz'
                );
                const poccistrasse = ubahnStations.find(
                    (s) => s.id === 'ubahn-poccistrasse'
                );
                const schwanthalerhoehe = ubahnStations.find(
                    (s) => s.id === 'ubahn-schwanthalerhöhe'
                );

                const northEntrance = entrances.find(
                    (e) => e.id === 'entrance-nord'
                );
                const mainEntrance = entrances.find(
                    (e) => e.id === 'entrance-main'
                );
                const eastEntrance = entrances.find(
                    (e) => e.id === 'entrance-east'
                );
                const northEastEntrance = entrances.find(
                    (e) => e.id === 'entrance-north-east'
                );
                const southEntrance = entrances.find(
                    (e) => e.id === 'entrance-south'
                );
                const westEntrance = entrances.find(
                    (e) => e.id === 'entrance-west'
                );
                const southWestEntrance = entrances.find(
                    (e) => e.id === 'entrance-south-west'
                );

                const directionsToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

                const fetchRoute = async (
                    from: [number, number],
                    to: [number, number]
                ): Promise<[number, number][] | undefined> => {
                    if (!directionsToken) {
                        return undefined;
                    }
                    try {
                        const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/walking/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&access_token=${directionsToken}`;
                        const dirResponse = await fetch(directionsUrl);
                        if (!dirResponse.ok) {
                            return undefined;
                        }
                        const dirData = await dirResponse.json();
                        const coords = dirData?.routes?.[0]?.geometry?.coordinates;
                        if (Array.isArray(coords)) {
                            return coords as [number, number][];
                        }
                    } catch (e) {
                        // Ignore routing errors and fall back to straight line
                    }
                    return undefined;
                };

                const indicators: RouteIndicator[] = [];

                // --- Route 1: Theresienwiese -> Nordeingang (preferred) / Haupteingang (fallback) ---
                const northTiles = ['tile_0_4', 'tile_0_5', 'tile_1_5'];
                const mainTiles = ['tile_0_3', 'tile_0_4', 'tile_1_3'];

                const northOvercrowded = isRouteOvercrowded(tiles, northTiles);
                const mainOvercrowded = isRouteOvercrowded(tiles, mainTiles);

                let theresienwieseTarget: any | null = null;
                let theresienwieseMonitored: string[] = [];

                if (!northOvercrowded && northEntrance) {
                    theresienwieseTarget = northEntrance;
                    theresienwieseMonitored = northTiles;
                } else if (northOvercrowded && !mainOvercrowded && mainEntrance) {
                    theresienwieseTarget = mainEntrance;
                    theresienwieseMonitored = mainTiles;
                }

                if (theresienwiese && theresienwieseTarget) {
                    let routeCoordinates: [number, number][] | undefined;
                    const from = theresienwiese.coordinates as [number, number];
                    const to = theresienwieseTarget.coordinates as [number, number];
                    routeCoordinates = await fetchRoute(from, to);

                    indicators.push({
                        id: `theresienwiese-${theresienwieseTarget.id}`,
                        from: theresienwiese.name as string,
                        to: theresienwieseTarget.name as string,
                        fromCoordinates: from,
                        toCoordinates: to,
                        routeCoordinates,
                        isAvailable: true,
                        monitoredTiles: theresienwieseMonitored,
                    });
                }

                // --- Route 2: Goetheplatz -> Osteingang (preferred) / Nordosteingang (fallback) ---
                const eastTiles = ['tile_6_6', 'tile_6_5', 'tile_7_5', 'tile_7_6'];
                const northEastTiles = ['tile_4_6', 'tile_4_5', 'tile_5_5', 'tile_5_6'];

                const eastOvercrowded = isRouteOvercrowded(tiles, eastTiles);
                const northEastOvercrowded = isRouteOvercrowded(tiles, northEastTiles);

                let goetheplatzTarget: any | null = null;
                let goetheplatzMonitored: string[] = [];

                if (!eastOvercrowded && eastEntrance) {
                    // Preferred: Osteingang when not overcrowded
                    goetheplatzTarget = eastEntrance;
                    goetheplatzMonitored = eastTiles;
                } else if (eastOvercrowded && !northEastOvercrowded && northEastEntrance) {
                    // Fallback: Nordosteingang when east is bad but northeast is fine
                    goetheplatzTarget = northEastEntrance;
                    goetheplatzMonitored = northEastTiles;
                }

                if (goetheplatz && goetheplatzTarget) {
                    let routeCoordinates: [number, number][] | undefined;
                    const from = goetheplatz.coordinates as [number, number];
                    const to = goetheplatzTarget.coordinates as [number, number];
                    routeCoordinates = await fetchRoute(from, to);

                    indicators.push({
                        id: `goetheplatz-${goetheplatzTarget.id}`,
                        from: goetheplatz.name as string,
                        to: goetheplatzTarget.name as string,
                        fromCoordinates: from,
                        toCoordinates: to,
                        routeCoordinates,
                        isAvailable: true,
                        monitoredTiles: goetheplatzMonitored,
                    });
                }

                // --- Route 3: Poccistraße -> Südeingang (preferred) / Osteingang (fallback) ---
                const southTiles = ['tile_10_1', 'tile_10_2', 'tile_9_1', 'tile_9_2'];

                const southOvercrowded = isRouteOvercrowded(tiles, southTiles);
                const eastForPoccOvercrowded = isRouteOvercrowded(tiles, eastTiles);

                let poccistrasseTarget: any | null = null;
                let poccistrasseMonitored: string[] = [];

                if (!southOvercrowded && southEntrance) {
                    // Preferred: Südeingang when not overcrowded
                    poccistrasseTarget = southEntrance;
                    poccistrasseMonitored = southTiles;
                } else if (southOvercrowded && !eastForPoccOvercrowded && eastEntrance) {
                    // Fallback: Osteingang when south is bad but east is fine
                    poccistrasseTarget = eastEntrance;
                    poccistrasseMonitored = eastTiles;
                }

                if (poccistrasse && poccistrasseTarget) {
                    let routeCoordinates: [number, number][] | undefined;
                    const from = poccistrasse.coordinates as [number, number];
                    const to = poccistrasseTarget.coordinates as [number, number];
                    routeCoordinates = await fetchRoute(from, to);

                    indicators.push({
                        id: `poccistrasse-${poccistrasseTarget.id}`,
                        from: poccistrasse.name as string,
                        to: poccistrasseTarget.name as string,
                        fromCoordinates: from,
                        toCoordinates: to,
                        routeCoordinates,
                        isAvailable: true,
                        monitoredTiles: poccistrasseMonitored,
                    });
                }

                // --- Route 4: Schwanthalerhöhe -> Westeingang (preferred) / Südwesteingang (fallback) ---
                const westTiles = ['tile_4_0', 'tile_4_1', 'tile_5_0', 'tile_5_1'];
                const southWestTiles = ['tile_6_0', 'tile_6_1', 'tile_7_0', 'tile_7_1'];

                const westOvercrowded = isRouteOvercrowded(tiles, westTiles);
                const southWestOvercrowded = isRouteOvercrowded(tiles, southWestTiles);

                let schwanTarget: any | null = null;
                let schwanMonitored: string[] = [];

                if (!westOvercrowded && westEntrance) {
                    // Preferred: Westeingang when not overcrowded
                    schwanTarget = westEntrance;
                    schwanMonitored = westTiles;
                } else if (westOvercrowded && !southWestOvercrowded && southWestEntrance) {
                    // Fallback: Südwesteingang when west is bad but southwest is fine
                    schwanTarget = southWestEntrance;
                    schwanMonitored = southWestTiles;
                }

                if (schwanthalerhoehe && schwanTarget) {
                    let routeCoordinates: [number, number][] | undefined;
                    const from = schwanthalerhoehe.coordinates as [number, number];
                    const to = schwanTarget.coordinates as [number, number];
                    routeCoordinates = await fetchRoute(from, to);

                    indicators.push({
                        id: `schwanthalerhoehe-${schwanTarget.id}`,
                        from: schwanthalerhoehe.name as string,
                        to: schwanTarget.name as string,
                        fromCoordinates: from,
                        toCoordinates: to,
                        routeCoordinates,
                        isAvailable: true,
                        monitoredTiles: schwanMonitored,
                    });
                }

                // Apply all indicators (may be 0, 1, or 2)
                mapRef.current?.updateRouteIndicators(indicators);
            }
        } catch (error) {
            // Silently handle errors
        }
    }, []);

    // Update security personnel markers when data changes
    useEffect(() => {
        if (isSecurityMode && showSecurityPersonnel) {
            mapRef.current?.updateSecurityPersonnel(securityPersonnel);
        } else {
            mapRef.current?.updateSecurityPersonnel([]);
        }
    }, [isSecurityMode, showSecurityPersonnel, securityPersonnel]);


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
            setTileData(initialTiles);
            mapRef.current?.updateTileData(initialTiles);
            
            // Update markers
            mapRef.current?.addMarkers(markers);
            
            // Fetch initial data
            fetchMapData();

            // Set up polling
            const interval = setInterval(fetchMapData, 30000); // Poll every 30 seconds

            return () => clearInterval(interval);
        }, [fetchMapData, markers])
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
            
            {/* Legend */}
            <View style={[
                styles.legend,
                colorScheme === 'dark' ? styles.legendDark : styles.legendLight
            ]}>
                <View style={styles.legendLine} />
                <Text style={[
                    styles.legendText,
                    colorScheme === 'dark' ? styles.textLight : styles.textDark
                ]}>
                    Empfohlene Routen
                </Text>
            </View>

            {/* Security Mode Controls */}
            {isSecurityMode && (
                <View style={styles.controlsContainer}>
                    <Pressable
                        style={[
                            styles.controlButton,
                            colorScheme === 'dark' ? styles.controlButtonDark : styles.controlButtonLight,
                            showSecurityPersonnel && styles.controlButtonActive
                        ]}
                        onPress={() => setShowSecurityPersonnel(!showSecurityPersonnel)}
                    >
                        <View style={styles.controlButtonContent}>
                            <View style={[
                                styles.securityDot,
                                showSecurityPersonnel && styles.securityDotActive
                            ]} />
                            <Text style={[
                                styles.controlButtonText,
                                colorScheme === 'dark' ? styles.textLight : styles.textDark,
                                showSecurityPersonnel && styles.controlButtonTextActive
                            ]}>
                                Security
                            </Text>
                        </View>
                    </Pressable>
                </View>
            )}
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
    legend: {
        position: 'absolute',
        top: 100,
        right: 10,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    legendLight: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
    },
    legendDark: {
        backgroundColor: 'rgba(31, 41, 55, 0.95)',
    },
    legendLine: {
        width: 28,
        height: 4,
        borderRadius: 2,
        marginRight: 8,
        backgroundColor: '#22c55e',
    },
    legendText: {
        fontSize: 12,
        fontWeight: '600',
    },
    textLight: {
        color: '#e5e7eb',
    },
    textDark: {
        color: '#1f2937',
    },
    controlsContainer: {
        position: 'absolute',
        top: 150,
        right: 10,
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
    },
    controlButton: {
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
        minWidth: 120,
    },
    controlButtonLight: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
    },
    controlButtonDark: {
        backgroundColor: 'rgba(31, 41, 55, 0.95)',
    },
    controlButtonActive: {
        backgroundColor: '#3b82f6',
    },
    controlButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    securityDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#6b7280',
        borderWidth: 2,
        borderColor: '#ffffff',
    },
    securityDotActive: {
        backgroundColor: '#ffffff',
    },
    controlButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    controlButtonTextActive: {
        color: '#ffffff',
    },
});
