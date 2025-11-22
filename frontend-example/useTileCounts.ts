/**
 * Custom React hook for fetching and managing tile counts
 * Can be used with any map library
 */

import { useState, useEffect, useCallback } from 'react';

interface TileCounts {
  [tileId: string]: number;
}

interface UseTileCountsOptions {
  apiUrl: string;
  refreshInterval?: number; // in milliseconds
  autoRefresh?: boolean;
}

interface UseTileCountsReturn {
  tileCounts: TileCounts;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  maxCount: number;
}

export const useTileCounts = ({
  apiUrl,
  refreshInterval = 30000,
  autoRefresh = true,
}: UseTileCountsOptions): UseTileCountsReturn => {
  const [tileCounts, setTileCounts] = useState<TileCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTileCounts = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${apiUrl}/map`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: TileCounts = await response.json();
      setTileCounts(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching tile counts:', err);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchTileCounts();

    if (autoRefresh) {
      const interval = setInterval(fetchTileCounts, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchTileCounts, refreshInterval, autoRefresh]);

  // Calculate max count for color scaling
  const maxCount = Math.max(...Object.values(tileCounts), 1);

  return {
    tileCounts,
    loading,
    error,
    refresh: fetchTileCounts,
    maxCount,
  };
};

