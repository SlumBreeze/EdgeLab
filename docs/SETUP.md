# Setup & Configuration

## Prerequisites
*   **Node.js**: v20 or higher.
*   **npm**: Included with Node.js.

## Environment Variables
Create a `.env` file in the root directory based on `.env.example`.

```ini
# Google Gemini API Key (Required for AI features)
# Get one here: https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_key

# The Odds API Key (Required for Sharp Lines)
# Get one here: https://the-odds-api.com/
ODDS_API_KEY=your_odds_api_key

# Supabase (Optional - for Cloud Sync)
# Get one here: https://supabase.com/
SUPABASE_URL=your_project_url
SUPABASE_KEY=your_anon_key
```

## Local Development

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Start the Dev Server:**
    ```bash
    npm run dev
    ```
    The app will run at `http://localhost:5173`.

## Supabase Setup (Optional)
If you want to sync your bankroll and queue across devices:

1.  Create a Supabase project.
2.  Run the provided SQL initialization scripts (check `services/supabaseClient.ts` or project docs for schema). *Note: Schema details to be added.*
3.  Add the URL and Key to your `.env` file.

## Troubleshooting

*   **API Errors:** Check the browser console. If Gemini returns 400/403, verify your API key and quotas.
*   **Odds Not Loading:** The Odds API has usage limits. Check your dashboard if data stops appearing.
