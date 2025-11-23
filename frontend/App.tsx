import React, { useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { View, ActivityIndicator, StyleSheet, LogBox } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { TabNavigator } from "./src/navigation/TabNavigator";
import { UUID_STORAGE_KEY } from "./src/config";
import { SecurityModeProvider } from "./src/contexts/SecurityModeContext";

// Ignore all error messages and warnings - suppresses error overlays in Expo Go
LogBox.ignoreAllLogs(true);

// Error Boundary to catch React errors gracefully
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Silently log to console without showing overlay
    console.log("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Return a minimal fallback UI instead of crashing
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeUserId = async () => {
      try {
        // Check if UUID exists in storage
        let uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);

        if (!uuid) {
          // Generate new UUID if it doesn't exist
          uuid = Crypto.randomUUID();
          await AsyncStorage.setItem(UUID_STORAGE_KEY, uuid);
          console.log("[App] Generated and saved new UUID:", uuid);
        } else {
          console.log("[App] Loaded existing UUID:", uuid);
        }

        setIsReady(true);
      } catch (error) {
        console.error("[App] Error initializing user ID:", error);
        // Even if there's an error, continue with app
        setIsReady(true);
      }
    };

    initializeUserId();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SecurityModeProvider>
        <NavigationContainer>
          <TabNavigator />
        </NavigationContainer>
      </SecurityModeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
});
