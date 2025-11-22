"""
Simulation script for 500 visitors moving around Oktoberfest.
- Creates 500 visitors with unique UUID v4 IDs
- Places them across the whole area but primarily towards tents (hotspots)
- Updates their position every minute using the /position endpoint
- Runs 50 simultaneous threads to handle updates
"""

import json
import random
import uuid
import os
import threading
import time
import math
from typing import List, Tuple, Dict
from datetime import datetime

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    print("❌ 'requests' library is required. Install it with: pip install requests")
    exit(1)

# Import tent locations from tiles.py
from app.tiles import OKTOBERFEST_TENTS

# Theresienwiese bounding box coordinates
TOP_LEFT_LAT = 48.136293
TOP_LEFT_LON = 11.544973
BOTTOM_RIGHT_LAT = 48.126496
BOTTOM_RIGHT_LON = 11.553518

# API configuration
API_BASE_URL = os.getenv("API_BASE_URL", "https://wiesnflow.onrender.com")
API_ENDPOINT = f"{API_BASE_URL}/position"

# Simulation configuration
NUM_VISITORS = 500
NUM_THREADS = 50
UPDATE_INTERVAL_SECONDS = 60  # 1 minute
SIMULATION_DURATION_MINUTES = None  # None = run indefinitely

# Movement parameters
MAX_STEP_SIZE_DEGREES = 0.0001  # Maximum movement per update (~11 meters)
TENT_ATTRACTION_PROBABILITY = 0.3  # Probability of moving towards a tent (vs random walk)

# Thread-safe structures
visitors_lock = threading.Lock()
stats_lock = threading.Lock()
print_lock = threading.Lock()

# Global statistics
total_updates = 0
successful_updates = 0
failed_updates = 0
simulation_running = True


class Visitor:
    """Represents a single visitor in the simulation."""
    
    def __init__(self, uid: str, initial_lon: float, initial_lat: float):
        self.uid = uid
        self.lon = initial_lon
        self.lat = initial_lat
        self.target_tent = None  # Current target tent (if any)
        self.updates_count = 0
        
    def move(self) -> Tuple[float, float]:
        """
        Move the visitor to a new position.
        Returns new (longitude, latitude) tuple.
        """
        # Decide movement strategy
        if random.random() < TENT_ATTRACTION_PROBABILITY and OKTOBERFEST_TENTS:
            # Move towards a tent
            if self.target_tent is None or random.random() < 0.2:
                # Choose a new target tent
                tent_name, tent_lon, tent_lat = random.choice(OKTOBERFEST_TENTS)
                self.target_tent = (tent_lon, tent_lat)
            
            # Move towards target tent
            target_lon, target_lat = self.target_tent
            
            # Calculate direction vector
            dir_lon = target_lon - self.lon
            dir_lat = target_lat - self.lat
            
            # Normalize and scale
            distance = math.sqrt(dir_lon**2 + dir_lat**2)
            if distance > 0:
                # Move a fraction of the distance (but cap at max step size)
                step_size = min(MAX_STEP_SIZE_DEGREES, distance * 0.1)
                self.lon += (dir_lon / distance) * step_size
                self.lat += (dir_lat / distance) * step_size
            else:
                # Already at tent, do random walk
                self._random_walk()
        else:
            # Random walk
            self._random_walk()
        
        # Keep within bounds
        self.lon = max(TOP_LEFT_LON, min(BOTTOM_RIGHT_LON, self.lon))
        self.lat = max(BOTTOM_RIGHT_LAT, min(TOP_LEFT_LAT, self.lat))
        
        self.updates_count += 1
        return (self.lon, self.lat)
    
    def _random_walk(self):
        """Perform a random walk step."""
        angle = random.uniform(0, 2 * math.pi)
        step_size = random.uniform(0, MAX_STEP_SIZE_DEGREES)
        self.lon += math.cos(angle) * step_size
        self.lat += math.sin(angle) * step_size


def generate_initial_position() -> Tuple[float, float]:
    """
    Generate an initial position for a visitor.
    Weighted towards tent locations (70% chance near tents, 30% random).
    """
    if random.random() < 0.7 and OKTOBERFEST_TENTS:
        # Place near a tent (within ~100 meters)
        tent_name, tent_lon, tent_lat = random.choice(OKTOBERFEST_TENTS)
        
        # Add random offset (approximately 100 meters = ~0.0009 degrees)
        offset_lon = random.uniform(-0.0009, 0.0009)
        offset_lat = random.uniform(-0.0009, 0.0009)
        
        lon = tent_lon + offset_lon
        lat = tent_lat + offset_lat
        
        # Ensure within bounds
        lon = max(TOP_LEFT_LON, min(BOTTOM_RIGHT_LON, lon))
        lat = max(BOTTOM_RIGHT_LAT, min(TOP_LEFT_LAT, lat))
        
        return (lon, lat)
    else:
        # Random position in the area
        lat = random.uniform(BOTTOM_RIGHT_LAT, TOP_LEFT_LAT)
        lon = random.uniform(TOP_LEFT_LON, BOTTOM_RIGHT_LON)
        return (lon, lat)


def update_visitor_position(visitor: Visitor) -> bool:
    """
    Update a single visitor's position via API.
    Returns True if successful, False otherwise.
    """
    global successful_updates, failed_updates, total_updates
    
    try:
        payload = {
            "long": visitor.lon,
            "lat": visitor.lat,
            "uid": visitor.uid
        }
        
        response = requests.post(API_ENDPOINT, json=payload, timeout=10)
        response.raise_for_status()
        
        with stats_lock:
            successful_updates += 1
            total_updates += 1
        
        return True
        
    except Exception as e:
        with stats_lock:
            failed_updates += 1
            total_updates += 1
        
        with print_lock:
            print(f"❌ Error updating visitor {visitor.uid[:8]}: {e}")
        
        return False


def worker_thread(visitor_batch: List[Visitor], thread_id: int):
    """
    Worker thread that updates positions for a batch of visitors.
    Runs continuously until simulation stops.
    """
    global simulation_running
    
    while simulation_running:
        # Move and update each visitor in this batch
        for visitor in visitor_batch:
            if not simulation_running:
                break
            
            # Move visitor
            visitor.move()
            
            # Update position via API
            success = update_visitor_position(visitor)
            
            if success:
                with print_lock:
                    print(f"[Thread {thread_id}] ✅ Updated {visitor.uid[:8]} → ({visitor.lat:.6f}, {visitor.lon:.6f})")
        
        # Wait for next update cycle
        time.sleep(UPDATE_INTERVAL_SECONDS)


def print_statistics():
    """Print current simulation statistics."""
    with stats_lock:
        success_rate = (successful_updates / total_updates * 100) if total_updates > 0 else 0
        with print_lock:
            print("\n" + "=" * 70)
            print(f"📊 Simulation Statistics")
            print(f"   Total Updates: {total_updates}")
            print(f"   Successful: {successful_updates} ({success_rate:.1f}%)")
            print(f"   Failed: {failed_updates}")
            print(f"   Active Visitors: {NUM_VISITORS}")
            print(f"   Update Interval: {UPDATE_INTERVAL_SECONDS} seconds")
            print("=" * 70 + "\n")


def main():
    """Main simulation function."""
    global simulation_running, total_updates, successful_updates, failed_updates
    
    # Reset statistics
    total_updates = 0
    successful_updates = 0
    failed_updates = 0
    
    print("🎪 Starting Oktoberfest Visitor Simulation")
    print(f"   Visitors: {NUM_VISITORS}")
    print(f"   Threads: {NUM_THREADS}")
    print(f"   Update Interval: {UPDATE_INTERVAL_SECONDS} seconds")
    print(f"   API Endpoint: {API_ENDPOINT}")
    print(f"   Tents: {len(OKTOBERFEST_TENTS)}")
    print()
    
    # Create visitors with initial positions
    print("👥 Creating visitors...")
    visitors: List[Visitor] = []
    for i in range(NUM_VISITORS):
        uid = str(uuid.uuid4())
        lon, lat = generate_initial_position()
        visitor = Visitor(uid, lon, lat)
        visitors.append(visitor)
    
    print(f"✅ Created {len(visitors)} visitors")
    print()
    
    # Distribute visitors across threads
    visitors_per_thread = NUM_VISITORS // NUM_THREADS
    remainder = NUM_VISITORS % NUM_THREADS
    
    print(f"📦 Distributing visitors across {NUM_THREADS} threads...")
    print(f"   Visitors per thread: {visitors_per_thread} (+ {remainder} extra)")
    print()
    
    # Create initial positions (first update)
    print("📍 Posting initial positions...")
    initial_success = 0
    initial_fail = 0
    
    for visitor in visitors:
        success = update_visitor_position(visitor)
        if success:
            initial_success += 1
        else:
            initial_fail += 1
    
    print(f"✅ Initial positions posted: {initial_success} successful, {initial_fail} failed")
    print()
    
    # Start worker threads
    print(f"🚀 Starting {NUM_THREADS} worker threads...")
    threads: List[threading.Thread] = []
    
    start_idx = 0
    for thread_id in range(NUM_THREADS):
        # Calculate batch size (distribute remainder across first threads)
        batch_size = visitors_per_thread + (1 if thread_id < remainder else 0)
        end_idx = start_idx + batch_size
        
        visitor_batch = visitors[start_idx:end_idx]
        thread = threading.Thread(
            target=worker_thread,
            args=(visitor_batch, thread_id),
            daemon=True
        )
        threads.append(thread)
        thread.start()
        
        print(f"   Thread {thread_id}: {len(visitor_batch)} visitors")
        start_idx = end_idx
    
    print()
    print("✅ All threads started. Simulation running...")
    print("   Press Ctrl+C to stop the simulation")
    print()
    
    # Print statistics periodically
    try:
        last_stats_time = time.time()
        stats_interval = 60  # Print stats every 60 seconds
        
        while True:
            time.sleep(5)  # Check every 5 seconds
            
            # Print statistics periodically
            if time.time() - last_stats_time >= stats_interval:
                print_statistics()
                last_stats_time = time.time()
            
            # Check if simulation should stop (if duration is set)
            if SIMULATION_DURATION_MINUTES is not None:
                # This would need to be tracked, but for now we run indefinitely
                pass
                
    except KeyboardInterrupt:
        print("\n\n⏹️  Stopping simulation...")
        simulation_running = False
        
        # Wait for threads to finish current cycle
        print("⏳ Waiting for threads to finish...")
        for thread in threads:
            thread.join(timeout=UPDATE_INTERVAL_SECONDS + 5)
        
        print_statistics()
        print("✅ Simulation stopped.")


if __name__ == "__main__":
    main()

