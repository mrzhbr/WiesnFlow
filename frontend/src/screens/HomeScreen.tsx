import React, { useRef, useCallback, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  useColorScheme,
  Text,
  Animated,
  PanResponder,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { MapboxWebView, MapboxWebViewRef } from "../components/MapboxWebView";
import oktoberfestTiles from "../data/oktoberfest_tiles.json";

const INITIAL_CENTER: [number, number] = [11.5492349, 48.1313557];
const INITIAL_ZOOM = 14;
const API_BASE_URL =
  process.env.API_BASE_URL || "https://wiesnflow.onrender.com";

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

      // Set up polling
      const interval = setInterval(fetchMapData, 30000); // Poll every 30 seconds

      return () => clearInterval(interval);
    }, [fetchMapData])
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
      />
      <TileDetailsCard
        tile={selectedTile}
        colorScheme={colorScheme}
        isVisible={isSheetVisible}
        onClose={handleCloseSheet}
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
});
