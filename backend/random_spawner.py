"""
Simplified Oktoberfest Visitor Simulation
----------------------------------------
A lightweight simulation that spawns visitors at random positions.
Maintains the same threading structure as the full simulation.
"""

import math
import random
import time
import uuid
import threading
import requests
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import List, Dict, Any

# Configuration
NUM_VISITORS = 30
MAX_WORKERS = 50
SIMULATION_DURATION = 5  # minutes
SPAWN_INTERVAL = 30.0    # seconds
BATCH_SIZE = 100
API_ENDPOINT = "https://wiesnflow.onrender.com/position"

# Bounding box for Theresienwiese
BOUNDS = {
    "min_lon": 11.545,
    "max_lon": 11.555,
    "min_lat": 48.130,
    "max_lat": 48.135
}

class APIClient:
    """Handles sending position updates to the REST API."""
    def __init__(self, endpoint: str, batch_size: int = 100):
        self.endpoint = endpoint
        self.batch_size = batch_size
        self.batch = []
        self.lock = threading.Lock()
        self.last_send_time = 0
    
    def add_position(self, visitor_id: str, lat: float, lon: float):
        """Add a position to the current batch."""
        with self.lock:
            self.batch.append({
                "uid": visitor_id,
                "lat": lat,
                "long": lon
            })
    
    def should_send(self) -> bool:
        """Check if it's time to send the batch to the API."""
        current_time = time.time()
        time_elapsed = current_time - self.last_send_time >= SPAWN_INTERVAL
        return time_elapsed and self.batch
    
    def send_batch(self) -> bool:
        """Send the current batch to the API."""
        if not self.batch:
            return True
            
        batch_to_send = self.batch[:self.batch_size]
        self.batch = self.batch[self.batch_size:]
        
        success = True
        for item in batch_to_send:
            try:
                response = requests.post(
                    self.endpoint,
                    json=item,
                    timeout=5
                )
                response.raise_for_status()
            except Exception as e:
                print(f"❌ Failed to send position: {e}")
                success = False
                # Requeue failed items
                with self.lock:
                    self.batch.append(item)
                continue
                
        if success:
            self.last_send_time = time.time()
            print(f"📡 Sent {len(batch_to_send)} positions to API")
            
        return success

def api_writer(stop_event: threading.Event, api_client: APIClient):
    """Background thread that sends position updates to the API."""
    while not stop_event.is_set() or api_client.batch:
        try:
            if api_client.should_send():
                api_client.send_batch()
            time.sleep(1)
        except Exception as e:
            print(f"Error in API writer: {e}")
            time.sleep(5)

def generate_random_positions(count: int) -> List[Dict[str, Any]]:
    """Generate random positions with better distribution across the entire map."""
    positions = []
    
    # Calculate map dimensions
    lat_range = BOUNDS["max_lat"] - BOUNDS["min_lat"]
    lon_range = BOUNDS["max_lon"] - BOUNDS["min_lon"]
    
    # Split the map into a grid and ensure coverage
    grid_size = 5  # 5x5 grid
    lat_step = lat_range / grid_size
    lon_step = lon_range / grid_size
    
    # Calculate how many points per grid cell (with some randomness)
    base_points = count // (grid_size * grid_size)
    extra_points = count % (grid_size * grid_size)
    
    # Generate points for each grid cell
    for i in range(grid_size):
        for j in range(grid_size):
            # Calculate cell bounds
            min_lat = BOUNDS["min_lat"] + (i * lat_step)
            max_lat = min_lat + lat_step
            min_lon = BOUNDS["min_lon"] + (j * lon_step)
            max_lon = min_lon + lon_step
            
            # Add extra points to some cells
            points_in_cell = base_points + (1 if (i * grid_size + j) < extra_points else 0)
            
            for _ in range(points_in_cell):
                # Choose a distribution type for this cell
                dist_type = random.choices(
                    ["uniform", "normal", "cluster"],
                    weights=[0.5, 0.3, 0.2],
                    k=1
                )[0]
                
                if dist_type == "uniform":
                    # Uniform distribution within the cell
                    lat = random.uniform(min_lat, max_lat)
                    lon = random.uniform(min_lon, max_lon)
                    
                elif dist_type == "normal":
                    # Normal distribution around cell center
                    center_lat = (min_lat + max_lat) / 2
                    center_lon = (min_lon + max_lon) / 2
                    std_dev = min(lat_step, lon_step) / 4  # Smaller spread for normal
                    
                    lat = random.normalvariate(center_lat, std_dev)
                    lon = random.normalvariate(center_lon, std_dev)
                    
                else:  # cluster
                    # Create a small cluster within the cell
                    center_lat = random.uniform(min_lat, max_lat)
                    center_lon = random.uniform(min_lon, max_lon)
                    std_dev = min(lat_step, lon_step) / 8  # Very tight cluster
                    
                    lat = random.normalvariate(center_lat, std_dev)
                    lon = random.normalvariate(center_lon, std_dev)
                
                # Ensure the point is within map bounds
                lat = max(BOUNDS["min_lat"], min(BOUNDS["max_lat"], lat))
                lon = max(BOUNDS["min_lon"], min(BOUNDS["max_lon"], lon))
                
                positions.append({
                    "uid": str(uuid.uuid4()),
                    "lat": lat,
                    "long": lon
                })
    
    # Shuffle to avoid any grid patterns in the order
    random.shuffle(positions)
    return positions

def run_simulation():
    """Run the simplified simulation."""
    print(f"🚀 Starting random position spawner")
    print(f"   API endpoint: {API_ENDPOINT}")
    print(f"   Duration: {SIMULATION_DURATION} minutes")
    print(f"   Spawn interval: {SPAWN_INTERVAL} seconds")
    print(f"   Start time: {datetime.now().strftime('%H:%M:%S')}")
    
    api_client = APIClient(API_ENDPOINT, BATCH_SIZE)
    
    # Start API writer thread
    stop_event = threading.Event()
    api_thread = threading.Thread(
        target=api_writer,
        args=(stop_event, api_client),
        daemon=True
    )
    api_thread.start()
    
    # Main simulation loop
    start_time = time.time()
    last_spawn = start_time
    total_positions = 0
    
    try:
        while time.time() - start_time < SIMULATION_DURATION * 60:
            current_time = time.time()
            sim_time = current_time - start_time
            
            # Spawn new random positions
            if current_time - last_spawn >= SPAWN_INTERVAL:
                print(f"\n⏱️  Spawning {NUM_VISITORS} new random positions at {sim_time/60:.1f} minutes")
                positions = generate_random_positions(NUM_VISITORS)
                
                # Add positions to batch
                for pos in positions:
                    api_client.add_position(pos["uid"], pos["lat"], pos["long"])
                
                total_positions += len(positions)
                last_spawn = current_time
                print(f"📊 Total positions generated: {total_positions}")
                print(f"📦 Pending API updates: {len(api_client.batch)}")
            
            # Sleep to prevent busy waiting
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nStopping simulation...")
    finally:
        # Cleanup
        stop_event.set()
        
        # Send any remaining positions
        print("\n🔄 Sending final batch of positions...")
        while api_client.batch:
            if not api_client.send_batch():
                time.sleep(1)
        
        # Final stats
        duration = time.time() - start_time
        print(f"\n=== Simulation Complete ===")
        print(f"⏱️  Duration: {duration/60:.1f} minutes")
        print(f"👥 Total positions generated: {total_positions}")
        
        # Wait for API writer to finish
        api_thread.join(timeout=5)

if __name__ == "__main__":
    run_simulation()
