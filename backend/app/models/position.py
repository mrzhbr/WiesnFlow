from pydantic import BaseModel, Field, field_validator
from typing import Optional
import uuid

class Position(BaseModel):
    """
    Position model compatible with PostGIS POINT geometry.
    PostGIS uses POINT(longitude, latitude) format.
    """
    longitude: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees (WGS84)"
    )
    latitude: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees (WGS84)"
    )
    
    def to_postgis_point(self) -> str:
        """
        Convert to PostGIS POINT format: POINT(longitude latitude)
        Note: PostGIS uses longitude first, then latitude.
        """
        return f"POINT({self.longitude} {self.latitude})"
    
    def to_postgis_geography(self) -> str:
        """
        Convert to PostGIS GEOGRAPHY format using SRID 4326 (WGS84).
        Format: SRID=4326;POINT(longitude latitude)
        """
        return f"SRID=4326;POINT({self.longitude} {self.latitude})"
    
    def to_geojson(self) -> dict:
        """
        Convert to GeoJSON format.
        GeoJSON uses [longitude, latitude] order.
        """
        return {
            "type": "Point",
            "coordinates": [self.longitude, self.latitude]
        }
    
    @classmethod
    def from_postgis_point(cls, point_str: str) -> 'Position':
        """
        Create Position from PostGIS POINT string.
        Accepts formats like: "POINT(-122.4194 37.7749)" or "SRID=4326;POINT(-122.4194 37.7749)"
        """
        # Remove SRID prefix if present
        if ';' in point_str:
            point_str = point_str.split(';', 1)[1]
        
        # Extract coordinates from POINT(longitude latitude)
        point_str = point_str.strip()
        if not point_str.upper().startswith('POINT'):
            raise ValueError(f"Invalid PostGIS POINT format: {point_str}")
        
        # Extract coordinates: POINT(longitude latitude)
        coords = point_str[6:-1]  # Remove "POINT(" and ")"
        parts = coords.split()
        
        if len(parts) != 2:
            raise ValueError(f"Invalid coordinate format: {coords}")
        
        return cls(
            longitude=float(parts[0]),
            latitude=float(parts[1])
        )
    
    @classmethod
    def from_geojson(cls, geojson: dict) -> 'Position':
        """
        Create Position from GeoJSON Point.
        GeoJSON format: {"type": "Point", "coordinates": [longitude, latitude]}
        """
        if geojson.get("type") != "Point":
            raise ValueError("GeoJSON type must be 'Point'")
        
        coords = geojson.get("coordinates")
        if not coords or len(coords) != 2:
            raise ValueError("GeoJSON coordinates must be [longitude, latitude]")
        
        return cls(
            longitude=float(coords[0]),
            latitude=float(coords[1])
        )


class PositionCreate(BaseModel):
    """Position model for creating new positions. Accepts 'long', 'lat', and 'uid' in POST body."""
    long: float = Field(
        ...,
        ge=-180.0,
        le=180.0,
        description="Longitude in decimal degrees (WGS84)"
    )
    lat: float = Field(
        ...,
        ge=-90.0,
        le=90.0,
        description="Latitude in decimal degrees (WGS84)"
    )
    uid: str = Field(
        ...,
        description="User identifier",
    )
    
    def to_position(self) -> Position:
        """Convert to Position model for PostGIS operations."""
        return Position(
            longitude=self.long,
            latitude=self.lat
        )


class PositionResponse(Position):
    """Position model for API responses."""
    pass

