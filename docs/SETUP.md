# Setup & Configuration

## Prerequisites

- Node.js 20 or higher
- npm

## Environment Variables

Create a root `.env` from `.env.example`:

```ini
VITE_AUTH_REQUIRED=false
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_BACKEND_URL=
```

Provider secrets belong only in `server/.env`:

```ini
PORT=8787
SQLITE_PATH=server/data/edgelab.sqlite
ODDS_API_KEY=your_odds_api_key
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.1-pro-preview
ALLOWED_ORIGIN=http://localhost:5173
AUTH_REQUIRED=false
SUPABASE_URL=your_project_url
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
ALLOWED_USER_IDS=your_supabase_user_uuid
```

Never put a Supabase secret or `service_role` key in a `VITE_` variable. The
publishable key is intentionally usable by a browser; identity and access are
enforced by Supabase Auth plus the backend user-ID allowlist.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the frontend and backend:

   ```bash
   npm run dev
   ```

The frontend runs at `http://localhost:5173` and proxies `/api` to the backend
at `http://localhost:8787`.

Local development defaults to `AUTH_REQUIRED=false` and
`VITE_AUTH_REQUIRED=false`. To exercise the real gate locally, set both to
`true` and complete the Supabase setup below.

## Private Supabase Auth Setup

No Supabase or Google settings are changed automatically by this repository.

1. Create or select a Supabase project.
2. In **Project Settings → API Keys**, copy the project URL and the
   **publishable** key. Do not use a secret or legacy `service_role` key.
3. In **Authentication → Providers → Google**, enable Google and configure its
   OAuth client ID and secret.
4. In **Authentication → URL Configuration**, set the production **Site URL**
   to the exact deployed frontend origin. Add the exact production URL and
   `http://localhost:5173/**` to the redirect allowlist as appropriate.
5. Sign in once with the account that should own EdgeLab. In
   **Authentication → Users**, copy that user's immutable UUID.
6. Configure the deployed frontend build:

   ```ini
   VITE_AUTH_REQUIRED=true
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

7. Configure the deployed backend at runtime:

   ```ini
   NODE_ENV=production
   AUTH_REQUIRED=true
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ALLOWED_USER_IDS=the-user-uuid-copied-above
   ALLOWED_ORIGIN=https://your-exact-frontend-origin
   ODDS_API_KEY=stored-as-a-runtime-secret
   GEMINI_API_KEY=stored-as-a-runtime-secret
   ```

   Multiple exact frontend origins or user UUIDs can be comma-separated.
   Wildcard origins are not supported.

8. Optionally disable new-user signups after the intended user exists. The
   backend allowlist denies every non-listed account regardless, but disabling
   signups reduces unnecessary Auth users.

When required auth is incomplete, the frontend remains locked and the backend
returns `AUTH_NOT_CONFIGURED` without executing API actions. When Supabase Auth
cannot verify a session, the backend returns `AUTH_UNAVAILABLE` and also
performs no API action.

## Production Container

The Docker image builds both the Vite frontend and TypeScript backend. The Node
backend serves `/api`, `/healthz`, and the static frontend from one Cloud Run
service. `VITE_` Auth variables are build-time public configuration. Odds and
Gemini keys, the backend Supabase values, and `ALLOWED_USER_IDS` are runtime
variables and must not be passed as Docker build arguments.

## Troubleshooting

- **Login redirects back without a session:** Verify the exact Site URL and
  redirect allowlist in Supabase, plus the authorized origins and callback URL
  in the Google OAuth client.
- **`ACCESS_DENIED`:** The session is valid, but its Supabase user UUID is not
  present in backend `ALLOWED_USER_IDS`.
- **`AUTH_NOT_CONFIGURED`:** Required backend Auth variables or the allowlist
  are missing.
- **CORS error:** `ALLOWED_ORIGIN` must exactly match the browser origin,
  including scheme and port.
- **No cached odds:** Click refresh odds. The backend intentionally does not
  spend Odds API credits in the background.
