# WiesnFlow Backend

FastAPI backend application for WiesnFlow with Supabase database integration.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env`
   - Fill in your Supabase credentials:
     - `SUPABASE_URL`: Your Supabase project URL
     - `SUPABASE_KEY`: Your Supabase anon/public key

3. **Run the application:**
   ```bash
   uvicorn main:app --reload
   ```

   The API will be available at:
   - API: http://localhost:8000
   - Docs: http://localhost:8000/docs
   - ReDoc: http://localhost:8000/redoc

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── database.py          # Supabase client configuration
│   └── routers/             # API route handlers
│       ├── __init__.py
│       └── health.py        # Health check endpoint
├── main.py                  # FastAPI application entry point
├── requirements.txt         # Python dependencies
├── .env.example            # Environment variables template
└── README.md               # This file
```

## API Endpoints

- `GET /` - Root endpoint with API information
- `GET /api/health` - Health check endpoint (tests database connection)

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Get your project URL and anon key from Settings > API
3. Add them to your `.env` file

## Development

The application uses:
- **FastAPI** for the web framework
- **Supabase** for database and backend services
- **Uvicorn** as the ASGI server

