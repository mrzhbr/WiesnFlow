"""
Script to seed the database with 100 random positions within Theresienwiese boundaries.
Uses the /position endpoint to create position entries.
Runs in 100 threads for concurrent posting.
"""

import json
import random
import uuid
import os
import threading
import time
from typing import List, Tuple

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    print("❌ 'requests' library is required. Install it with: pip install requests")
    exit(1)

# Theresienwiese bounding box coordinates
TOP_LEFT_LAT = 48.136293
TOP_LEFT_LON = 11.544973
BOTTOM_RIGHT_LAT = 48.126496
BOTTOM_RIGHT_LON = 11.553518

# API configuration
API_BASE_URL = os.getenv("API_BASE_URL", "https://wiesnflow.onrender.com")
API_ENDPOINT = f"{API_BASE_URL}/position"

# Thread-safe counters and locks
success_lock = threading.Lock()
error_lock = threading.Lock()
print_lock = threading.Lock()
progress_lock = threading.Lock()
success_count = 0
error_count = 0
completed_count = 0


def generate_random_position() -> Tuple[float, float]:
    """
    Generate a random position within the Theresienwiese boundaries.
    Returns (longitude, latitude) tuple.
    """
    # Generate random latitude between bottom and top
    lat = random.uniform(BOTTOM_RIGHT_LAT, TOP_LEFT_LAT)
    
    # Generate random longitude between left and right
    lon = random.uniform(TOP_LEFT_LON, BOTTOM_RIGHT_LON)
    
    return (lon, lat)


def generate_uuid() -> str:
    """Generate a random UUID v4."""
    return str(uuid.uuid4())


def post_position(lon: float, lat: float, uid: str, index: int, total: int) -> None:
    """
    Post a position to the API endpoint in a thread-safe manner.
    Updates global counters and prints progress.
    """
    global success_count, error_count, completed_count
    
    try:
        payload = {
            "long": lon,
            "lat": lat,
            "uid": uid
        }
        
        response = requests.post(API_ENDPOINT, json=payload, timeout=10)
        response.raise_for_status()
        
        # Thread-safe success counter increment
        with success_lock:
            success_count += 1
        
        # Thread-safe progress printing
        with print_lock:
            completed_count += 1
            print(f"[{completed_count}/{total}] ✅ Posted position ({lat:.6f}, {lon:.6f}) for user {uid[:8]}")
            
    except Exception as e:
        # Thread-safe error counter increment
        with error_lock:
            error_count += 1
        
        # Thread-safe error printing
        with print_lock:
            completed_count += 1
            print(f"[{completed_count}/{total}] ❌ Error posting position for {uid[:8]}: {e}")


def main():
    """Main function to seed 100 random positions using 100 threads."""
    global success_count, error_count, completed_count
    
    # Reset counters
    success_count = 0
    error_count = 0
    completed_count = 0
    
    print(f"🌱 Seeding 100 random positions using 100 threads...")
    print(f"   API endpoint: {API_ENDPOINT}")
    print(f"   Boundaries:")
    print(f"     Top-left: {TOP_LEFT_LAT}, {TOP_LEFT_LON}")
    print(f"     Bottom-right: {BOTTOM_RIGHT_LAT}, {BOTTOM_RIGHT_LON}")
    print()
    
    # Generate positions and UUIDs
    positions: List[Tuple[float, float, str]] = []
    for i in range(100):
        lon, lat = generate_random_position()
        uid = generate_uuid()
        positions.append((lon, lat, uid))
    
    # Record start time
    start_time = time.time()
    
    # Create and start threads
    threads: List[threading.Thread] = []
    for i, (lon, lat, uid) in enumerate(positions, 1):
        thread = threading.Thread(
            target=post_position,
            args=(lon, lat, uid, i, len(positions))
        )
        threads.append(thread)
        thread.start()
    
    # Wait for all threads to complete
    print("⏳ Waiting for all threads to complete...")
    for thread in threads:
        thread.join()
    
    # Calculate elapsed time
    elapsed_time = time.time() - start_time
    
    # Summary
    print()
    print("=" * 60)
    print(f"✅ Successfully posted: {success_count}/100")
    if error_count > 0:
        print(f"❌ Failed: {error_count}/100")
    print(f"⏱️  Total time: {elapsed_time:.2f} seconds")
    print(f"📊 Average: {elapsed_time/100:.3f} seconds per request")
    print("=" * 60)
    
    # Save positions to file for reference
    output_file = "seed_positions.json"
    seed_data = {
        "total": 100,
        "successful": success_count,
        "failed": error_count,
        "elapsed_time_seconds": round(elapsed_time, 2),
        "average_time_per_request": round(elapsed_time / 100, 3),
        "positions": [
            {
                "uid": uid,
                "longitude": lon,
                "latitude": lat
            }
            for lon, lat, uid in positions
        ]
    }
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(seed_data, f, indent=2, ensure_ascii=False)
    
    print(f"💾 Saved position data to {output_file}")


if __name__ == "__main__":
    main()

