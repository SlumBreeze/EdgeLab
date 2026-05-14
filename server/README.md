# EdgeLab Backend

Local Node/TypeScript backend for WNBA-only slate, odds, session, quota, and Gemini analysis workflows.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```

## Environment

Copy `.env.example` to `.env`.

`SQLITE_PATH` is optional and defaults to `server/data/edgelab.sqlite`.

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
