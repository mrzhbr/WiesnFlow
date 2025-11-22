import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    Text,
    useColorScheme,
    View,
} from 'react-native';
import * as Location from 'expo-location';

const generateUuid = (): string => {
    // Simple UUID v4 generator without external dependencies
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

const API_BASE_URL = 'http://localhost:8000';

export const PlaceholderScreen: React.FC = () => {
    const colorScheme = useColorScheme();
    const isDarkMode = colorScheme === 'dark';

    const [isSharing, setIsSharing] = useState(false);
    const [sharingId, setSharingId] = useState<string | null>(null);
    const [location, setLocation] = useState<Location.LocationObject | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        let animation: Animated.CompositeAnimation | null = null;

        if (isSharing) {
            animation = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulse, {
                        toValue: 1,
                        duration: 900,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulse, {
                        toValue: 0,
                        duration: 900,
                        useNativeDriver: true,
                    }),
                ])
            );
            animation.start();
        } else {
            pulse.stopAnimation(() => {
                pulse.setValue(0);
            });
        }

        return () => {
            if (animation) {
                animation.stop();
            }
        };
    }, [isSharing, pulse]);

    useEffect(() => {
        return () => {
            if (locationIntervalRef.current) {
                clearInterval(locationIntervalRef.current);
                locationIntervalRef.current = null;
            }
        };
    }, []);

    const handleToggleSharing = async () => {
        if (!isSharing) {
            setLocationError(null);

            try {
                const { status } = await Location.requestForegroundPermissionsAsync();

                if (status !== 'granted') {
                    setLocationError('Location permission was not granted');
                    return;
                }

                let uid = sharingId;
                if (!uid) {
                    uid = generateUuid();
                    setSharingId(uid);
                }

                const current = await Location.getCurrentPositionAsync({});
                setLocation(current);

                try {
                    await fetch(`${API_BASE_URL}/position`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            long: current.coords.longitude,
                            lat: current.coords.latitude,
                            uid,
                        }),
                    });
                } catch (error) {
                    console.log('Error posting initial position', error);
                }

                const intervalId = setInterval(async () => {
                    try {
                        const updated = await Location.getCurrentPositionAsync({});
                        setLocation(updated);

                        if (uid) {
                            try {
                                await fetch(`${API_BASE_URL}/position`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        long: updated.coords.longitude,
                                        lat: updated.coords.latitude,
                                        uid,
                                    }),
                                });
                            } catch (error) {
                                console.log('Error posting updated position', error);
                            }
                        }
                    } catch (error) {
                        console.log('Error updating location', error);
                    }
                }, 10000);

                locationIntervalRef.current = intervalId;

                setSharingId(uid);
                setIsSharing(true);
            } catch (error) {
                setLocationError('Error while accessing location');
            }
        } else {
            if (locationIntervalRef.current) {
                clearInterval(locationIntervalRef.current);
                locationIntervalRef.current = null;
            }

            setIsSharing(false);
            setSharingId(null);
            setLocation(null);
        }
    };

    const glowScale = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.12],
    });

    const glowOpacity = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.25, 0.85],
    });

    const buttonLabel = isSharing
        ? 'Stop sharing location'
        : 'Start sharing location';

    return (
        <View
            style={[
                styles.screen,
                isDarkMode ? styles.screenDark : styles.screenLight,
            ]}
        >
            <View style={styles.centerContent}>
                <View style={styles.buttonWrapper}>
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.glowCircle,
                            {
                                opacity: isSharing ? glowOpacity : 0,
                                transform: [{ scale: glowScale }],
                                display: isSharing ? 'flex' : 'none',
                            },
                        ]}
                    />
                    <Pressable
                        onPress={handleToggleSharing}
                        style={({ pressed }) => {
                            const scale = isSharing ? 1.15 : pressed ? 0.97 : 1;

                            return [
                                styles.buttonBase,
                                isDarkMode
                                    ? styles.buttonDark
                                    : styles.buttonLight,
                                isSharing && styles.buttonActive,
                                pressed && !isSharing && styles.buttonPressed,
                                { transform: [{ scale }] },
                            ];
                        }}
                    >
                        <Text style={styles.buttonText}>{buttonLabel}</Text>
                    </Pressable>
                </View>
            </View>

            <View style={styles.bottomContainer}>
                {isSharing && location && (
                    <View style={styles.coordsContainer}>
                        <Text
                            style={[
                                styles.coordsLabel,
                                isDarkMode
                                    ? styles.textMutedDark
                                    : styles.textMutedLight,
                            ]}
                        >
                            Your coordinates
                        </Text>
                        <Text
                            style={[
                                styles.coordsValue,
                                isDarkMode
                                    ? styles.textPrimaryDark
                                    : styles.textPrimaryLight,
                            ]}
                        >
                            {location.coords.latitude.toFixed(5)},{' '}
                            {location.coords.longitude.toFixed(5)}
                        </Text>
                    </View>
                )}

                {locationError && (
                    <Text style={styles.errorText}>{locationError}</Text>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        paddingHorizontal: 24,
        paddingVertical: 32,
        justifyContent: 'space-between',
    },
    screenLight: {
        backgroundColor: '#f9fafb',
    },
    screenDark: {
        backgroundColor: '#020617',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    glowCircle: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: 'rgba(34, 197, 94, 0.35)',
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 35,
    },
    buttonBase: {
        width: 190,
        height: 190,
        borderRadius: 95,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 10,
    },
    buttonLight: {
        backgroundColor: '#2563eb',
    },
    buttonDark: {
        backgroundColor: '#1d4ed8',
    },
    buttonActive: {
        backgroundColor: '#16a34a',
    },
    buttonPressed: {
        opacity: 0.9,
    },
    buttonText: {
        color: '#f9fafb',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
        paddingHorizontal: 16,
    },
    bottomContainer: {
        alignItems: 'center',
        marginBottom: 12,
        minHeight: 40,
    },
    coordsContainer: {
        alignItems: 'center',
    },
    coordsLabel: {
        fontSize: 13,
        marginBottom: 4,
    },
    coordsValue: {
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    errorText: {
        marginTop: 8,
        fontSize: 12,
        color: '#f97316',
        textAlign: 'center',
    },
    uuidValue: {
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    textMutedLight: {
        color: '#6b7280',
    },
    textMutedDark: {
        color: '#9ca3af',
    },
    textPrimaryLight: {
        color: '#111827',
    },
    textPrimaryDark: {
        color: '#e5e7eb',
    },
});
