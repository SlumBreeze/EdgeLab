# Architecture

EdgeLab is a single-page React app that runs an end-to-end betting workflow: Scout → Queue → Card → Tracker. This document summarizes the runtime flow, key modules, data lifecycle, and failure behavior.

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

## State & Persistence

- LocalStorage is the primary persistence layer.
- Supabase sync is optional; heavy slate data is uploaded on a debounced loop.
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

## Sync & Caching Timings

- Odds API cache
  - In-memory + localStorage, **60 min TTL**.
  - `fetchAllSportsOdds()` uses cache unless `forceRefresh`.

- Queue analysis pacing
  - Sequential queue, **ANALYSIS_QUEUE_DELAY_MS** between starts (60s).

- Supabase sync
  - Light payload debounce: ~3s after state change.
  - Heavy payload debounce: ~5s after slate change.

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

## Cadence Windows

Each sport has First/Second/Lock offsets (minutes before start). Scout cards show a badge:
- Waiting → First → Second → Lock → Closed

Auto-scan (optional) checks every 30s and triggers Scan Ready when windows open.

## Deployment

- Cloud Run using Docker build (`cloudbuild.yaml`).
- `npm run deploy` reads `.env` and injects VITE_* vars at build time.