# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build (outputs to dist/)
npm run preview      # Preview production build locally
```

No test runner or linter is configured. TypeScript checking happens during build.

## Project Overview

EdgeLab is a sports betting analysis platform (React 19 + Vite + TypeScript) that:
1. Compares "Sharp" lines (Pinnacle) against "Soft" bookmaker odds (DraftKings, FanDuel, etc.)
2. Uses Gemini AI to validate plays with injury reports and narrative analysis
3. Implements a "veto system" to reject plays lacking hard factual support

## Architecture

### State Management
All app state flows through `useGameContext` (hooks/useGameContext.tsx):
- Queue of games being analyzed
- Bankroll data (integrates with `useBankroll` hook)
- Scan results and reference lines
- Cloud sync status with Supabase

State persists to localStorage immediately, then debounces (3s) to Supabase if configured.

### Tab Navigation (App.tsx)
Four main views, all kept mounted to preserve analysis queue state:
- **Scout** (`pages/Scout.tsx`) - Daily game feed, quick injury scans
- **Queue** (`pages/Queue.tsx`) - Deep analysis with EV calculations
- **Card** (`pages/Card.tsx`) - Active bet tracking, game selection
- **Tracker** (`pages/Tracker.tsx`, `TrackerNewBet.tsx`) - Bet history and P&L analytics

### Service Layer (services/)
- `geminiService.ts` - All Gemini AI interactions (quick scans, deep analysis, screenshot OCR)
- `oddsService.ts` - The Odds API integration for live odds
- `espnService.ts` - ESPN API for schedules/scores
- `supabaseClient.ts` - Database client with `isSupabaseConfigured` check

### Key Types (types.ts)
- `Game` / `QueuedGame` - Sporting events with odds and analysis state
- `AnalysisResult` / `HighHitAnalysis` - AI analysis output with veto fields
- `BookLines` - Bookmaker odds structure (spread, total, moneyline)
- `Bet` / `BankrollState` - Bet tracking types

### Edge Calculation
Located in `utils/edgeUtils.ts` - functions like `isPremiumEdge()` and `isStandardEdge()` determine play quality based on line value points, juice cents, confidence, and sport-specific thresholds.

Math formulas in `utils/calculations.ts` and `pages/Queue.tsx`:
- No-vig probability from American odds
- EV = (Probability × Payout) - (1 - Probability)

## Environment Variables

All prefixed with `VITE_` for Vite exposure:
```
VITE_GEMINI_API_KEY      # Google Gemini API
VITE_ODDS_API_KEY        # The Odds API
VITE_SUPABASE_URL        # Supabase project URL (optional)
VITE_SUPABASE_ANON_KEY   # Supabase anon key (optional)
```

## AI Prompts

The main AI system prompt is `HIGH_HIT_SYSTEM_PROMPT` in `constants.ts`. It instructs Gemini to:
- Prioritize HARD FACTS (injuries, rest, weather) over SOFT NARRATIVES (motivation, revenge games)
- Use Google Search to verify current information
- Rate `dataQuality` as STRONG/PARTIAL/WEAK
- Recommend PASS when data quality is weak

Screenshot OCR uses `EXTRACTION_PROMPT` in `constants.ts`.

## Veto System

Defined in `constants.ts` as `VETO_RULES`:
- EFFICIENCY_FLOOR - Bottom 10 offense veto
- TRENCH_COLLAPSE - NFL missing OL starters
- CENTER_OUT - NBA missing center
- SPREAD_CAP - Sport-specific spread limits
- GOALIE_UNKNOWN - NHL unconfirmed goalie
- QB_UNCERTAINTY - CFB quarterback issues

## Sport Configuration

`SPORTS_CONFIG` in `constants.ts` maps sport codes to ESPN slugs and icons.
Different sports have different edge thresholds (NBA/CFB higher variance, NFL/NHL tighter).

## Deployment

Google Cloud Run with Docker:
```bash
gcloud builds submit --config cloudbuild.yaml \
  --project gen-lang-client-0947461139 \
  --substitutions="_GEMINI_API_KEY=...,_ODDS_API_KEY=...,_SUPABASE_URL=...,_SUPABASE_KEY=..."

gcloud run deploy edgelab-v2 \
  --image gcr.io/gen-lang-client-0947461139/edgelab2 \
  --project gen-lang-client-0947461139 \
  --region us-central1 \
  --allow-unauthenticated
```

## Code Patterns

- TypeScript path alias: `@/*` maps to project root
- Tailwind CSS with custom `ink-*` color tokens (dark theme)
- Components use Tailwind utility classes, no CSS modules
- React hooks only (no Redux) - useState, useEffect, useContext, useMemo
- API keys exposed in browser (frontend-only app with no backend)
