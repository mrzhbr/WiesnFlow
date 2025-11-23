import random
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import requests

# ===========================================
# CONFIG
# ===========================================
API_ENDPOINT = "https://wiesnflow.onrender.com/position"

SIMULATION_DURATION_MIN = 30       # Total duration in minutes
UPDATE_INTERVAL_SEC = 30           # Post new positions every 30 seconds
POSITIONS_PER_BATCH = 100          # Number of positions per batch
MAX_WORKERS = 50                   # Number of concurrent requests

# Map bounding box (Theresienwiese)
BOUNDS = {
    "min_lon": 11.545,
    "max_lon": 11.555,
    "min_lat": 48.130,
    "max_lat": 48.135
}

# Thread-safe counters
success_count = 0
error_count = 0
counter_lock = threading.Lock()

def generate_random_position():
    """Generate a random position within the bounds."""
    return {
        "uid": str(uuid.uuid4()),
        "lat": random.uniform(BOUNDS["min_lat"], BOUNDS["max_lat"]),
        "long": random.uniform(BOUNDS["min_lon"], BOUNDS["max_lon"])
    }

def send_position(index: int, total: int, payload: dict):
    """Send a single position to the API."""
    global success_count, error_count
    
    try:
        response = requests.post(API_ENDPOINT, json=payload, timeout=10)
        response.raise_for_status()
        
        with counter_lock:
            success_count += 1
            sc = success_count
            
        print(f"[{index}/{total}] ✅ Posted position ({payload['lat']:.6f}, {payload['long']:.6f}) for user {payload['uid']}")
        return True
    except Exception as e:
        with counter_lock:
            error_count += 1
            ec = error_count
            
        print(f"[{index}/{total}] ❌ Error posting position for {payload['uid']}: {e}")
        return False

def post_batch(batch_num: int, total_batches: int):
    """Post a batch of positions to the API."""
    positions = [generate_random_position() for _ in range(POSITIONS_PER_BATCH)]
    start_time = time.time()
    
    print(f"\n=== 🌟 Batch {batch_num}/{total_batches} ({datetime.now().strftime('%H:%M:%S')}) ===")
    print(f"Posting {len(positions)} random positions...")
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for i, pos in enumerate(positions, 1):
            future = executor.submit(send_position, i, len(positions), pos)
            futures.append(future)
        
        # Wait for all requests to complete
        results = [f.result() for f in futures]
    
    batch_time = time.time() - start_time
    success = sum(1 for r in results if r)
    failed = len(results) - success
    
    print(f"\n=== Batch {batch_num} Complete ===")
    print(f"✅ Successfully posted: {success}")
    print(f"❌ Failed: {failed}")
    print(f"⏱️  Batch time: {batch_time:.2f} seconds")
    print(f"📊 Total stats: {success_count} ✅ | {error_count} ❌\n")

def run_continuous_stream():
    """Run the continuous position streaming."""
    print(f"🚀 Starting CONTINUOUS RANDOM POSITION STREAM")
    print(f"   Duration: {SIMULATION_DURATION_MIN} minutes")
    print(f"   Interval: every {UPDATE_INTERVAL_SEC} seconds")
    print(f"   Positions per batch: {POSITIONS_PER_BATCH}")
    print(f"   API endpoint: {API_ENDPOINT}\n")
    
    start_time = time.time()
    end_time = start_time + (SIMULATION_DURATION_MIN * 60)
    batch_num = 0
    total_batches = (SIMULATION_DURATION_MIN * 60) // UPDATE_INTERVAL_SEC
    
    try:
        while time.time() < end_time:
            batch_num += 1
            batch_start = time.time()
            
            # Post the current batch
            post_batch(batch_num, total_batches)
            
            # Calculate sleep time until next batch
            elapsed = time.time() - batch_start
            sleep_time = max(0, UPDATE_INTERVAL_SEC - elapsed)
            
            if sleep_time > 0 and (time.time() + sleep_time) < end_time:
                print(f"⏳ Next batch in {sleep_time:.1f} seconds...\n")
                time.sleep(sleep_time)
            elif (time.time() + sleep_time) >= end_time:
                break
                
    except KeyboardInterrupt:
        print("\nStopping simulation...")
    finally:
        total_time = time.time() - start_time
        print("\n" + "=" * 60)
        print(f"🎉 Simulation Complete!")
        print(f"⏱️  Total time: {total_time/60:.1f} minutes")
        print(f"📊 Total positions posted: {success_count}")
        print(f"❌ Total errors: {error_count}")
        print("=" * 60)

if __name__ == "__main__":
    run_continuous_stream()