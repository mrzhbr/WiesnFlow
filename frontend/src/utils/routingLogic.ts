import oktoberfestTiles from '../data/oktoberfest_tiles.json';

export interface RouteIndicator {
    id: string;
    from: [number, number]; // U-Bahn station coordinates
    to: [number, number];   // Entrance coordinates
    midpoint: [number, number]; // Where to place the indicator
    status: 'available' | 'blocked'; // green arrow or red cross
    stationName: string;
    entranceName: string;
}

// Station to entrance assignments
export const STATION_ENTRANCE_MAP: Record<string, string[]> = {
    'ubahn-goetheplatz': ['entrance-east', 'entrance-north-east'],
    'ubahn-theresienwiese': ['entrance-main', 'entrance-nord', 'entrance-north-east'],
    'ubahn-poccistrasse': ['entrance-east', 'entrance-south', 'entrance-south-west'],
    'ubahn-schwanthalerhöhe': ['entrance-south-west', 'entrance-west', 'entrance-main']
};

// Helper to find which tile a coordinate is in
function findTileForCoordinate(lon: number, lat: number): string | null {
    for (const feature of oktoberfestTiles.features) {
        if (feature.geometry.type === 'Polygon') {
            const coords = feature.geometry.coordinates[0];
            // Simple point-in-polygon check (bounding box)
            const lons = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            const minLon = Math.min(...lons);
            const maxLon = Math.max(...lons);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            
            if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
                return feature.properties.tileId || feature.id as string;
            }
        }
    }
    return null;
}

// Get surrounding tile IDs from row/col
function getSurroundingTiles(tileId: string): string[] {
    const tile = oktoberfestTiles.features.find(
        f => (f.properties.tileId || f.id) === tileId
    );
    
    if (!tile || !tile.properties.row || !tile.properties.col) {
        return [];
    }
    
    const row = tile.properties.row;
    const col = tile.properties.col;
    
    const surrounding: string[] = [];
    
    // Check 8 surrounding tiles
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue; // Skip center tile
            
            const surroundTile = oktoberfestTiles.features.find(
                f => f.properties.row === row + dr && f.properties.col === col + dc
            );
            
            if (surroundTile) {
                const id = surroundTile.properties.tileId || surroundTile.id as string;
                if (id) surrounding.push(id);
            }
        }
    }
    
    return surrounding;
}

// Check if entrance is overcrowded (tile + surrounding tiles > 60)
export function isEntranceOvercrowded(
    entranceCoords: [number, number],
    tileData: Record<string, number>
): boolean {
    const tileId = findTileForCoordinate(entranceCoords[0], entranceCoords[1]);
    
    if (!tileId) {
        return false; // Can't determine, assume not overcrowded
    }
    
    const centerCount = tileData[tileId] || 0;
    if (centerCount > 60) {
        return true;
    }
    
    // Check surrounding tiles
    const surroundingTiles = getSurroundingTiles(tileId);
    for (const surroundId of surroundingTiles) {
        if ((tileData[surroundId] || 0) > 60) {
            return true;
        }
    }
    
    return false;
}

// Calculate midpoint between two coordinates
function getMidpoint(coord1: [number, number], coord2: [number, number]): [number, number] {
    return [
        (coord1[0] + coord2[0]) / 2,
        (coord1[1] + coord2[1]) / 2
    ];
}

// Generate route indicators based on current tile data
export function generateRouteIndicators(
    stations: Array<{ id: string; name: string; coordinates: [number, number] }>,
    entrances: Array<{ id: string; name: string; coordinates: [number, number] }>,
    tileData: Record<string, number>
): RouteIndicator[] {
    const indicators: RouteIndicator[] = [];
    
    // For each station, check its assigned entrances
    for (const station of stations) {
        const assignedEntranceIds = STATION_ENTRANCE_MAP[station.id];
        if (!assignedEntranceIds) continue;
        
        for (const entranceId of assignedEntranceIds) {
            const entrance = entrances.find(e => e.id === entranceId);
            if (!entrance) continue;
            
            const isBlocked = isEntranceOvercrowded(entrance.coordinates, tileData);
            
            indicators.push({
                id: `${station.id}-${entrance.id}`,
                from: station.coordinates,
                to: entrance.coordinates,
                midpoint: getMidpoint(station.coordinates, entrance.coordinates),
                status: isBlocked ? 'blocked' : 'available',
                stationName: station.name,
                entranceName: entrance.name
            });
        }
    }
    
    return indicators;
}
