# Architecture

EdgeLab is a single-page React app that runs an end-to-end betting workflow: Scout → Queue → Card → Tracker. The current branch also includes a backend-backed WNBA dashboard for daily slate analysis, odds caching, API quota controls, and Gemini validation.

## Runtime Flow

1) Scout (Discovery)
- Source: Odds API via `services/oddsService.ts` (NBA/NFL/NHL).
- Slate grouping uses ET (`America/New_York`) to avoid timezone drift.
- Cadence windows (First/Second/Lock) gate scans.
- Quick Scan uses Gemini Search and returns RED/YELLOW/WHITE.
- RED/YELLOW games are auto-added to Queue with `autoAnalyze: true`.

2) Queue (Analysis)
- Auto-analysis runs sequentially for games marked `autoAnalyze`.
- Steps:
  - Fetch odds for a single game.
  - Extract Pinnacle (sharp) + soft books.
  - Compute edge + run Stoic Handicapper analysis.
- Results: PLAYABLE or PASS stored on each queued game.

3) Card (Execution)
- Card is manual by default.
- Users decide which PLAYABLE games to log.

4) Tracker (Performance)
- Uses Supabase + localStorage to track balances, bets, and performance.

5) WNBA Dashboard (Backend-Backed)
- Frontend: `pages/WnbaDashboard.tsx`.
- Client wrapper: `services/backendApi.ts`.
- Backend: `server/src`.
- Local API: `http://localhost:8787`, proxied by Vite under `/api`.
- Flow:
  - Load today's Eastern Time session and budget.
  - Load the WNBA slate from ESPN through the backend.
  - Load cached odds and cached analysis when available.
  - Refresh WNBA odds only when the user explicitly requests it.
  - Build a priced candidate board across moneyline, spread, and total.
  - Analyze cached games with cached odds and narrative/news context.
  - Store slate, odds, sessions, analysis, candidate boards, narrative signals, and usage counters in SQLite.

## Key Modules

- `pages/Scout.tsx`
  - Slate loading, ET date filtering, cadence badges, auto-scan toggle.
- `pages/Queue.tsx`
  - Sequential analysis queue + autoAnalyze pipeline.
- `services/geminiService.ts`
  - Quick scan + full analysis (Stoic Handicapper).
- `services/oddsService.ts`
  - Odds API fetch, cache, and line parsing.
- `hooks/useGameContext.tsx`
  - Global state, localStorage sync, Supabase sync.
- `pages/WnbaDashboard.tsx`
  - WNBA daily budget, slate, odds refresh, analysis display, and quota status.
- `services/backendApi.ts`
  - Frontend API wrapper for the local WNBA backend.
- `server/src/services/analysisService.ts`
  - WNBA candidate-board construction, Gemini prompt construction, narrative signal normalization, pass-code normalization, and usage estimates.
- `server/src/storage/database.ts`
  - SQLite persistence for sessions, cached provider data, analysis, and usage counters.

## State & Persistence

- LocalStorage is the primary persistence layer.
- Supabase sync is optional; heavy slate data is uploaded on a debounced loop.
- The WNBA dashboard uses backend SQLite persistence rather than localStorage for slate, odds, analysis, sessions, and quota data.
- State slices include:
  - queue
  - scanResults
  - referenceLines
  - allSportsData
  - bankroll + bets

## Data Schemas (Simplified)

### QueuedGame
- `id`, `sport`, `date`
- `homeTeam`, `awayTeam`
- `edgeSignal`, `edgeDescription`
- `autoAnalyze` (bool)
- `sharpLines`, `softLines[]`
- `analysis` (PLAYABLE/PASS + edge metrics)

### ScanResult
- `signal`: RED | YELLOW | WHITE
- `description`: short summary

### AnalysisResult
- `decision`: PLAYABLE | PASS
- `recommendation`: BET | LEAN | PASS
- `edge`, `trueProbability`, `impliedProbability`
- `softBestBook`, `softBestOdds`, `lineValuePoints`, `lineValueCents`
- `vetoReason` (if PASS)

### ReferenceLineData
- `spreadLineA`, `spreadLineB`

### WNBA AnalysisResult
- `recommendation`: BET | LEAN | PASS
- `confidence`: numeric wager confidence, 0-100
- `dataQuality`: STRONG | PARTIAL | WEAK
- `selectedMarket`, `selectedSide`, `selectedBook`, `selectedOdds`, `selectedPoint`
- `edgePercent`
- `candidateBoard`: priced moneyline, spread, and total candidates available for Gemini selection
- `narrativeSignals`: graded hard facts, supported angles, and soft narratives from previews/news/context
- `passReasonCode`: NO_EDGE | STATS_CONFLICT | LOW_CONFIDENCE | etc.

## Sync & Caching Timings

- Odds API cache
  - In-memory + localStorage, **60 min TTL**.
  - `fetchAllSportsOdds()` uses cache unless `forceRefresh`.

- Queue analysis pacing
  - Sequential queue, **ANALYSIS_QUEUE_DELAY_MS** between starts (60s).

- Supabase sync
  - Light payload debounce: ~3s after state change.
  - Heavy payload debounce: ~5s after slate change.

- WNBA backend cache
  - Slate, odds, analysis, daily session, and quota data are keyed by Eastern Time date.
  - Odds refreshes are explicit user actions.
  - Slate-wide analysis uses cached odds and does not trigger an odds refresh.

## Error Handling & Fallbacks

- Odds API
  - Missing API key → Scout returns empty slate.
  - 401/invalid key → warns and returns empty data.

- Queue analysis
  - Missing Pinnacle lines → analysis fails with error.
  - No soft book lines → analysis fails (no valid book).

- AI analysis
  - Gemini errors → PASS with veto reason.
  - JSON parse failure → safe fallback PASS.

- Supabase
  - Missing table / 404 → falls back to localStorage (sync disabled).

- WNBA backend
  - Missing backend → WNBA dashboard API calls fail while the rest of the frontend can still load.
  - Missing cached odds → odds endpoint returns a controlled error until the user refreshes odds.
  - Gemini timeout/error → PASS with an AI error code.
  - Gemini market switch → PASS with `AI_MARKET_SWITCH`.
  - Gemini selects a side/book/line that is not on the board → PASS with `AI_MARKET_SWITCH`.
  - Statistical or narrative support for the opposite side → PASS with `STATS_CONFLICT`.

## Cadence Windows

Each sport has First/Second/Lock offsets (minutes before start). Scout cards show a badge:
- Waiting → First → Second → Lock → Closed

Auto-scan (optional) checks every 30s and triggers Scan Ready when windows open.

## Deployment

- Cloud Run using Docker build (`cloudbuild.yaml`).
- `npm run deploy` reads `.env` and injects VITE_* vars at build time.

The WNBA backend is currently a local Node service. Production deployment needs an explicit backend hosting target and a persistent SQLite replacement or mounted storage decision before it should be treated as production-ready.
