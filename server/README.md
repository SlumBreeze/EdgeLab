# EdgeLab Backend

Local Node/TypeScript backend for WNBA-only slate, odds, session, quota, and Gemini analysis workflows.

The backend exists because the WNBA dashboard needs server-side API keys, SQLite persistence, quota controls, and a single place to enforce conservative analysis rules. The frontend should not call Odds API or Gemini directly for this WNBA flow.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```

`npm run dev` starts the API at `http://localhost:8787` by default.

## Environment

Copy `.env.example` to `.env`.

`SQLITE_PATH` is optional and defaults to `server/data/edgelab.sqlite`.

```env
PORT=8787
SQLITE_PATH=server/data/edgelab.sqlite
ODDS_API_KEY=your_odds_api_key
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3-pro-preview
ALLOWED_ORIGIN=http://localhost:5173
```

## Local Frontend Pairing

For normal local use, start from the repo root:

```bash
npm run dev
```

The root dev script starts this backend and the Vite frontend together. The Vite proxy forwards `/api` calls to `http://localhost:8787`. For deployed or non-proxy setups, set `VITE_BACKEND_URL` in the frontend environment.

## Data & Spend Controls

- Dates and sessions are keyed to Eastern Time.
- SQLite stores the daily budget, slate cache, odds cache, analysis cache, and provider usage counters.
- WNBA odds are fetched only when `/api/odds/wnba?refresh=true` is called.
- `/api/analyze/all` uses cached odds and cached slate; it does not refresh odds.
- The analysis service builds a candidate board across moneyline, spread, and total. Gemini can recommend only a listed candidate from that board.
- Narrative/news context is graded as hard fact, supported angle, or soft narrative. Soft narrative can support a lean, but cannot create value without a priced candidate.

## API Contracts

`GET /api/session/today`

Returns the Eastern Time daily session. `needsBudget` is `true` until the frontend submits that day's budget.

`PUT /api/session/budget`

Body: `{ "budgetCents": 10000 }`

Sets the budget for the current Eastern Time date only.

`GET /api/slate/wnba?refresh=false`

Returns today's WNBA ESPN slate from the daily cache unless `refresh=true`.

`GET /api/odds/wnba?refresh=true`

Fetches WNBA odds only when `refresh=true`. Without refresh, it returns the current daily cache or a `409` when no cache exists. This prevents hidden Odds API spend.

`POST /api/analyze/:gameId`

Analyzes one game using cached slate and cached odds.

`POST /api/analyze/all`

Analyzes every cached slate game using cached odds. It does not refresh odds.

`GET /api/quota`

Returns API usage counters and the latest odds fetch time for the current Eastern Time date.

`GET /api/analysis/wnba`

Returns cached analysis results for the current Eastern Time date.

## Pass Codes

- `NO_EDGE`: no candidate cleared the value floor.
- `NO_MARKET_DATA`: required slate or odds data is missing.
- `STALE_INJURY_DATA`: injury/availability context is too weak or stale.
- `STATS_CONFLICT`: the priced candidate conflicts with the statistical profile.
- `AI_MARKET_SWITCH`: Gemini tried to evaluate a side, book, line, or market that was not on the candidate board.
- `MARKET_OVERREACTION`: the price move is not supported by hard data.
- `LOW_CONFIDENCE`: the recommendation lacks enough confidence to size a wager.
- `MISSING_ROTATION_DATA`: player availability or rotation context is missing.
- `AI_MARKET_SWITCH`: Gemini tried to evaluate a different side or market.
- `AI_ERROR`: Gemini failed or timed out.
