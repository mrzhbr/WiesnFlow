# WiesnFlow

An interactive crowd management system for Oktoberfest that provides real-time heatmaps and intelligent routing recommendations.

## Overview

WiesnFlow helps visitors and security personnel navigate Oktoberfest safely and efficiently by:

- **Real-time Heatmap**: Visualizes crowd density across the festival grounds using color-coded tiles
- **Location Sharing**: Users can voluntarily share their location to improve crowd data accuracy
- **Smart Routing**: Recommends optimal routes from U-Bahn stations to festival entrances based on current crowd levels
- **Security Mode**: Special view for security personnel to monitor crowd flow and manage overcrowded areas
- **Gamification**: Users earn coupons (e.g., 25% off Wilde Maus) by sharing their location for 2 minutes

## Features

### For Visitors
- Interactive map showing crowd density in real-time
- Location tracking with privacy controls
- Recommended routes from nearby U-Bahn stations
- Unlock special discounts by contributing location data
- Dark/light mode support

### For Security Personnel
- Toggle security mode for enhanced monitoring
- View all active routes and their status (available/blocked)
- Monitor overcrowded areas with visual indicators
- Real-time updates every 30 seconds

## Tech Stack

- **Frontend**: React Native (Expo), TypeScript, Mapbox GL
- **Backend**: FastAPI (Python), Supabase, Redis
- **Map Data**: Mapbox Directions API, Custom GeoJSON tiles

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Python 3.8+
- Expo CLI
- Mapbox API token
- Supabase account

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file with your credentials:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   MAPBOX_TOKEN=your_mapbox_token
   ```

5. Start the backend server:
   ```bash
   uvicorn main:app --reload
   ```

   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your configuration:
   ```env
   EXPO_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
   EXPO_PUBLIC_API_BASE_URL=http://localhost:8000
   ```

4. Start the Expo development server:
   ```bash
   npm start
   ```

5. Run on your preferred platform:
   - expo go: Scan the QR code displayed in the terminal or browser
   - iOS: `npm run ios` (requires macOS and Xcode)
   - Android: `npm run android` (requires Android Studio)
   - Web: `npm run web`

### Optional: Simulate Visitor Data

To test the heatmap with simulated visitor data:

```bash
cd backend
python simulate_visitors.py
```

## Project Structure

```
WiesnFlow/
├── backend/
│   ├── app/              # FastAPI application
│   ├── main.py           # API entry point
│   ├── requirements.txt  # Python dependencies
│   └── *.json            # Tile and location data
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── screens/      # Main app screens
│   │   ├── contexts/     # React contexts
│   │   ├── data/         # Static data files
│   │   └── utils/        # Utility functions
│   └── package.json      # Node dependencies
└── README.md
```


## License

See [LICENSE](LICENSE) file for details.

## Contributors

Built during HackaTUM 2025 by Niklas Burghardt, Moritz Huber, David Heundl und Lukas Vogel
