import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  useColorScheme,
  Text,
  Animated,
  PanResponder,
  Pressable,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MapboxWebView, MapboxWebViewRef } from "../components/MapboxWebView";
import oktoberfestTiles from "../data/oktoberfest_tiles.json";
import {
  API_BASE_URL,
  UUID_STORAGE_KEY,
  FRIEND_NAMES_STORAGE_KEY,
} from "../config";

const INITIAL_CENTER: [number, number] = [11.5492349, 48.1313557];
const INITIAL_ZOOM = 14;

const POI_COORDINATES: Record<string, { lat: number; lon: number }> = {
  schottenhammel: { lon: 11.548353, lat: 48.132072 },
  loewenbraeu: { lon: 11.549452, lat: 48.130993 },
  hacker_festzelt: { lon: 11.54875, lat: 48.13299 },
  paulaner: { lon: 11.547958, lat: 48.131006 },
  kaefer: { lon: 11.54761, lat: 48.130425 },
  augustiner: { lon: 11.549934, lat: 48.132894 },
  wilde_maus: { lon: 11.551921, lat: 48.132814 },
  teufelsrad: { lon: 11.551595, lat: 48.132216 },
  hexenschaukel: { lon: 11.551471, lat: 48.132642 },
  kalbsbratierei_heimer: { lon: 11.550964, lat: 48.133435 },
  cafe_kaiserschmarn_rischart: { lon: 11.55063, lat: 48.130582 },
};

const formatName = (name: string) => {
  let formatted = name.replace(/_/g, " ");
  formatted = formatted
    .replace(/ae/g, "ä")
    .replace(/oe/g, "ö")
    .replace(/ue/g, "ü");
  return formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getCategoryEmoji = (type: string) => {
  switch (type) {
    case "tent":
      return "🍺";
    case "roller_coaster":
      return "🎡";
    case "food":
      return "🥨";
    default:
      return "📍";
  }
};

type SelectedTile = {
  tileId: string;
  row?: number;
  col?: number;
} | null;

type TimelinePoint = {
  label: string;
  value: number;
};

type TileMockData = {
  tileId: string;
  currentCount: number;
  peakCount: number;
  history: TimelinePoint[];
};

type TileApiRow = {
  count?: number;
  created_at?: string;
  last_update?: string;
  [key: string]: any;
};

type LineChartProps = {
  data: TimelinePoint[];
  accentColor: string;
  isDark: boolean;
  labelTextStyle: any;
};

// Tile data is always derived from backend time-series now.

const formatTimeLabel = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

// Decode PostGIS WKB hex string to (longitude, latitude)
const decodeWkbPoint = (wkbHex: string): [number, number] | null => {
  try {
    // Convert hex string to ArrayBuffer
    const buffer = new ArrayBuffer(wkbHex.length / 2);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < wkbHex.length; i += 2) {
      bytes[i / 2] = parseInt(wkbHex.substr(i, 2), 16);
    }

    // Check endianness (first byte)
    const isLittleEndian = bytes[0] === 1;

    // Helper function to read uint32
    const readUInt32 = (offset: number): number => {
      if (isLittleEndian) {
        return (
          bytes[offset] |
          (bytes[offset + 1] << 8) |
          (bytes[offset + 2] << 16) |
          (bytes[offset + 3] << 24)
        );
      } else {
        return (
          (bytes[offset] << 24) |
          (bytes[offset + 1] << 16) |
          (bytes[offset + 2] << 8) |
          bytes[offset + 3]
        );
      }
    };

    // Helper function to read double (IEEE 754)
    const readDouble = (offset: number): number => {
      const view = new DataView(buffer, offset, 8);
      return view.getFloat64(0, isLittleEndian);
    };

    // Skip endianness byte (1 byte)
    let offset = 1;

    // Read geometry type (4 bytes)
    const geomType = readUInt32(offset);
    offset += 4;

    // If SRID is present (geometry type & 0x20000000), skip SRID (4 bytes)
    if (geomType & 0x20000000) {
      offset += 4;
    }

    // Read longitude (X coordinate) - 8 bytes as double
    const longitude = readDouble(offset);
    offset += 8;

    // Read latitude (Y coordinate) - 8 bytes as double
    const latitude = readDouble(offset);

    return [longitude, latitude];
  } catch (error) {
    console.error("Error decoding WKB point:", error);
    return null;
  }
};

type Friend = {
  user_id: string;
  accepted: boolean;
  is_sent_by_me: boolean;
  position: string | null;
  last_update: string | null;
};

type FriendWithCoords = Friend & {
  longitude: number;
  latitude: number;
  name: string;
};

const smoothHistory = (points: TimelinePoint[]): TimelinePoint[] => {
  if (!points.length) {
    return points;
  }
  const kernel = [1, 2, 3, 2, 1];
  const radius = 2;
  const smoothed: TimelinePoint[] = [];

  for (let i = 0; i < points.length; i += 1) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const idx = i + k;
      if (idx < 0 || idx >= points.length) {
        continue;
      }
      const weight = kernel[k + radius];
      weightedSum += points[idx].value * weight;
      weightTotal += weight;
    }
    const smoothedValue =
      weightTotal > 0 ? weightedSum / weightTotal : points[i].value;
    smoothed.push({
      label: points[i].label,
      value: Math.round(smoothedValue),
    });
  }

  return smoothed;
};

const buildTileDataFromApi = (
  tileId: string,
  rows: TileApiRow[]
): TileMockData => {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
  const minuteCount = 60;

  const totals: number[] = new Array(minuteCount).fill(0);
  const samples: number[] = new Array(minuteCount).fill(0);

  rows.forEach((row) => {
    const createdAtRaw = row.created_at || row.last_update;
    const countRaw = row.count;
    if (!createdAtRaw || typeof countRaw !== "number") {
      return;
    }
    const timestamp = new Date(createdAtRaw);
    if (Number.isNaN(timestamp.getTime())) {
      return;
    }
    if (timestamp < windowStart || timestamp > now) {
      return;
    }
    const minutesFromStart =
      (timestamp.getTime() - windowStart.getTime()) / 60000;
    let index = Math.floor(minutesFromStart);
    if (index < 0) index = 0;
    if (index >= minuteCount) index = minuteCount - 1;
    totals[index] += countRaw;
    samples[index] += 1;
  });

  const rawHistory: TimelinePoint[] = [];
  for (let i = 0; i < minuteCount; i += 1) {
    const minuteStart = new Date(windowStart.getTime() + i * 60_000);
    let label = "";
    if (i === minuteCount - 1) {
      label = "Now";
    } else if (i % 10 === 0) {
      label = formatTimeLabel(minuteStart);
    }
    const value = samples[i] > 0 ? totals[i] / samples[i] : 0;
    rawHistory.push({
      label,
      value: Math.round(value),
    });
  }

  const history = smoothHistory(rawHistory);

  let currentCount = history[history.length - 1]?.value ?? 0;
  let peakCount = currentCount;
  history.forEach((point) => {
    if (point.value > peakCount) {
      peakCount = point.value;
    }
  });

  return {
    tileId,
    currentCount,
    peakCount,
    history,
  };
};

const LineChart: React.FC<LineChartProps> = ({
  data,
  accentColor,
  isDark,
  labelTextStyle,
}) => {
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  if (!data.length) {
    return null;
  }
  let max = data[0].value;
  let min = data[0].value;
  data.forEach((point) => {
    if (point.value > max) {
      max = point.value;
    }
    if (point.value < min) {
      min = point.value;
    }
  });
  const range = max - min || 1;
  const points = data.map((point, index) => {
    const x = data.length === 1 ? 0.5 : index / (data.length - 1);
    const y = (point.value - min) / range;
    return { ...point, x, y };
  });

  const dotFill = isDark ? "#020617" : "#ffffff";

  return (
    <View>
      <View
        style={styles.lineChartTrack}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width !== layout.width || height !== layout.height) {
            setLayout({ width, height });
          }
        }}
      >
        {layout.width > 0 &&
          layout.height > 0 &&
          points.map((point, index) => {
            const innerWidth = layout.width - LINE_CHART_HORIZONTAL_PADDING * 2;
            const innerHeight = layout.height - LINE_CHART_VERTICAL_PADDING * 2;
            const cx = LINE_CHART_HORIZONTAL_PADDING + point.x * innerWidth;
            const cy =
              LINE_CHART_VERTICAL_PADDING + (1 - point.y) * innerHeight;

            const elements: React.ReactElement[] = [];
            if (index > 0) {
              const prev = points[index - 1];
              const prevCx =
                LINE_CHART_HORIZONTAL_PADDING + prev.x * innerWidth;
              const prevCy =
                LINE_CHART_VERTICAL_PADDING + (1 - prev.y) * innerHeight;
              const dx = cx - prevCx;
              const dy = cy - prevCy;
              const length = Math.sqrt(dx * dx + dy * dy) || 1;
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              const mx = (cx + prevCx) / 2;
              const my = (cy + prevCy) / 2;
              elements.push(
                <View
                  key={`segment-${index}`}
                  style={[
                    styles.lineChartSegment,
                    {
                      width: length,
                      backgroundColor: accentColor,
                      transform: [
                        { translateX: mx - length / 2 },
                        { translateY: my - 1 },
                        { rotate: `${angle}deg` },
                      ],
                    },
                  ]}
                />
              );
            }
            return elements;
          })}
      </View>
      <View style={styles.lineChartLabelsRow}>
        {data.map((point, index) => (
          <Text key={String(index)} style={[styles.chartLabel, labelTextStyle]}>
            {point.label}
          </Text>
        ))}
      </View>
    </View>
  );
};

type TileDetailsCardProps = {
  tile: SelectedTile;
  colorScheme: "light" | "dark" | null | undefined;
};

const TileDetailsCard: React.FC<
  TileDetailsCardProps & { isVisible: boolean; onClose: () => void }
> = ({ tile, colorScheme, isVisible, onClose }) => {
  const isDark = colorScheme === "dark";
  const textPrimaryStyle = isDark ? styles.textLight : styles.textDark;
  const textMutedStyle = isDark ? styles.textMutedDark : styles.textMutedLight;
  const accentColor = isDark ? "#22c55e" : "#16a34a";
  const subtleAccent = isDark
    ? "rgba(34, 197, 94, 0.14)"
    : "rgba(34, 197, 94, 0.12)";
  const [tileData, setTileData] = useState<TileMockData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 4,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy > 80 || gestureState.vy > 0.8;
        if (shouldClose) {
          Animated.timing(translateY, {
            toValue: 260,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (!tile) {
      setTileData(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const load = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/map/${tile.tileId}?duration=1`
        );
        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }
        const raw = await response.json();
        const rows: TileApiRow[] = Array.isArray(raw) ? raw : [];
        const dataFromApi = buildTileDataFromApi(tile.tileId, rows);
        if (!cancelled) {
          setTileData(dataFromApi);
        }
      } catch (error) {
        console.log("Error fetching tile data", error);
        if (!cancelled) {
          setTileData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [tile]);

  if (!isVisible) {
    return null;
  }

  let content: React.ReactNode;

  if (!tile) {
    content = (
      <>
        <Text style={[styles.bottomCardTitle, textPrimaryStyle]}>
          Explore the crowd
        </Text>
        <Text style={[styles.bottomCardSubtitle, textMutedStyle]}>
          Tap any colored square on the map to see live crowd levels for that
          area.
        </Text>
      </>
    );
  } else if (!tileData && isLoading) {
    content = (
      <>
        <Text style={[styles.bottomCardTitle, textPrimaryStyle]}>
          Loading data…
        </Text>
      </>
    );
  } else if (!tileData && !isLoading) {
    content = (
      <>
        <Text style={[styles.bottomCardTitle, textPrimaryStyle]}>No data</Text>
        <Text style={[styles.bottomCardSubtitle, textMutedStyle]}>
          No measurements for this tile in the last hour.
        </Text>
      </>
    );
  } else {
    const data = tileData as TileMockData;
    content = (
      <>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, textMutedStyle]}>People now</Text>
            <Text style={[styles.statValue, textPrimaryStyle]}>
              {data.currentCount}
            </Text>
          </View>
        </View>

        <View style={styles.chartSection}>
          <View style={styles.chartHeaderRow}>
            <Text style={[styles.chartTitle, textPrimaryStyle]}>Timeline</Text>
            <Text style={[styles.chartSubtitle, textMutedStyle]}>
              {isLoading ? "Loading data…" : "Last hour"}
            </Text>
          </View>
          <View style={styles.chartBody}>
            <LineChart
              data={data.history}
              accentColor={accentColor}
              isDark={isDark}
              labelTextStyle={textMutedStyle}
            />
          </View>
        </View>
      </>
    );
  }

  return (
    <View pointerEvents="box-none" style={styles.bottomOverlay}>
      <View style={styles.sheetContainer}>
        <Animated.View
          style={[
            styles.bottomCard,
            isDark ? styles.bottomCardDark : styles.bottomCardLight,
            { transform: [{ translateY }] },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.sheetHandleContainer}>
            <View style={styles.sheetHandle} />
          </View>
          {content}
        </Animated.View>
      </View>
    </View>
  );
};

type CustomSliderProps = {
  label: string;
  value: number;
  onValueChange: (val: number) => void;
  isDark: boolean;
  leftLabel?: string;
  rightLabel?: string;
};

const CustomSlider: React.FC<CustomSliderProps> = ({
  label,
  value,
  onValueChange,
  isDark,
  leftLabel,
  rightLabel,
}) => {
  const widthRef = useRef(0);
  const startValueRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        const width = widthRef.current;
        if (width > 0) {
          const locationX = evt.nativeEvent.locationX;
          const newValue = Math.max(0, Math.min(1, locationX / width));
          startValueRef.current = newValue;
          onValueChange(newValue);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const width = widthRef.current;
        if (width > 0) {
          const delta = gestureState.dx / width;
          const newValue = Math.max(
            0,
            Math.min(1, startValueRef.current + delta)
          );
          onValueChange(newValue);
        }
      },
    })
  ).current;

  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderHeader}>
        <Text
          style={[
            styles.sliderLabel,
            isDark ? styles.textLight : styles.textDark,
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.sliderValue,
            isDark ? styles.textMutedDark : styles.textMutedLight,
          ]}
        >
          {(value * 100).toFixed(0)}%
        </Text>
      </View>
      <View
        style={styles.sliderTrackContainer}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
      >
        <View
          pointerEvents="none"
          style={[
            styles.sliderTrack,
            { backgroundColor: isDark ? "#334155" : "#cbd5e1" },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.sliderFill,
            {
              backgroundColor: isDark ? "#22c55e" : "#16a34a",
              width: `${value * 100}%`,
            },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.sliderThumb,
            {
              left: `${value * 100}%`,
              borderColor: isDark ? "#22c55e" : "#16a34a",
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
            },
          ]}
        />
      </View>
      {(leftLabel || rightLabel) && (
        <View style={styles.sliderLabelsRow}>
          <Text
            style={[
              styles.sliderSideLabel,
              isDark ? styles.textMutedDark : styles.textMutedLight,
            ]}
          >
            {leftLabel}
          </Text>
          <Text
            style={[
              styles.sliderSideLabel,
              isDark ? styles.textMutedDark : styles.textMutedLight,
            ]}
          >
            {rightLabel}
          </Text>
        </View>
      )}
    </View>
  );
};

type AttractionSelectorProps = {
  selected: string[];
  onToggle: (id: string) => void;
  isDark: boolean;
};

const ATTRACTION_TYPES = [
  { id: "tents", label: "🍻 Tents" },
  { id: "rides", label: "🎡 Rides" },
  { id: "food", label: "🥨 Food" },
];

const AttractionSelector: React.FC<AttractionSelectorProps> = ({
  selected,
  onToggle,
  isDark,
}) => {
  return (
    <View style={styles.selectorContainer}>
      <Text
        style={[
          styles.selectorTitle,
          isDark ? styles.textLight : styles.textDark,
        ]}
      >
        Attractions
      </Text>
      <View style={styles.selectorGrid}>
        {ATTRACTION_TYPES.map((type) => {
          const isSelected = selected.includes(type.id);
          return (
            <Pressable
              key={type.id}
              style={[
                styles.selectorChip,
                isSelected
                  ? isDark
                    ? styles.chipSelectedDark
                    : styles.chipSelectedLight
                  : isDark
                  ? styles.chipBaseDark
                  : styles.chipBaseLight,
              ]}
              onPress={() => onToggle(type.id)}
            >
              <Text
                style={[
                  styles.chipText,
                  isSelected
                    ? styles.chipTextSelected
                    : isDark
                    ? styles.textMutedDark
                    : styles.textMutedLight,
                ]}
              >
                {type.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

type ActionPopupProps = {
  visible: boolean;
  onClose: () => void;
  colorScheme: "light" | "dark" | null | undefined;
  onShowResults: (preference: number, types: string[]) => void;
};

const ActionPopup: React.FC<ActionPopupProps> = ({
  visible,
  onClose,
  colorScheme,
  onShowResults,
}) => {
  const isDark = colorScheme === "dark";
  const [preference, setPreference] = useState(0.5); // 0: Distance, 1: Crowd
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const toggleType = (id: string) => {
    if (selectedTypes.includes(id)) {
      setSelectedTypes(selectedTypes.filter((t) => t !== id));
    } else {
      setSelectedTypes([...selectedTypes, id]);
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[
            styles.modalContent,
            isDark ? styles.modalContentDark : styles.modalContentLight,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={[
              styles.modalTitle,
              isDark ? styles.textLight : styles.textDark,
            ]}
          >
            Find Best Spot
          </Text>

          <View style={styles.popupBody}>
            <CustomSlider
              label="Preference"
              value={preference}
              onValueChange={setPreference}
              isDark={isDark}
              leftLabel="Distance"
              rightLabel="Crowd"
            />
            <AttractionSelector
              selected={selectedTypes}
              onToggle={toggleType}
              isDark={isDark}
            />
          </View>

          <Pressable
            style={[
              styles.modalButton,
              isDark ? styles.buttonDark : styles.buttonLight,
            ]}
            onPress={() => {
              onShowResults(preference, selectedTypes);
              onClose();
            }}
          >
            <Text style={styles.buttonText}>Show Results</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

type RecommendationsSheetProps = {
  recommendations: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  colorScheme: any;
};

const RecommendationsSheet: React.FC<RecommendationsSheetProps> = ({
  recommendations,
  selectedId,
  onSelect,
  onClose,
  colorScheme,
}) => {
  const isDark = colorScheme === "dark";
  if (!recommendations || recommendations.length === 0) return null;

  return (
    <View style={styles.bottomOverlay} pointerEvents="box-none">
      <View style={styles.sheetContainer}>
        <View
          style={[
            styles.bottomCard,
            isDark ? styles.bottomCardDark : styles.bottomCardLight,
          ]}
        >
          <View style={styles.bottomCardHeaderRow}>
            <Text
              style={[
                styles.bottomCardTitle,
                isDark ? styles.textLight : styles.textDark,
              ]}
            >
              Top Recommendations
            </Text>
            <Pressable onPress={onClose}>
              <Ionicons
                name="close"
                size={24}
                color={isDark ? "#9ca3af" : "#6b7280"}
              />
            </Pressable>
          </View>

          {recommendations.map((item, index) => {
            const isSelected = item.tent_name === selectedId;
            return (
              <Pressable
                key={index}
                style={[
                  styles.recItem,
                  isSelected
                    ? isDark
                      ? styles.recItemSelectedDark
                      : styles.recItemSelectedLight
                    : {},
                ]}
                onPress={() => onSelect(item.tent_name)}
              >
                <View style={styles.recContent}>
                  <Text
                    style={[
                      styles.recTitle,
                      isDark ? styles.textLight : styles.textDark,
                    ]}
                  >
                    {getCategoryEmoji(item.type)} {item.tent_name}
                  </Text>
                  <Text
                    style={[
                      styles.recSubtitle,
                      isDark ? styles.textMutedDark : styles.textMutedLight,
                    ]}
                  >
                    Distance: {Math.round(item.distance)}m • Score:{" "}
                    {item.score.toFixed(1)}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

type FriendPopoverProps = {
  friend: FriendWithCoords | null;
  visible: boolean;
  onClose: () => void;
  colorScheme: "light" | "dark" | null | undefined;
};

const FriendPopover: React.FC<FriendPopoverProps> = ({
  friend,
  visible,
  onClose,
  colorScheme,
}) => {
  const isDark = colorScheme === "dark";

  if (!visible || !friend) return null;

  const formatLastSeen = (lastUpdate: string | null): string => {
    if (!lastUpdate) return "Never";

    try {
      const date = new Date(lastUpdate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch (e) {
      return "Unknown";
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.popoverOverlay} onPress={onClose}>
        <Pressable
          style={[
            styles.friendPopover,
            isDark ? styles.friendPopoverDark : styles.friendPopoverLight,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.friendPopoverHeader}>
            <View style={styles.friendPopoverIcon}>
              <Ionicons
                name="person"
                size={24}
                color={isDark ? "#e5e7eb" : "#0f172a"}
              />
            </View>
          </View>
          <Text
            style={[
              styles.friendPopoverName,
              isDark ? styles.textLight : styles.textDark,
            ]}
          >
            {friend.name}
          </Text>
          <Text
            style={[
              styles.friendPopoverTime,
              isDark ? styles.textMutedDark : styles.textMutedLight,
            ]}
          >
            Last seen: {formatLastSeen(friend.last_update)}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export const HomeScreen = () => {
  const colorScheme = useColorScheme();
  const mapRef = useRef<MapboxWebViewRef>(null);

  const fetchMapData = useCallback(async () => {
    try {
      const url = `${API_BASE_URL}/map`;
      console.log("[HomeScreen] Fetching map data from:", url);
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[HomeScreen] HTTP error ${response.status}:`, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(
        "[HomeScreen] Fetched map data:",
        JSON.stringify(data, null, 2)
      );

      if (data.tiles) {
        mapRef.current?.updateTileData(data.tiles);
        // Refresh friends when map data updates
        fetchFriends();
      }
    } catch (error: any) {
      console.error("[HomeScreen] Error fetching map data:", error);
      console.error("Error details:", {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
    }
  }, []);
  const [selectedTile, setSelectedTile] = useState<SelectedTile>(null);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [isActionPopupVisible, setIsActionPopupVisible] = useState(false);

  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendWithCoords[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendWithCoords | null>(
    null
  );
  const [isFriendPopoverVisible, setIsFriendPopoverVisible] = useState(false);

  const handleRecSelect = useCallback((id: string) => {
    setSelectedRecId(id);
    mapRef.current?.highlightMarker(id);
  }, []);

  const fetchFriends = useCallback(async () => {
    try {
      const userId = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (!userId) {
        console.log("[HomeScreen] No user ID found for friends");
        return;
      }

      const url = `${API_BASE_URL}/friends/map?user_id=${userId}`;
      console.log("[HomeScreen] Fetching friends from:", url);
      const response = await fetch(url);

      if (!response.ok) {
        console.error(
          `[HomeScreen] HTTP error ${response.status} fetching friends`
        );
        return;
      }

      const data = await response.json();
      console.log("[HomeScreen] Fetched friends:", data);

      if (data.status === "success" && data.friends) {
        // Load friend names from AsyncStorage
        const friendNamesStr = await AsyncStorage.getItem(
          FRIEND_NAMES_STORAGE_KEY
        );
        const friendNames: Record<string, string> = friendNamesStr
          ? JSON.parse(friendNamesStr)
          : {};

        // Decode positions and enrich with names
        const friendsWithCoords: FriendWithCoords[] = [];

        for (const friend of data.friends as Friend[]) {
          if (!friend.position) continue;

          const coords = decodeWkbPoint(friend.position);
          if (!coords) continue;

          const [longitude, latitude] = coords;
          const name =
            friendNames[friend.user_id] ||
            `Friend ${friend.user_id.substring(0, 8)}`;

          friendsWithCoords.push({
            ...friend,
            longitude,
            latitude,
            name,
          });
        }

        setFriends(friendsWithCoords);

        // Add friend markers to map
        if (mapRef.current && friendsWithCoords.length > 0) {
          mapRef.current.addFriendMarkers(friendsWithCoords);
        }
      }
    } catch (error: any) {
      console.error("[HomeScreen] Error fetching friends:", error);
    }
  }, []);

  const handleFriendMarkerPress = useCallback(
    (friendId: string) => {
      const friend = friends.find((f) => f.user_id === friendId);
      if (friend) {
        setSelectedFriend(friend);
        setIsFriendPopoverVisible(true);
      }
    },
    [friends]
  );

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
      mapRef.current?.updateTileData(initialTiles);

      // Fetch initial data
      fetchMapData();
      fetchFriends();

      // Set up polling
      const mapInterval = setInterval(fetchMapData, 30000); // Poll every 30 seconds
      const friendsInterval = setInterval(fetchFriends, 30000); // Poll friends every 30 seconds

      return () => {
        clearInterval(mapInterval);
        clearInterval(friendsInterval);
      };
    }, [fetchMapData, fetchFriends])
  );
  useFocusEffect(
    useCallback(() => {
      // Reset camera when screen comes into focus
      mapRef.current?.flyTo(INITIAL_CENTER, INITIAL_ZOOM);
    }, [])
  );

  const handleTilePress = useCallback(
    (tile: { tileId: string; row: number; col: number }) => {
      setSelectedTile(tile);
      setIsSheetVisible(true);
    },
    []
  );

  const handleCloseSheet = useCallback(() => {
    setIsSheetVisible(false);
    setSelectedTile(null);
  }, []);

  const handleShowResults = async (preference: number, types: string[]) => {
    try {
      const userId = await AsyncStorage.getItem(UUID_STORAGE_KEY);
      if (!userId) {
        console.log("No user ID found");
        return;
      }

      const distancePreference = 1 - preference;
      let requests: Promise<any>[] = [];

      if (types.length === 0 || types.length === 3) {
        const url = `${API_BASE_URL}/recommendations?user_id=${userId}&distance_preference=${distancePreference}&type=all`;
        requests.push(fetch(url).then((r) => (r.ok ? r.json() : [])));
      } else {
        types.forEach((t) => {
          let typeParam = "";
          if (t === "tents") typeParam = "tent";
          else if (t === "rides") typeParam = "roller_coaster";
          else if (t === "food") typeParam = "food";

          if (typeParam) {
            const url = `${API_BASE_URL}/recommendations?user_id=${userId}&distance_preference=${distancePreference}&type=${typeParam}`;
            requests.push(fetch(url).then((r) => (r.ok ? r.json() : [])));
          }
        });
      }

      const results = await Promise.all(requests);
      const flatResults = results.flat();
      // Deduplicate based on tent_name
      const uniqueResults = Array.from(
        new Map(flatResults.map((item) => [item.tent_name, item])).values()
      );

      // Enrich with hardcoded coordinates
      const enrichedResults = uniqueResults
        .filter((item: any) => item && item.tent_name) // Filter out invalid items
        .map((item: any) => {
          const coords = POI_COORDINATES[item.tent_name];
          let newItem = { ...item };

          if (coords) {
            newItem.latitude = coords.lat;
            newItem.longitude = coords.lon;
          }

          newItem.tent_name = formatName(newItem.tent_name);
          return newItem;
        });

      // Sort by score (high to low)
      enrichedResults.sort((a: any, b: any) => b.score - a.score);

      if (mapRef.current) {
        mapRef.current.addMarkers(enrichedResults);
      }

      setRecommendations(enrichedResults);
      if (enrichedResults.length > 0) {
        handleRecSelect(enrichedResults[0].tent_name);
        setIsSheetVisible(false);
        setSelectedTile(null);
      }
    } catch (e) {
      console.error("Error fetching recommendations:", e);
    }
  };

  return (
    <View style={styles.container}>
      <MapboxWebView
        ref={mapRef}
        accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ""}
        style={styles.map}
        initialCenter={INITIAL_CENTER}
        initialZoom={INITIAL_ZOOM}
        colorScheme={colorScheme}
        onTilePress={handleTilePress}
        onMarkerPress={handleRecSelect}
        onFriendMarkerPress={handleFriendMarkerPress}
        tileInteractionsEnabled={recommendations.length === 0}
      />

      <Pressable
        style={[
          styles.actionButton,
          colorScheme === "dark"
            ? styles.actionButtonDark
            : styles.actionButtonLight,
        ]}
        onPress={() => setIsActionPopupVisible(true)}
      >
        <Ionicons name="search" size={30} color="#16a34a" />
      </Pressable>

      <ActionPopup
        visible={isActionPopupVisible}
        onClose={() => setIsActionPopupVisible(false)}
        colorScheme={colorScheme}
        onShowResults={handleShowResults}
      />

      <TileDetailsCard
        tile={selectedTile}
        colorScheme={colorScheme}
        isVisible={isSheetVisible}
        onClose={handleCloseSheet}
      />

      <RecommendationsSheet
        recommendations={recommendations}
        selectedId={selectedRecId}
        onSelect={handleRecSelect}
        onClose={() => {
          setRecommendations([]);
          setSelectedRecId(null);
          mapRef.current?.addMarkers([]);
        }}
        colorScheme={colorScheme}
      />

      <FriendPopover
        friend={selectedFriend}
        visible={isFriendPopoverVisible}
        onClose={() => {
          setIsFriendPopoverVisible(false);
          setSelectedFriend(null);
        }}
        colorScheme={colorScheme}
      />
    </View>
  );
};

const LINE_CHART_HORIZONTAL_PADDING = 16;
const LINE_CHART_VERTICAL_PADDING = 10;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  bottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "flex-end",
    pointerEvents: "box-none",
  },
  sheetContainer: {
    paddingHorizontal: 18,
    paddingBottom: 130,
  },
  bottomCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  bottomCardLight: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
  },
  bottomCardDark: {
    backgroundColor: "rgba(15, 23, 42, 0.96)",
  },
  sheetHandleContainer: {
    alignItems: "center",
    marginBottom: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.9)",
  },
  bottomCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  bottomCardTitleBlock: {
    flexDirection: "column",
    flex: 1,
    marginRight: 12,
  },
  bottomCardEyebrow: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  bottomCardTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  bottomCardSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  statValueSmall: {
    fontSize: 13,
    fontWeight: "500",
  },
  chartSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148, 163, 184, 0.35)",
    paddingTop: 8,
  },
  chartHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  chartSubtitle: {
    fontSize: 12,
  },
  chartBody: {
    marginTop: 4,
  },
  chartLabel: {
    fontSize: 10,
  },
  lineChartTrack: {
    height: 70,
    borderRadius: 18,
    backgroundColor: "rgba(148, 163, 184, 0.16)",
    overflow: "hidden",
    paddingHorizontal: LINE_CHART_HORIZONTAL_PADDING,
    paddingVertical: LINE_CHART_VERTICAL_PADDING,
  },
  lineChartLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  lineChartPoint: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },
  lineChartSegment: {
    position: "absolute",
    height: 2,
    borderRadius: 999,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "80%",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalContentLight: {
    backgroundColor: "white",
  },
  modalContentDark: {
    backgroundColor: "#1e293b",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  modalButton: {
    borderRadius: 10,
    padding: 10,
    elevation: 2,
    minWidth: 100,
  },
  buttonLight: {
    backgroundColor: "#16a34a",
  },
  buttonDark: {
    backgroundColor: "#22c55e",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
  },
  actionButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  actionButtonLight: {
    backgroundColor: "#ffffff",
  },
  actionButtonDark: {
    backgroundColor: "#1e293b",
  },
  actionButtonText: {
    fontSize: 30,
    color: "#16a34a",
    lineHeight: 32,
  },
  popupBody: {
    width: "100%",
    marginBottom: 20,
  },
  sliderContainer: {
    width: "100%",
    marginBottom: 20,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    alignItems: "center",
  },
  sliderLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  sliderValue: {
    fontSize: 12,
  },
  sliderTrackContainer: {
    height: 30,
    justifyContent: "center",
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    width: "100%",
  },
  sliderFill: {
    height: 4,
    borderRadius: 2,
    position: "absolute",
    left: 0,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    position: "absolute",
    borderWidth: 2,
    marginLeft: -10, // Center the thumb
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  selectorContainer: {
    width: "100%",
    marginBottom: 10,
  },
  selectorTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  selectorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  chipBaseLight: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
  },
  chipBaseDark: {
    backgroundColor: "#1e293b",
    borderColor: "#334155",
  },
  chipSelectedLight: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  chipSelectedDark: {
    backgroundColor: "#22c55e",
    borderColor: "#22c55e",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextSelected: {
    color: "white",
  },
  sliderLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sliderSideLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  recItem: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "transparent",
  },
  recItemSelectedLight: {
    backgroundColor: "#f0fdf4",
    borderColor: "#16a34a",
  },
  recItemSelectedDark: {
    backgroundColor: "rgba(22, 163, 74, 0.2)",
    borderColor: "#16a34a",
  },
  recContent: {
    flex: 1,
  },
  recTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  recSubtitle: {
    fontSize: 12,
  },
  popoverOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  friendPopover: {
    borderRadius: 16,
    padding: 20,
    minWidth: 200,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  friendPopoverLight: {
    backgroundColor: "#ffffff",
  },
  friendPopoverDark: {
    backgroundColor: "#1e293b",
  },
  friendPopoverHeader: {
    marginBottom: 12,
  },
  friendPopoverIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  friendPopoverName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  friendPopoverTime: {
    fontSize: 14,
    textAlign: "center",
  },
});
