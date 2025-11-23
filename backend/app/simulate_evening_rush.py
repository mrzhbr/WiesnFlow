"""
Enhanced Oktoberfest Evening Rush Simulation
------------------------------------------
Simulates realistic visitor movement patterns during the evening rush hour.
Features:
- Natural tent filling and emptying
- Purposeful movement between tents and POIs
- Smooth, visually appealing movement patterns
- Threaded architecture for performance
- Historical position tracking
"""

import math
import random
import time
import uuid
import threading
import queue
import os
import requests
from datetime import datetime, timedelta
from enum import Enum, auto
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Tuple, Optional, Any
import json

# Import POIs from tiles
from app.tiles import OKTOBERFEST_TENTS

# Configuration
# Map boundaries
BOUNDS = {
    "min_lon": 11.545,
    "max_lon": 11.555,
    "min_lat": 48.130,
    "max_lat": 48.135,
}

NUM_VISITORS = 100  # Increased to 2000 visitors
MAX_WORKERS = 50
POSITION_UPDATE_INTERVAL = 1.0  # seconds
SIMULATION_DURATION = 5  # minutes
BATCH_SIZE = 100  # Batch size for API calls
QUEUE_MAX_SIZE = 10000
API_UPDATE_INTERVAL = 30.0  # Send updates to API every 30 seconds
API_ENDPOINT = "https://wiesnflow.onrender.com/position"


# Define visitor states
class VisitorState(Enum):
    WALKING = auto()
    DWELLING = auto()
    LEAVING_TENT = auto()
    GOING_TO_POI = auto()

# Enhanced POI configuration with visual grouping
POI_GROUPS = {
    # Main tent area
    "tent_area": [
        ("schottenhammel", 11.548353, 48.132072, "tent"),
        ("loewenbraeu", 11.549452, 48.130993, "tent"),
        ("hacker_festzelt", 11.548750, 48.132990, "tent"),
        ("paulaner", 11.547958, 48.131006, "tent"),
        ("kaefer", 11.547610, 48.130425, "tent"),
        ("augustiner", 11.549934, 48.132894, "tent"),
    ],
    # Attraction area
    "attraction_area": [
        ("wilde_maus", 11.551921, 48.132814, "attraction"),
        ("teufelsrad", 11.551595, 48.132216, "attraction"),
        ("hexenschaukel", 11.551471, 48.132642, "attraction"),
    ],
    # Food area
    "food_area": [
        ("kalbsbratierei_heimer", 11.550964, 48.133435, "food"),
        ("cafe_kaiserschmarn_rischart", 11.550630, 48.130582, "food")
    ]
}

# Flatten POIs for easy access
ALL_POIS = [poi for group in POI_GROUPS.values() for poi in group]

# Thread-safe position storage (aktuell nicht für API genutzt, aber gelassen falls später gebraucht)
class PositionStorage:
    def __init__(self, max_size: int = QUEUE_MAX_SIZE):
        self.positions = {}
        self.queue = queue.Queue(maxsize=max_size)
        self.lock = threading.Lock()
        self.last_flush = time.time()
        
    def update_position(self, visitor_id: str, lon: float, lat: float, 
                       state: str, current_poi: Optional[str] = None):
        with self.lock:
            self.positions[visitor_id] = {
                "visitor_id": visitor_id,
                "longitude": lon,
                "latitude": lat,
                "state": state,
                "current_poi": current_poi,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Add to queue if not full
            if not self.queue.full():
                self.queue.put_nowait(self.positions[visitor_id])
    
    def get_positions(self) -> Dict[str, Any]:
        with self.lock:
            return self.positions.copy()
    
    def get_batch(self, batch_size: int) -> List[Dict]:
        batch = []
        while len(batch) < batch_size and not self.queue.empty():
            try:
                batch.append(self.queue.get_nowait())
            except queue.Empty:
                break
        return batch

class APIClient:
    """Handles sending position updates to the REST API."""
    
    def __init__(self, endpoint: str, batch_size: int = 100):
        self.endpoint = endpoint
        self.batch_size = batch_size
        self.last_send_time = 0
        self.batch = []
        self.lock = threading.Lock()
    
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
        time_elapsed = current_time - self.last_send_time >= API_UPDATE_INTERVAL
        return time_elapsed and self.batch
    
    def send_batch(self) -> bool:
        """Send the current batch to the API, one position at a time."""
        if not self.batch:
            return True
            
        batch_to_send = []
        with self.lock:
            batch_to_send = self.batch[:self.batch_size]
            self.batch = self.batch[self.batch_size:]
        
        if not batch_to_send:
            return True
            
        success = True
        failed_items = []
        
        for item in batch_to_send:
            try:
                response = requests.post(
                    self.endpoint,
                    json=item,
                    headers={"Content-Type": "application/json"},
                    timeout=5
                )
                
                if response.status_code != 200:
                    print(f"❌ API error for {item['uid']}: {response.status_code} - {response.text}")
                    success = False
                    failed_items.append(item)
                    
            except Exception as e:
                print(f"❌ Failed to send {item['uid']} to API: {str(e)}")
                success = False
                failed_items.append(item)
        
        if success:
            print(f"📡 Sent {len(batch_to_send)} positions to API")
            self.last_send_time = time.time()
        elif failed_items:
            print(f"⚠️  {len(failed_items)} positions failed to send, requeuing...")
            with self.lock:
                self.batch = failed_items + self.batch
        
        return success

# API Client instance
api_client = APIClient(API_ENDPOINT, BATCH_SIZE)

def api_writer(stop_event: threading.Event):
    """Background thread that sends position updates to the API."""
    while not stop_event.is_set() or api_client.batch:
        try:
            if api_client.should_send():
                api_client.send_batch()
            time.sleep(1)  # Check every second
        except Exception as e:
            print(f"❌ Error in API writer: {e}")
            time.sleep(5)  # Wait before retrying

# Update the Visitor class with the new behavior
class Visitor:
    def __init__(self, visitor_id: str, start_lon: float, start_lat: float, spawn_time: float, force_lower_half: bool = False):
        self.id = visitor_id
        
        # If force_lower_half is True, ensure the visitor is in the lower half of the map
        if force_lower_half:
            # Calculate the vertical middle of the map
            mid_lat = (BOUNDS["min_lat"] + BOUNDS["max_lat"]) / 2
            # Ensure the point is in the lower half
            adjusted_lat = min(max(start_lat, BOUNDS["min_lat"]), mid_lat)
            self.lat = adjusted_lat
            self.lon = start_lon  # Keep the original longitude
        else:
            self.lon = start_lon
            self.lat = start_lat
        self.state = VisitorState.WALKING
        self.target_poi = None
        self.start_time = spawn_time
        self.dwell_end = None
        self.walk_start = None
        self.walk_end = None
        self.current_poi = None
        self.visit_count = 0
        self.last_area = None
        self.walking_speed = random.uniform(0.9, 1.1)  # ±10% speed variation
        self.wander_angle = random.uniform(0, 2 * math.pi)  # Random starting angle for wandering
        self.wander_since = 0  # How long has this visitor been wandering
        self.walk_variance = random.uniform(0.00001, 0.00003)  # For natural movement variation
        
        # Determine visitor type (40% tent lovers, 45% balanced, 15% roamers)
        r = random.random()
        if r < 0.4:
            self.visitor_type = "tent_lover"
            self.poi_attraction = 0.7  # Higher chance to visit POIs
        elif r < 0.85:
            self.visitor_type = "balanced"
            self.poi_attraction = 0.4
        else:
            self.visitor_type = "roamer"
            self.poi_attraction = 0.1  # Mostly just wanders
            
        self.choose_initial_behavior(spawn_time)

    def choose_initial_behavior(self, current_time: float):
        """Choose initial behavior based on visitor type"""
        if self.visitor_type == "roamer":
            self.start_wandering(current_time)
        else:
            # Tent lovers and balanced visitors start at tents
            if random.random() < 0.8 or self.visitor_type == "tent_lover":
                self.choose_poi_by_type("tent", current_time)
            else:
                self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)

    def start_wandering(self, current_time: float):
        """Start wandering behavior with natural movement"""
        self.state = VisitorState.WALKING
        self.wander_since = current_time
        self.wander_angle = (self.wander_angle + random.uniform(-0.5, 0.5)) % (2 * math.pi)
        
        # Calculate new position based on angle and speed
        distance = 0.0001 * self.walking_speed
        new_lon = self.lon + math.cos(self.wander_angle) * distance
        new_lat = self.lat + math.sin(self.wander_angle) * distance
        
        # Keep within bounds
        new_lon = max(11.545, min(11.555, new_lon))
        new_lat = max(48.130, min(48.135, new_lat))
        
        self.walk_start = (self.lon, self.lat)
        self.walk_end = (new_lon, new_lat)
        self.start_time = current_time
        self.walk_duration = random.uniform(3, 8)  # Wander for 3-8 seconds

    def ease_in_out(self, t: float) -> float:
        """Smooth easing function for natural movement"""
        return t * t * (3 - 2 * t)
        
    def update(self, current_time: float, sim_time: float) -> bool:
        """Update visitor state and position"""
        if self.state == VisitorState.WALKING:
            # Add some natural movement variation
            if random.random() < 0.05:  # 5% chance to slightly adjust direction
                self.wander_angle += random.uniform(-0.2, 0.2)
                
            progress = min(1.0, (current_time - self.start_time) / self.walk_duration)
            progress = self.ease_in_out(progress)
            
            # Add some natural movement variation
            jitter = (random.random() - 0.5) * self.walk_variance
            jitter_lat = (random.random() - 0.5) * self.walk_variance
            
            # Update position
            self.lon = self.walk_start[0] + (self.walk_end[0] - self.walk_start[0]) * progress + jitter
            self.lat = self.walk_start[1] + (self.walk_end[1] - self.walk_start[1]) * progress + jitter_lat
            
            # Keep within bounds
            self.lon = max(11.545, min(11.555, self.lon))
            self.lat = max(48.130, min(48.135, self.lat))
            
            if progress >= 1.0:  # Reached destination
                if self.target_poi and self.target_poi[3] != "wander":
                    self.arrive_at_poi(current_time, sim_time)
                else:
                    # Continue wandering
                    if random.random() < 0.3:  # 30% chance to pause briefly
                        self.state = VisitorState.DWELLING
                        self.dwell_end = current_time + random.uniform(2, 5)
                    else:
                        self.start_wandering(current_time)
                return True
                
        elif self.state == VisitorState.DWELLING:
            if current_time >= self.dwell_end:
                if self.visitor_type == "roamer" or random.random() < 0.7:
                    self.start_wandering(current_time)
                else:
                    self.leave_poi(current_time)
                return True
                
        return False

    def arrive_at_poi(self, current_time: float, sim_time: float):
        """Handle arrival at a POI"""
        if not self.target_poi:
            self.start_wandering(current_time)
            return
            
        self.current_poi = self.target_poi[0]
        self.visit_count += 1
        self.state = VisitorState.DWELLING
        
        # Determine dwell time based on POI type
        if self.target_poi[3] == "tent":
            dwell_minutes = random.uniform(3, 5)  # 3-5 minutes in tents
        elif self.target_poi[3] == "attraction":
            dwell_minutes = random.uniform(1, 2)  # 1-2 minutes at attractions
        elif self.target_poi[3] == "food":
            dwell_minutes = random.uniform(1, 2)  # 1-2 minutes at food stands
        else:
            dwell_minutes = random.uniform(0.5, 1.5)  # Short stay for other POIs
            
        self.dwell_end = current_time + (dwell_minutes * 60)

    def leave_poi(self, current_time: float):
        """Choose next destination after leaving a POI"""
        current_type = self.target_poi[3] if self.target_poi else None
        
        if current_type == "tent":
            # After tent, choose next destination based on visitor type
            if self.visitor_type == "tent_lover" and random.random() < 0.7:
                # 70% chance to stay in tent area
                if random.random() < 0.3:  # 30% chance to go to another tent
                    self.choose_poi_by_type("tent", current_time)
                else:
                    self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)
            else:
                # Balanced and roamers explore more
                if random.random() < self.poi_attraction:
                    self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)
                else:
                    self.start_wandering(current_time)
        else:
            # After POI, decide where to go next
            if random.random() < 0.7:  # 70% chance to go to a tent
                self.choose_poi_by_type("tent", current_time)
            elif random.random() < 0.5:  # 15% chance to go to another POI
                other_types = [t for t in ["attraction", "food"] if t != current_type]
                if other_types:
                    self.choose_poi_by_type(random.choice(other_types), current_time)
                else:
                    self.start_wandering(current_time)
            else:  # 15% chance to start wandering
                self.start_wandering(current_time)
        
        self.state = VisitorState.WALKING

    def choose_initial_target(self, current_time: float):
        """Choose first target with staggered timing for better flow"""
        # Roamer: eher erstmal über's Gelände
        if self.profile == "roamer":
            r = random.random()
            if r < 0.6:
                self.choose_random_ground_point(current_time)
            elif r < 0.8:
                self.choose_poi_by_type("attraction", current_time)
            else:
                self.choose_poi_by_type("tent", current_time)
            return

        # Andere: Fokus auf Zelte, aber nicht 100%
        r = random.random()
        if r < 0.65:  # 65% starten in Zelten
            self.choose_poi_by_type("tent", current_time)
        elif r < 0.85:  # 20% starten bei Attraktionen/Food
            self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)
        else:  # 15% starten irgendwo auf dem Gelände
            self.choose_random_ground_point(current_time)

    def choose_poi_by_type(self, poi_type: str, current_time: float):
        """Choose a POI of specific type with some randomness"""
        if poi_type == "tent":
            available_tents = POI_GROUPS["tent_area"].copy()
            random.shuffle(available_tents)
            self.target_poi = available_tents[0]
        elif poi_type == "attraction":
            self.target_poi = random.choice(POI_GROUPS["attraction_area"])
        elif poi_type == "food":
            self.target_poi = random.choice(POI_GROUPS["food_area"])
        else:
            # Fallback: random ground
            self.choose_random_ground_point(current_time)
            return
        
        self.start_movement(current_time)

    def choose_random_ground_point(self, current_time: float):
        """
        Choose a random point on the festival grounds.
        Typ 'ground' sorgt dafür, dass Leute sichtbar über das Gelände verteilt sind.
        """
        # Bounding Box grob um die Theresienwiese (wie bei Startpositionen)
        lon = random.uniform(11.545, 11.555)
        lat = random.uniform(48.130, 48.135)
        name = f"ground_{uuid.uuid4().hex[:8]}"
        self.target_poi = (name, lon, lat, "ground")
        self.start_movement(current_time)

    def start_movement(self, current_time: float):
        """Initialize movement parameters"""
        self.walk_start = (self.lon, self.lat)
        self.walk_end = (self.target_poi[1], self.target_poi[2])
        self.start_time = current_time
        
        # Calculate walk duration based on distance (longer for first move)
        dist = math.hypot(
            self.walk_end[0] - self.walk_start[0],
            self.walk_end[1] - self.walk_start[1]
        )
        base_speed = 0.00005  # degrees per second
        self.walk_duration = (dist / base_speed) * random.uniform(0.8, 1.2)
        
        # First movement is slower to create initial spread
        if self.visit_count == 0:
            self.walk_duration *= 1.5
            
def update(self, current_time: float, sim_time: float) -> bool:
    """Update visitor state and position"""
    if self.state == VisitorState.WALKING:

        # 5% chance to slightly change wandering direction
        if random.random() < 0.05:
            self.wander_angle += random.uniform(-0.2, 0.2)

        progress = min(1.0, (current_time - self.start_time) / self.walk_duration)
        progress = self.ease_in_out(progress)

        # Natural jitter for more organic movement
        jitter = (random.random() - 0.5) * self.walk_variance
        jitter_lat = (random.random() - 0.5) * self.walk_variance

        # Update position
        self.lon = self.walk_start[0] + (self.walk_end[0] - self.walk_start[0]) * progress + jitter
        self.lat = self.walk_start[1] + (self.walk_end[1] - self.walk_start[1]) * progress + jitter_lat

        # Clamp to event area
        self.lon = max(11.545, min(11.555, self.lon))
        self.lat = max(48.130, min(48.135, self.lat))

        # === Boundary Bounce Fix ===
        if self.lon <= 11.545 or self.lon >= 11.555:
            self.wander_angle = math.pi - self.wander_angle

        if self.lat <= 48.130 or self.lat >= 48.135:
            self.wander_angle = -self.wander_angle
        # ============================

        # If destination reached
        if progress >= 1.0:
            # If target was a POI – enter it
            if self.target_poi and self.target_poi[3] != "wander":
                self.arrive_at_poi(current_time, sim_time)
                return True

            # If roaming: continue wandering or briefly pause
            if random.random() < 0.3:
                self.state = VisitorState.DWELLING
                self.dwell_end = current_time + random.uniform(2, 5)
            else:
                self.start_wandering(current_time)

            return True

    elif self.state == VisitorState.DWELLING:
        if current_time >= self.dwell_end:

            # Roamers or non-POI visitors restart wandering often
            if self.visitor_type == "roamer" or random.random() < 0.7:
                self.start_wandering(current_time)
            else:
                self.leave_poi(current_time)

            return True

    return False


    def ease_in_out(self, t: float) -> float:
        """Smooth easing function for natural movement"""
        return t * t * (3 - 2 * t)

    def arrive_at_poi(self, current_time: float, sim_time: float):
        """Handle arrival at a POI"""
        self.current_poi = self.target_poi[0]
        self.visit_count += 1
        self.state = VisitorState.DWELLING

        poi_type = self.target_poi[3]

        # Determine dwell time based on POI type and simulation progress
        if poi_type == "tent":
            # Early in sim: longer stays, later: etwas kürzer
            progress = sim_time / (SIMULATION_DURATION * 60)
            dwell_minutes = 2.5 + (1.5 * (1 - progress))  # grob 2.5–4 Minuten
        elif poi_type in ("attraction", "food"):
            dwell_minutes = random.uniform(1.0, 2.5)  # etwas kürzer, mehr Bewegung
        elif poi_type == "ground":
            # Auf offenem Gelände stehen Leute nicht so lange
            dwell_minutes = random.uniform(0.5, 1.5)
        else:
            dwell_minutes = random.uniform(1.0, 2.0)
            
        self.dwell_end = current_time + (dwell_minutes * 60)

    def leave_poi(self, current_time: float):
        """Choose next destination after leaving a POI"""
        current_type = self.target_poi[3] if self.target_poi else None

        # Profile-spezifische Wahrscheinlichkeiten
        def prob_tent_roam():
            if self.profile == "tent_lover":
                return 0.6
            elif self.profile == "balanced":
                return 0.45
            else:  # roamer
                return 0.35

        def prob_ground_roam():
            if self.profile == "roamer":
                return 0.5
            elif self.profile == "balanced":
                return 0.3
            else:  # tent_lover
                return 0.2

        if current_type == "tent":
            # Nach dem Zelt:
            # klarer Fluss: Zelt -> Attraktion/Food oder Gelände, aber auch wieder Zelte
            r = random.random()
            p_ground = prob_ground_roam()
            p_tent = prob_tent_roam()
            # Rest geht zu Attraktionen/Food
            if r < p_ground:
                self.choose_random_ground_point(current_time)
            elif r < p_ground + p_tent:
                self.choose_poi_by_type("tent", current_time)
            else:
                self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)

        elif current_type in ("attraction", "food"):
            # Von Attraktion/Food: klarer Fluss zurück in Zelte + etwas Gelände
            r = random.random()
            p_tent = prob_tent_roam()
            p_ground = prob_ground_roam()
            if r < p_tent:
                self.choose_poi_by_type("tent", current_time)
            elif r < p_tent + p_ground:
                self.choose_random_ground_point(current_time)
            else:
                # anderer POI-Typ (z.B. attraction -> food)
                other_types = [t for t in ["attraction", "food"] if t != current_type]
                if other_types:
                    self.choose_poi_by_type(random.choice(other_types), current_time)
                else:
                    self.choose_random_ground_point(current_time)

        elif current_type == "ground":
            # Vom offenen Gelände: je nach Profil
            r = random.random()
            if self.profile == "roamer":
                # Roamer bleiben viel auf dem Gelände, gehen aber ab und zu in Zelte/POIs
                if r < 0.5:
                    self.choose_random_ground_point(current_time)
                elif r < 0.8:
                    self.choose_poi_by_type("tent", current_time)
                else:
                    self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)
            elif self.profile == "balanced":
                if r < 0.4:
                    self.choose_poi_by_type("tent", current_time)
                elif r < 0.7:
                    self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)
                else:
                    self.choose_random_ground_point(current_time)
            else:  # tent_lover
                if r < 0.6:
                    self.choose_poi_by_type("tent", current_time)
                elif r < 0.8:
                    self.choose_poi_by_type(random.choice(["attraction", "food"]), current_time)
                else:
                    self.choose_random_ground_point(current_time)
        else:
            # Fallback
            self.choose_poi_by_type("tent", current_time)
        
        self.state = VisitorState.WALKING

def run_simulation():
    """Run the enhanced Oktoberfest simulation"""
    print(f"🚀 Starting enhanced Oktoberfest simulation with {NUM_VISITORS} visitors...")
    
    # Stagger visitor creation over first 5 minutes
    def create_visitors():
        visitors = []
        start_time = time.time()
        bottom_third_lat = 48.130 + (48.135 - 48.130) * (2/3)  # Calculate bottom third boundary
        
        for i in range(NUM_VISITORS):
            # Create visitors in waves
            if i % 1000 == 0 and i > 0:
                time.sleep(2)  # Small delay between waves
                
            # Determine if this visitor should be in the bottom third (10% chance)
            force_bottom_third = (i % 10 == 0)  # Every 10th visitor (10%)
            
            if force_bottom_third:
                # Force position in bottom third of the map
                lon = random.uniform(11.545, 11.555)  # Full width
                lat = random.uniform(48.130, bottom_third_lat)  # Bottom third only
                
                visitors.append(Visitor(
                    str(uuid.uuid4()),
                    lon, lat,
                    start_time + random.uniform(0, 300),  # Stagger over 5 minutes
                    force_lower_half=True  # Ensure they stay in the bottom half
                ))
            else:
                # Original distribution for other visitors
                side = random.choice(["top", "right", "bottom", "left"])
                if side == "top":
                    lon = random.uniform(11.545, 11.555)
                    lat = 48.134
                elif side == "right":
                    lon = 11.555
                    lat = random.uniform(48.130, 48.135)
                elif side == "bottom":
                    lon = random.uniform(11.545, 11.555)
                    lat = 48.130
                else:  # left
                    lon = 11.545
                    lat = random.uniform(48.130, 48.135)
                    
                visitors.append(Visitor(
                    str(uuid.uuid4()),
                    lon, lat,
                    start_time + random.uniform(0, 300)  # Stagger over 5 minutes
                ))
        return visitors

    print("Creating visitors...")
    visitors = create_visitors()
    
    # Start API writer thread
    stop_event = threading.Event()
    api_thread = threading.Thread(
        target=api_writer,
        args=(stop_event,),
        daemon=True
    )
    api_thread.start()
    
    # Main simulation loop
    start_time = time.time()
    last_stats = start_time
    
    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            while time.time() - start_time < SIMULATION_DURATION * 60:
                current_time = time.time()
                sim_time = current_time - start_time
                
                # Process visitors in batches
                batch_size = max(100, len(visitors) // 100)
                batches = [visitors[i:i + batch_size] for i in range(0, len(visitors), batch_size)]
                
                # Submit batches to thread pool
                futures = [
                    executor.submit(
                        lambda b: [v.update(current_time, sim_time) for v in b],
                        batch
                    )
                    for batch in batches
                ]
                
                # Wait for updates and collect results
                updated_visitors = []
                for batch, future in zip(batches, futures):
                    results = future.result()
                    updated_visitors.extend([v for v, updated in zip(batch, results) if updated])
                
                # Update positions in API client
                for visitor in updated_visitors:
                    api_client.add_position(
                        visitor_id=visitor.id,
                        lat=visitor.lat,
                        lon=visitor.lon
                    )
                
                # Log stats every 30 seconds
                if current_time - last_stats >= 30:
                    state_counts = {}
                    poi_counts = {}
                    for v in visitors:
                        state = v.state.name.lower()
                        state_counts[state] = state_counts.get(state, 0) + 1
                        if v.current_poi:
                            poi_counts[v.current_poi] = poi_counts.get(v.current_poi, 0) + 1
                    
                    print(f"\n🕒 {datetime.now().strftime('%H:%M:%S')}")
                    print("Visitor States:")
                    for state, count in sorted(state_counts.items()):
                        print(f"  {state}: {count}")
                    
                    print("\nTop POIs / Ground spots:")
                    for poi, count in sorted(poi_counts.items(), key=lambda x: -x[1])[:10]:
                        print(f"  {poi}: {count}")
                    
                    last_stats = current_time
                
                # Maintain consistent update rate
                elapsed = time.time() - current_time
                sleep_time = max(0, POSITION_UPDATE_INTERVAL - elapsed)
                if sleep_time > 0:
                    time.sleep(sleep_time)
                    
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
        print(f"👥 Total visitors: {len(visitors)}")
        print(f"📦 Final batch size: {len(api_client.batch)}")
        
        # Wait for API writer to finish
        api_thread.join(timeout=5)

if __name__ == "__main__":
    run_simulation()
