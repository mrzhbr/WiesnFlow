import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, UUID_STORAGE_KEY } from "../config";

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
        const current = await Location.getCurrentPositionAsync({});
        console.log(
          "[LocationTracker] Current position:",
          current.coords.latitude,
          current.coords.longitude
        );
        setLocation(current);

        try {
          const url = `${API_BASE_URL}/position`;
          console.log(
            "[LocationTracker] Posting initial position to API:",
            url
          );
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              long: current.coords.longitude,
              lat: current.coords.latitude,
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
            const updated = await Location.getCurrentPositionAsync({});
            console.log(
              "[LocationTracker] Updated position:",
              updated.coords.latitude,
              updated.coords.longitude
            );
            setLocation(updated);

            if (uid) {
              try {
                const url = `${API_BASE_URL}/position`;
                const response = await fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    long: updated.coords.longitude,
                    lat: updated.coords.latitude,
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
          {isSharing && sharingId && (
            <Text
              style={[
                styles.uuidText,
                isDarkMode ? styles.textMutedDark : styles.textMutedLight,
              ]}
            >
              {sharingId}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.bottomContainer}>
        {locationError && <Text style={styles.errorText}>{locationError}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: "space-between",
  },
  screenLight: {
    backgroundColor: "#f3f4f6",
  },
  screenDark: {
    backgroundColor: "#1a1a1a",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
});
