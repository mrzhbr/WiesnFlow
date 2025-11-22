import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  useColorScheme,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import QRCode from "react-native-qrcode-svg";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const API_BASE_URL =
  process.env.API_BASE_URL || "https://wiesnflow.onrender.com";
const UUID_STORAGE_KEY = "@wiesnflow:user_uuid";
const FRIEND_NAMES_STORAGE_KEY = "@wiesnflow:friend_names";

type Friend = {
  friend_id: string;
  accepted: boolean;
  is_sender: boolean;
};

export const FriendsScreen: React.FC = () => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userUuid, setUserUuid] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const isProcessingScanRef = useRef(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [scannedFriendId, setScannedFriendId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("");
  const [friendNames, setFriendNames] = useState<Record<string, string>>({});
  const [isAcceptingFriend, setIsAcceptingFriend] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [friendToDelete, setFriendToDelete] = useState<string | null>(null);

  const textPrimaryStyle = isDark ? styles.textLight : styles.textDark;
  const textMutedStyle = isDark ? styles.textMutedDark : styles.textMutedLight;
  const cardStyle = isDark ? styles.cardDark : styles.cardLight;

  // Load UUID and friend names from storage
  useEffect(() => {
    const loadData = async () => {
      try {
        const uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
        if (uuid) {
          console.log("[FriendsScreen] Loaded UUID from storage:", uuid);
          setUserUuid(uuid);
        } else {
          console.warn(
            "[FriendsScreen] UUID not found in storage - this should not happen"
          );
        }

        // Load friend names
        const namesJson = await AsyncStorage.getItem(FRIEND_NAMES_STORAGE_KEY);
        if (namesJson) {
          const names = JSON.parse(namesJson);
          setFriendNames(names);
        }
      } catch (error) {
        console.error("[FriendsScreen] Error loading data:", error);
      }
    };
    loadData();
  }, []);

  // Request camera permission when scanner opens
  useEffect(() => {
    if (showScanner && !permission?.granted) {
      requestPermission();
    }
  }, [showScanner, permission, requestPermission]);

  const fetchFriends = useCallback(async () => {
    // Get UUID from storage (should always exist since App.tsx initializes it)
    let uuid = userUuid;
    if (!uuid) {
      uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (uuid) {
        setUserUuid(uuid);
      } else {
        console.error("[FriendsScreen] UUID not found in storage");
        return;
      }
    }

    setIsLoading(true);
    try {
      const url = `${API_BASE_URL}/friends/list?user_id=${uuid}`;
      console.log("[FriendsScreen] Fetching friends from:", url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[FriendsScreen] HTTP error ${response.status}:`,
          errorText
        );
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("[FriendsScreen] Response data:", data);

      if (data.status === "success") {
        setFriends(data.friends || []);
      } else {
        console.error("Error fetching friends:", data.message);
      }
    } catch (err: any) {
      console.error("Error fetching friends:", err);
      console.error("Error details:", {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [userUuid]);

  // Poll friends list every 2 seconds
  useEffect(() => {
    if (!userUuid) return;

    // Initial fetch
    fetchFriends();

    // Set up interval to refresh every 2 seconds
    const intervalId = setInterval(() => {
      fetchFriends();
    }, 2000);

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [userUuid, fetchFriends]);

  const saveFriendName = async (friendId: string, name: string) => {
    try {
      const updatedNames = { ...friendNames, [friendId]: name };
      setFriendNames(updatedNames);
      await AsyncStorage.setItem(
        FRIEND_NAMES_STORAGE_KEY,
        JSON.stringify(updatedNames)
      );
    } catch (error) {
      console.error("[FriendsScreen] Error saving friend name:", error);
    }
  };

  const handleAddFriend = async (friendUuid: string, customName?: string) => {
    // Get UUID from storage (should always exist since App.tsx initializes it)
    let uuid = userUuid;
    if (!uuid) {
      uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (uuid) {
        setUserUuid(uuid);
      } else {
        setIsAddingFriend(false);
        setShowScanner(false);
        setScanned(false);
        setShowNameInput(false);
        isProcessingScanRef.current = false;
        Alert.alert("Error", "User ID not available");
        return;
      }
    }

    if (uuid === friendUuid) {
      setIsAddingFriend(false);
      setShowScanner(false);
      setScanned(false);
      setShowNameInput(false);
      isProcessingScanRef.current = false;
      Alert.alert("Error", "You cannot add yourself as a friend");
      return;
    }

    // Save custom name if provided
    if (customName && customName.trim()) {
      await saveFriendName(friendUuid, customName.trim());
    }

    setIsAddingFriend(true);
    try {
      const url = `${API_BASE_URL}/friends/add/${friendUuid}?user_id=${uuid}`;
      console.log("[FriendsScreen] Adding friend, URL:", url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[FriendsScreen] HTTP error ${response.status}:`,
          errorText
        );
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("[FriendsScreen] Add friend response:", data);

      if (data.status === "success") {
        setIsAddingFriend(false);
        setShowScanner(false);
        setScanned(false);
        setShowNameInput(false);
        setScannedFriendId(null);
        setFriendName("");
        setIsAcceptingFriend(false);
        isProcessingScanRef.current = false;
        fetchFriends();
      } else {
        setIsAddingFriend(false);
        setScanned(false);
        isProcessingScanRef.current = false;
        Alert.alert("Error", data.message || "Failed to add friend");
      }
    } catch (err: any) {
      setIsAddingFriend(false);
      setScanned(false);
      isProcessingScanRef.current = false;
      const errorMessage =
        err?.message || "Network error. Please check your connection.";
      Alert.alert("Error", errorMessage);
      console.error("Error adding friend:", err);
      console.error("Error details:", {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });
    }
  };

  const handleConfirmName = () => {
    if (scannedFriendId) {
      if (isAcceptingFriend) {
        handleConfirmAcceptFriend();
      } else {
        handleAddFriend(scannedFriendId, friendName);
      }
    }
  };

  const handleScanQRCode = useCallback((data: string) => {
    // Prevent multiple scans using ref (more reliable than state for race conditions)
    if (isProcessingScanRef.current) {
      console.log(
        "[FriendsScreen] Scan already in progress, ignoring duplicate scan"
      );
      return;
    }

    isProcessingScanRef.current = true;
    setScanned(true);

    try {
      // Decode the UUID from the QR code
      const friendUuid = data.trim();
      console.log("[FriendsScreen] Scanned QR code:", friendUuid);
      if (friendUuid) {
        setScannedFriendId(friendUuid);
        setFriendName("");
        setIsAcceptingFriend(false);
        setShowScanner(false);
        setShowNameInput(true);
        isProcessingScanRef.current = false;
      } else {
        Alert.alert("Error", "Invalid QR code");
        setScanned(false);
        isProcessingScanRef.current = false;
      }
    } catch (error) {
      Alert.alert("Error", "Failed to process QR code");
      console.error("Error processing QR code:", error);
      setScanned(false);
      isProcessingScanRef.current = false;
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    // Get UUID from storage if not in state
    let uuid = userUuid;
    if (!uuid) {
      uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (uuid) {
        setUserUuid(uuid);
      } else {
        return; // UUID should always exist, but return if somehow missing
      }
    }
    setRefreshing(true);
    fetchFriends();
  }, [userUuid, fetchFriends]);

  useFocusEffect(
    useCallback(() => {
      // Reload UUID when screen comes into focus (in case it was set in LocationTrackerScreen)
      const reloadUuid = async () => {
        try {
          const uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
          if (uuid) {
            console.log("[FriendsScreen] Reloaded UUID on focus:", uuid);
            setUserUuid(uuid);
            // Fetch friends after UUID is loaded
            fetchFriends();
          } else {
            console.log(
              "[FriendsScreen] No UUID found. User needs to start location sharing first."
            );
          }
        } catch (error) {
          console.error("[FriendsScreen] Error reloading UUID:", error);
        }
      };
      reloadUuid();
    }, [fetchFriends])
  );

  const handleAcceptFriend = (friendUuid: string) => {
    // Show name input modal first
    setScannedFriendId(friendUuid);
    setFriendName(friendNames[friendUuid] || ""); // Pre-fill if name already exists
    setIsAcceptingFriend(true);
    setShowNameInput(true);
  };

  const handleConfirmAcceptFriend = async () => {
    if (!scannedFriendId) return;

    // Get UUID from storage (should always exist since App.tsx initializes it)
    let uuid = userUuid;
    if (!uuid) {
      uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (uuid) {
        setUserUuid(uuid);
      } else {
        Alert.alert("Error", "User ID not available");
        setShowNameInput(false);
        setIsAcceptingFriend(false);
        setScannedFriendId(null);
        setFriendName("");
        return;
      }
    }

    // Save custom name if provided
    if (friendName && friendName.trim()) {
      await saveFriendName(scannedFriendId, friendName.trim());
    }

    try {
      const url = `${API_BASE_URL}/friends/accept/${scannedFriendId}?user_id=${uuid}`;
      console.log("[FriendsScreen] Accepting friend, URL:", url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[FriendsScreen] HTTP error ${response.status}:`,
          errorText
        );
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("[FriendsScreen] Accept friend response:", data);

      if (data.status === "success") {
        setShowNameInput(false);
        setIsAcceptingFriend(false);
        setScannedFriendId(null);
        setFriendName("");
        fetchFriends();
      } else {
        Alert.alert("Error", data.message || "Failed to accept friend");
      }
    } catch (err: any) {
      const errorMessage =
        err?.message || "Network error. Please check your connection.";
      Alert.alert("Error", errorMessage);
      console.error("Error accepting friend:", err);
      console.error("Error details:", {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });
    }
  };

  const handleDeclineFriend = async (friendUuid: string) => {
    // Get UUID from storage (should always exist since App.tsx initializes it)
    let uuid = userUuid;
    if (!uuid) {
      uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (uuid) {
        setUserUuid(uuid);
      } else {
        Alert.alert("Error", "User ID not available");
        return;
      }
    }

    Alert.alert(
      "Decline Friend Request",
      "Are you sure you want to decline this friend request?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              const url = `${API_BASE_URL}/friends/reject/${friendUuid}?user_id=${uuid}`;
              console.log("[FriendsScreen] Declining friend, URL:", url);
              const response = await fetch(url);

              if (!response.ok) {
                const errorText = await response.text();
                console.error(
                  `[FriendsScreen] HTTP error ${response.status}:`,
                  errorText
                );
                throw new Error(`HTTP ${response.status}: ${errorText}`);
              }

              const data = await response.json();
              console.log("[FriendsScreen] Decline friend response:", data);

              if (data.status === "success") {
                fetchFriends();
              } else {
                Alert.alert(
                  "Error",
                  data.message || "Failed to decline friend"
                );
              }
            } catch (err: any) {
              const errorMessage =
                err?.message || "Network error. Please check your connection.";
              Alert.alert("Error", errorMessage);
              console.error("Error declining friend:", err);
              console.error("Error details:", {
                message: err?.message,
                stack: err?.stack,
                name: err?.name,
              });
            }
          },
        },
      ]
    );
  };

  const handleRemoveFriend = (friendUuid: string) => {
    setFriendToDelete(friendUuid);
    setShowDeleteConfirm(true);
  };

  const handleConfirmRemoveFriend = async () => {
    if (!friendToDelete) return;

    // Get UUID from storage (should always exist since App.tsx initializes it)
    let uuid = userUuid;
    if (!uuid) {
      uuid = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (uuid) {
        setUserUuid(uuid);
      } else {
        Alert.alert("Error", "User ID not available");
        setShowDeleteConfirm(false);
        setFriendToDelete(null);
        return;
      }
    }

    try {
      const url = `${API_BASE_URL}/friends/remove/${friendToDelete}?user_id=${uuid}`;
      console.log("[FriendsScreen] Removing friend, URL:", url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[FriendsScreen] HTTP error ${response.status}:`,
          errorText
        );
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log("[FriendsScreen] Remove friend response:", data);

      if (data.status === "success") {
        // Also remove the friend name from local storage
        const updatedNames = { ...friendNames };
        delete updatedNames[friendToDelete];
        setFriendNames(updatedNames);
        try {
          await AsyncStorage.setItem(
            FRIEND_NAMES_STORAGE_KEY,
            JSON.stringify(updatedNames)
          );
        } catch (error) {
          console.error("[FriendsScreen] Error removing friend name:", error);
        }

        setShowDeleteConfirm(false);
        setFriendToDelete(null);
        fetchFriends();
      } else {
        Alert.alert("Error", data.message || "Failed to remove friend");
      }
    } catch (err: any) {
      const errorMessage =
        err?.message || "Network error. Please check your connection.";
      Alert.alert("Error", errorMessage);
      console.error("Error removing friend:", err);
      console.error("Error details:", {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });
    }
  };

  const getStatusLabel = (accepted: boolean, isSender: boolean) => {
    if (accepted) {
      return "Accepted";
    } else if (isSender) {
      // Current user sent the request - show Pending
      return "Pending";
    } else {
      // Current user received the request - will show buttons instead
      return "Request received";
    }
  };

  const getStatusColor = (accepted: boolean, isSender: boolean) => {
    if (accepted) {
      return "#22c55e";
    } else if (isSender) {
      // Current user sent the request - show orange/yellow for pending
      return "#f59e0b";
    } else {
      // Current user received the request - show blue
      return "#3b82f6";
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        isDark ? styles.containerDark : styles.containerLight,
      ]}
      edges={["top"]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.title, textPrimaryStyle]}>Friends</Text>
        </View>

        <View style={styles.buttonContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.outlineButton,
              cardStyle,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => setShowQRCode(true)}
          >
            <Text style={[styles.outlineButtonText, textPrimaryStyle]}>
              Show my Code
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={async () => {
              if (!permission?.granted) {
                const result = await requestPermission();
                if (!result.granted) {
                  Alert.alert(
                    "Camera Permission Required",
                    "Please grant camera permission to scan QR codes.",
                    [{ text: "OK" }]
                  );
                  return;
                }
              }
              setScanned(false);
              isProcessingScanRef.current = false;
              setShowScanner(true);
            }}
          >
            <Text style={styles.primaryButtonText}>Scan Friend Code</Text>
          </Pressable>
        </View>

        <View style={styles.friendsSection}>
          <Text style={[styles.sectionTitle, textPrimaryStyle]}>
            Friends ({friends.length})
          </Text>

          {friends.length === 0 ? (
            <View style={[styles.emptyState, cardStyle]}>
              <Text style={[styles.emptyStateText, textMutedStyle]}>
                No friends yet. Scan a friend's QR code to add them!
              </Text>
            </View>
          ) : (
            friends.map((friend) => (
              <View
                key={friend.friend_id}
                style={[styles.friendCard, cardStyle]}
              >
                <View style={styles.friendHeader}>
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>
                      {friend.friend_id.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.friendInfo}>
                    <Text
                      style={[styles.friendId, textPrimaryStyle]}
                      numberOfLines={1}
                    >
                      {friendNames[friend.friend_id] || friend.friend_id}
                    </Text>
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              getStatusColor(
                                friend.accepted,
                                friend.is_sender
                              ) + "20",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            {
                              color: getStatusColor(
                                friend.accepted,
                                friend.is_sender
                              ),
                            },
                          ]}
                        >
                          {getStatusLabel(friend.accepted, friend.is_sender)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {friend.accepted && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => handleRemoveFriend(friend.friend_id)}
                    >
                      <Text style={styles.deleteButtonText}>🗑️</Text>
                    </Pressable>
                  )}
                </View>
                {/* Show Accept/Decline buttons when accepted=false AND current user received the request (is_sender=false) */}
                {!friend.accepted && !friend.is_sender && (
                  <View style={styles.actionButtons}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.acceptButton,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => handleAcceptFriend(friend.friend_id)}
                    >
                      <Text style={styles.acceptButtonText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.declineButton,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => handleDeclineFriend(friend.friend_id)}
                    >
                      <Text style={styles.declineButtonText}>Decline</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* QR Code Modal */}
      <Modal
        visible={showQRCode}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowQRCode(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, cardStyle]}>
            <Text style={[styles.modalTitle, textPrimaryStyle]}>
              My Friend Code
            </Text>
            <Text style={[styles.modalSubtitle, textMutedStyle]}>
              Share this code with friends
            </Text>
            {userUuid && (
              <View style={styles.qrCodeContainer}>
                <QRCode
                  value={userUuid}
                  size={250}
                  backgroundColor={isDark ? "#2a2a2a" : "#ffffff"}
                  color={isDark ? "#ffffff" : "#000000"}
                />
              </View>
            )}
            {userUuid && (
              <Text style={[styles.uuidText, textMutedStyle]} numberOfLines={1}>
                {userUuid}
              </Text>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => setShowQRCode(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal
        visible={showScanner}
        animationType="slide"
        onRequestClose={() => {
          setShowScanner(false);
          setScanned(false);
          setIsAddingFriend(false);
          isProcessingScanRef.current = false;
        }}
      >
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Scan Friend Code</Text>
            <Pressable
              style={styles.closeScannerButton}
              onPress={() => {
                setShowScanner(false);
                setScanned(false);
                setIsAddingFriend(false);
                isProcessingScanRef.current = false;
              }}
            >
              <Text style={styles.closeScannerButtonText}>✕</Text>
            </Pressable>
          </View>
          {!permission?.granted ? (
            <View style={styles.scannerContent}>
              <Text style={styles.scannerText}>
                Camera permission is required to scan QR codes.
              </Text>
              <Pressable
                style={styles.primaryButton}
                onPress={requestPermission}
              >
                <Text style={styles.primaryButtonText}>Grant Permission</Text>
              </Pressable>
            </View>
          ) : (
            <CameraView
              key={showScanner ? "scanner-active" : "scanner-inactive"}
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
              onBarcodeScanned={
                scanned || isProcessingScanRef.current
                  ? undefined
                  : ({ data, type }) => {
                      console.log(
                        "[FriendsScreen] Barcode scanned event triggered:",
                        {
                          data,
                          type,
                        }
                      );
                      if (data && !scanned && !isProcessingScanRef.current) {
                        handleScanQRCode(data);
                      }
                    }
              }
            >
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerFrame} />
                <Text style={styles.scannerHint}>
                  Position the QR code within the frame
                </Text>
              </View>
            </CameraView>
          )}
        </View>
      </Modal>

      {/* Name Input Modal */}
      <Modal
        visible={showNameInput}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowNameInput(false);
          setScannedFriendId(null);
          setFriendName("");
          setIsAcceptingFriend(false);
          setScanned(false);
          isProcessingScanRef.current = false;
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, cardStyle]}>
            <Text style={[styles.modalTitle, textPrimaryStyle]}>
              {isAcceptingFriend ? "Accept Friend" : "Add Friend Name"}
            </Text>
            <Text style={[styles.modalSubtitle, textMutedStyle]}>
              {isAcceptingFriend
                ? "Give your friend a custom name (optional)"
                : "Give your friend a custom name (optional)"}
            </Text>
            <TextInput
              style={[
                styles.nameInput,
                isDark ? styles.nameInputDark : styles.nameInputLight,
                textPrimaryStyle,
              ]}
              placeholder="Enter friend's name"
              placeholderTextColor={isDark ? "#9ca3af" : "#6b7280"}
              value={friendName}
              onChangeText={setFriendName}
              autoFocus={true}
              onSubmitEditing={handleConfirmName}
            />
            <View style={styles.nameInputButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => {
                  setShowNameInput(false);
                  setScannedFriendId(null);
                  setFriendName("");
                  setIsAcceptingFriend(false);
                  setScanned(false);
                  isProcessingScanRef.current = false;
                }}
              >
                <Text style={styles.cancelButtonText}>Skip</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.confirmButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleConfirmName}
              >
                <Text style={styles.confirmButtonText}>
                  {isAcceptingFriend ? "Accept" : "Add Friend"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Adding Friend Loading Modal */}
      <Modal visible={isAddingFriend} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, cardStyle]}>
            <ActivityIndicator
              size="large"
              color={isDark ? "#22c55e" : "#16a34a"}
            />
            <Text
              style={[styles.modalTitle, textPrimaryStyle, { marginTop: 20 }]}
            >
              Adding friend...
            </Text>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteConfirm(false);
          setFriendToDelete(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, cardStyle]}>
            <Text style={[styles.modalTitle, textPrimaryStyle]}>
              Remove Friend
            </Text>
            <Text style={[styles.modalSubtitle, textMutedStyle]}>
              Are you sure you want to remove this friend? This action cannot be
              undone.
            </Text>
            <View style={styles.nameInputButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setFriendToDelete(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.deleteConfirmButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleConfirmRemoveFriend}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerLight: {
    backgroundColor: "#f3f4f6",
  },
  containerDark: {
    backgroundColor: "#1a1a1a",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 150,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
  },
  buttonContainer: {
    marginBottom: 24,
    gap: 12,
  },
  outlineButton: {
    borderWidth: 2,
    borderColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#16a34a",
  },
  primaryButton: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  friendsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyState: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: "center",
  },
  friendCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardLight: {
    backgroundColor: "#ffffff",
  },
  cardDark: {
    backgroundColor: "#2a2a2a",
  },
  friendHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  friendAvatarText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
  },
  friendInfo: {
    flex: 1,
  },
  friendId: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  friendStatus: {
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#22c55e",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  acceptButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  declineButton: {
    flex: 1,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  declineButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 350,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
  },
  qrCodeContainer: {
    padding: 20,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    marginBottom: 16,
  },
  uuidText: {
    fontSize: 12,
    marginBottom: 20,
    fontFamily: "monospace",
  },
  closeButton: {
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
  },
  closeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#1a1a1a",
  },
  scannerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
  },
  closeScannerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
  },
  closeScannerButtonText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "600",
  },
  scannerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  scannerText: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#16a34a",
    borderRadius: 16,
  },
  scannerHint: {
    color: "#ffffff",
    fontSize: 14,
    marginTop: 24,
    textAlign: "center",
  },
  textLight: {
    color: "#e5e7eb",
  },
  textDark: {
    color: "#0f172a",
  },
  textMutedLight: {
    color: "#6b7280",
  },
  textMutedDark: {
    color: "#9ca3af",
  },
  nameInput: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  nameInputLight: {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
    color: "#0f172a",
  },
  nameInputDark: {
    backgroundColor: "#1a1a1a",
    borderColor: "#4b5563",
    color: "#e5e7eb",
  },
  nameInputButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#6b7280",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#6b7280",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  deleteButtonText: {
    fontSize: 20,
  },
  deleteConfirmButton: {
    flex: 1,
    backgroundColor: "#ef4444",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteConfirmButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
