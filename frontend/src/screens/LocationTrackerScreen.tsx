import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  ScrollView,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  API_BASE_URL,
  UUID_STORAGE_KEY,
  POSITION_OVERRIDE_STORAGE_KEY,
} from "../config";

/**
 * Get position - either from override (demo mode) or from GPS
 */
const getPosition = async (): Promise<{
  latitude: number;
  longitude: number;
}> => {
  // Check for position override first (demo mode)
  try {
    const override = await AsyncStorage.getItem(POSITION_OVERRIDE_STORAGE_KEY);
    if (override) {
      const coords = JSON.parse(override);
      console.log(
        "[LocationTracker] Using position override (demo mode):",
        coords
      );
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
  } catch (error) {
    console.log("[LocationTracker] Error reading position override:", error);
  }

  // Fall back to GPS
  const location = await Location.getCurrentPositionAsync({});
  console.log(
    "[LocationTracker] Using GPS position:",
    location.coords.latitude,
    location.coords.longitude
  );
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
};

export const LocationTrackerScreen: React.FC = () => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const [isSharing, setIsSharing] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const [trackingStartTime, setTrackingStartTime] = useState<number | null>(
    null
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(120); // 2 minutes = 120 seconds
  const [isCouponUnlocked, setIsCouponUnlocked] = useState<boolean>(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

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
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (isSharing && trackingStartTime && !isCouponUnlocked) {
      // Start countdown
      countdownIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - trackingStartTime) / 1000);
        const remaining = Math.max(0, 120 - elapsed);
        setRemainingSeconds(remaining);

        if (remaining === 0) {
          setIsCouponUnlocked(true);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }
      }, 1000);
    } else if (!isSharing && countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isSharing, trackingStartTime, isCouponUnlocked]);

  // Load UUID on mount (should always exist since App.tsx initializes it)
  useEffect(() => {
    const loadUuid = async () => {
      try {
        const uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
        if (uuid) {
          console.log("[LocationTracker] Loaded UID:", uuid);
          setSharingId(uuid);
        } else {
          console.warn(
            "[LocationTracker] UUID not found in storage - this should not happen"
          );
        }
      } catch (error) {
        console.error("[LocationTracker] Error loading UUID:", error);
      }
    };
    loadUuid();
  }, []);

  const handleToggleSharing = async () => {
    if (!isSharing) {
      console.log("[LocationTracker] Starting location sharing...");
      setLocationError(null);

      try {
        console.log("[LocationTracker] Requesting location permissions...");
        const { status } = await Location.requestForegroundPermissionsAsync();
        console.log("[LocationTracker] Permission status:", status);

        if (status !== "granted") {
          const errorMsg = "Location permission was not granted";
          console.log("[LocationTracker] ERROR:", errorMsg);
          setLocationError(errorMsg);
          return;
        }

        let uid = sharingId;
        if (!uid) {
          // UUID should always exist (initialized in App.tsx), but fallback if needed
          uid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
          if (!uid) {
            // Last resort: generate new UUID (should not happen)
            uid = Crypto.randomUUID();
            await AsyncStorage.setItem(UUID_STORAGE_KEY, uid);
            console.warn(
              "[LocationTracker] Generated new UID as fallback:",
              uid
            );
          }
          setSharingId(uid);
          console.log("[LocationTracker] Loaded UID from storage:", uid);
          await AsyncStorage.setItem(UUID_STORAGE_KEY, uid);
        } else {
          console.log("[LocationTracker] Using existing UID:", uid);
        }

        console.log("[LocationTracker] Getting current position...");
        const coords = await getPosition();
        console.log(
          "[LocationTracker] Current position:",
          coords.latitude,
          coords.longitude
        );
        // Create a location object for display (even if using override)
        const locationObj = {
          coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: null,
            accuracy: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as Location.LocationObject;
        setLocation(locationObj);

        try {
          const url = `${API_BASE_URL}/position`;
          console.log(
            "[LocationTracker] Posting initial position to API:",
            url
          );
          console.log(
            "[LocationTracker] Position:",
            coords.latitude,
            coords.longitude
          );
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              long: coords.longitude,
              lat: coords.latitude,
              uid,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `[LocationTracker] HTTP error ${response.status}:`,
              errorText
            );
          } else {
            console.log(
              "[LocationTracker] Initial position posted, status:",
              response.status
            );
          }
        } catch (error: any) {
          console.error(
            "[LocationTracker] ERROR posting initial position:",
            error
          );
          console.error("Error details:", {
            message: error?.message,
            stack: error?.stack,
            name: error?.name,
          });
        }

        console.log(
          "[LocationTracker] Setting up 10-second interval for location updates..."
        );
        const intervalId = setInterval(async () => {
          try {
            const updatedCoords = await getPosition();
            console.log(
              "[LocationTracker] Updated position:",
              updatedCoords.latitude,
              updatedCoords.longitude
            );
            const updatedLocationObj = {
              coords: {
                latitude: updatedCoords.latitude,
                longitude: updatedCoords.longitude,
                altitude: null,
                accuracy: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as Location.LocationObject;
            setLocation(updatedLocationObj);

            if (uid) {
              try {
                const url = `${API_BASE_URL}/position`;
                const response = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    long: updatedCoords.longitude,
                    lat: updatedCoords.latitude,
                    uid,
                  }),
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  console.error(
                    `[LocationTracker] HTTP error ${response.status}:`,
                    errorText
                  );
                } else {
                  console.log(
                    "[LocationTracker] Position update posted, status:",
                    response.status
                  );
                }
              } catch (error: any) {
                console.error(
                  "[LocationTracker] ERROR posting updated position:",
                  error
                );
                console.error("Error details:", {
                  message: error?.message,
                  stack: error?.stack,
                  name: error?.name,
                });
              }
            }
          } catch (error) {
            console.log("[LocationTracker] ERROR updating location:", error);
          }
        }, 10000);

        locationIntervalRef.current = intervalId;

        setSharingId(uid);
        setIsSharing(true);
        setTrackingStartTime(Date.now());
        setRemainingSeconds(120);
        console.log("[LocationTracker] Location sharing started successfully!");
      } catch (error) {
        const errorMsg = "Error while accessing location";
        console.log("[LocationTracker] ERROR:", errorMsg, error);
        setLocationError(errorMsg);
      }
    } else {
      console.log("[LocationTracker] Stopping location sharing...");
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
        console.log("[LocationTracker] Cleared location update interval");
      }

      setIsSharing(false);
      setLocation(null);
      setTrackingStartTime(null);
      setRemainingSeconds(120);
      console.log("[LocationTracker] Location sharing stopped");
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
    ? "Stop sharing location"
    : "Start sharing location";

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <View
      style={[
        styles.screen,
        isDarkMode ? styles.screenDark : styles.screenLight,
      ]}
    >
      <View style={styles.buttonContainer}>
        <View style={styles.buttonWrapper}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glowCircle,
              {
                opacity: isSharing ? glowOpacity : 0,
                transform: [{ scale: glowScale }],
                display: isSharing ? "flex" : "none",
              },
            ]}
          />
          <Pressable
            onPress={handleToggleSharing}
            style={({ pressed }) => {
              const scale = isSharing ? 1.15 : pressed ? 0.97 : 1;

              return [
                styles.buttonBase,
                isDarkMode ? styles.buttonDark : styles.buttonLight,
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

      <ScrollView
        style={styles.scrollViewContent}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Coupon Section */}
        {isSharing && (
          <View style={styles.couponContainer}>
            <View
              style={[
                styles.couponCard,
                isDarkMode ? styles.couponCardDark : styles.couponCardLight,
                !isCouponUnlocked && styles.couponLocked,
              ]}
            >
              {/* Ticket notches */}
              <View style={styles.notchLeft} />
              <View style={styles.notchRight} />

              {/* Perforated line */}
              <View style={styles.perforatedLine} />

              <View style={styles.couponContent}>
                {/* Left side - Details */}
                <View style={styles.couponLeft}>
                  <Text
                    style={[
                      styles.couponTitle,
                      isDarkMode ? styles.textDark : styles.textLight,
                      !isCouponUnlocked && styles.textLocked,
                    ]}
                  >
                    WILDE MAUS
                  </Text>
                  <Text
                    style={[
                      styles.couponDiscount,
                      !isCouponUnlocked && styles.textLocked,
                    ]}
                  >
                    25% OFF
                  </Text>
                  <Text
                    style={[
                      styles.couponSubtitle,
                      isDarkMode ? styles.textMutedDark : styles.textMutedLight,
                      !isCouponUnlocked && styles.textLocked,
                    ]}
                  >
                    Oktoberfest Special
                  </Text>

                  {!isCouponUnlocked ? (
                    <View style={styles.countdownContainer}>
                      <Text
                        style={[
                          styles.countdownLabel,
                          isDarkMode
                            ? styles.textMutedDark
                            : styles.textMutedLight,
                        ]}
                      >
                        Unlocks in:
                      </Text>
                      <Text style={styles.countdownTime}>
                        {formatTime(remainingSeconds)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.unlockedBadge}>
                      <Text style={styles.unlockedText}>✓ UNLOCKED</Text>
                    </View>
                  )}
                </View>

                {/* Right side - QR Code */}
                <View style={styles.couponRight}>
                  <View
                    style={[
                      styles.qrContainer,
                      !isCouponUnlocked && styles.qrLocked,
                    ]}
                  >
                    {isCouponUnlocked ? (
                      <QRCode
                        value="WILDEMAUS25OFF"
                        size={100}
                        backgroundColor="transparent"
                        color={isDarkMode ? "#ffffff" : "#000000"}
                      />
                    ) : (
                      <View style={styles.qrPlaceholder}>
                        <Text style={styles.lockIcon}>🔒</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={styles.bottomContainer}>
          {locationError && (
            <Text style={styles.errorText}>{locationError}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  buttonContainer: {
    position: "absolute",
    top: 200,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  scrollViewContent: {
    flex: 1,
    marginTop: 350,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  screenLight: {
    backgroundColor: "#f3f4f6",
  },
  screenDark: {
    backgroundColor: "#1a1a1a",
  },
  buttonWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  glowCircle: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(34, 197, 94, 0.35)",
    shadowColor: "#22c55e",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 35,
  },
  buttonBase: {
    width: 190,
    height: 190,
    borderRadius: 95,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  buttonLight: {
    backgroundColor: "#2563eb",
  },
  buttonDark: {
    backgroundColor: "#1d4ed8",
  },
  buttonActive: {
    backgroundColor: "#16a34a",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: "#f9fafb",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  bottomContainer: {
    alignItems: "center",
    marginBottom: 50,
    minHeight: 40,
  },
  coordsContainer: {
    alignItems: "center",
  },
  coordsLabel: {
    fontSize: 13,
    marginBottom: 4,
  },
  coordsValue: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: "#f97316",
    textAlign: "center",
  },
  uuidValue: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  uuidText: {
    marginTop: 16,
    fontSize: 11,
    fontFamily: "monospace",
    textAlign: "center",
  },
  textMutedLight: {
    color: "#6b7280",
  },
  textMutedDark: {
    color: "#9ca3af",
  },
  textPrimaryLight: {
    color: "#111827",
  },
  textPrimaryDark: {
    color: "#e5e7eb",
  },
  couponContainer: {
    marginTop: 150,
    marginBottom: 30,
    alignItems: "center",
  },
  couponCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    position: "relative",
    overflow: "hidden",
  },
  couponCardLight: {
    backgroundColor: "#ffffff",
  },
  couponCardDark: {
    backgroundColor: "#2a2a2a",
  },
  couponLocked: {
    opacity: 0.6,
  },
  notchLeft: {
    position: "absolute",
    left: -10,
    top: "50%",
    marginTop: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  notchRight: {
    position: "absolute",
    right: -10,
    top: "50%",
    marginTop: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  perforatedLine: {
    position: "absolute",
    right: 130,
    top: 0,
    bottom: 0,
    width: 2,
    borderLeftWidth: 2,
    borderLeftColor: "#d1d5db",
    borderStyle: "dashed",
  },
  couponContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  couponLeft: {
    flex: 1,
    paddingRight: 20,
  },
  couponRight: {
    alignItems: "center",
    justifyContent: "center",
    width: 120,
  },
  couponTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
  couponDiscount: {
    fontSize: 32,
    fontWeight: "900",
    color: "#dc2626",
    marginBottom: 4,
  },
  couponSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  textLight: {
    color: "#111827",
  },
  textDark: {
    color: "#f9fafb",
  },
  textLocked: {
    opacity: 0.5,
  },
  countdownContainer: {
    marginTop: 8,
  },
  countdownLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  countdownTime: {
    fontSize: 28,
    fontWeight: "700",
    color: "#f59e0b",
    fontVariant: ["tabular-nums"],
  },
  unlockedBadge: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  unlockedText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  qrContainer: {
    padding: 10,
    backgroundColor: "#ffffff",
    borderRadius: 8,
  },
  qrLocked: {
    opacity: 0.3,
  },
  qrPlaceholder: {
    width: 100,
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  lockIcon: {
    fontSize: 40,
  },
});
