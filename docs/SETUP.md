# Setup & Configuration

## Prerequisites
*   **Node.js**: v20 or higher.
*   **npm**: Included with Node.js.

## Environment Variables
Create a `.env` file in the root directory based on `.env.example`.

```ini
# Google Gemini API Key (Required for AI features)
# Get one here: https://aistudio.google.com/
VITE_GEMINI_API_KEY=your_gemini_key

# The Odds API Key (Required for Sharp Lines)
# Get one here: https://the-odds-api.com/
VITE_ODDS_API_KEY=your_odds_api_key

# Supabase (Optional - for Cloud Sync)
# Get one here: https://supabase.com/
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

The WNBA dashboard also requires backend environment variables in `server/.env`:

```ini
PORT=8787
SQLITE_PATH=server/data/edgelab.sqlite
ODDS_API_KEY=your_odds_api_key
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3-pro-preview
ALLOWED_ORIGIN=http://localhost:5173
```

## Local Development

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
    The root install also installs backend dependencies.

2.  **Start the App:**
    ```bash
    npm run dev
    ```
    This starts the local backend at `http://localhost:8787` and the frontend at `http://localhost:5173`.

The frontend Vite server proxies `/api` to the backend during local development. You should not need a second terminal for normal local use.

## Supabase Setup (Optional)
If you want to sync your bankroll and queue across devices:

1.  Create a Supabase project.
2.  Run the provided SQL initialization scripts (check `services/supabaseClient.ts` or project docs for schema). *Note: Schema details to be added.*
3.  Add the URL and Key to your `.env` file.

## Troubleshooting

*   **API Errors:** Check the browser console. If Gemini returns 400/403, verify your API key and quotas.
*   **Odds Not Loading:** The Odds API has usage limits. Check your dashboard if data stops appearing.
*   **WNBA Dashboard Fails to Load:** Verify `npm run dev` started both the backend and frontend, and confirm `PORT=8787` in `server/.env`.
*   **No Cached WNBA Odds:** Click refresh odds from the dashboard. The backend intentionally does not spend Odds API credits in the background.
