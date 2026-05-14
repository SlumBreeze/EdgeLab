# EdgeLab Project Review

Date: 2026-05-14

EdgeLab is a browser-based sports betting analysis app built with React 19, Vite, and TypeScript. It is not a backend application. The browser does the work: it fetches odds, stores queue state, calls Gemini, talks directly to Supabase, and renders the Scout, Analysis Queue, Daily Card, and Tracker workflows. That design is simple and fast to ship. It also means every `VITE_` key is public once deployed. Anyone pretending otherwise is doing security by vibes, which is not security.

## What The App Does

The main user workflow is Scout -> Analysis -> Playables/Card -> Tracker.

Scout loads current market odds from The Odds API, groups games by sport and Eastern Time slate date, tracks line movement from reference lines, and can run a Gemini quick scan for injury, rest, matchup, and situational context. Red or yellow quick-scan games are added to the analysis queue automatically.

The Analysis Queue fetches the latest odds for queued games, requires Pinnacle as the sharp reference book, extracts soft-book lines from configured sportsbooks, fetches roster data from TheSportsDB, and sends the math plus context to Gemini for a structured recommendation. Results become either `PLAYABLE` or `PASS`.

The Card screen displays playable and passed games, generates a Smart Card using edge thresholds, calculates suggested wagers, applies bankroll/book balance constraints, and lets the user log a playable bet into the Tracker.

The Tracker stores bets, book balances, bankroll history, CLV fields, profit analytics, and imported/exported bet data. It uses Supabase when authenticated/configured, with some local state elsewhere in the app.

## Frontend And Runtime

The stack is React 19, TypeScript, Vite, Tailwind utility classes, Recharts, Lucide React, `@google/genai`, and `@supabase/supabase-js`.

Important entry points:

- `App.tsx` mounts `AuthProvider`, `GameProvider`, and `ToastProvider`, then renders the main app shell.
- `pages/Main.tsx` switches between Scout, Analysis, and Playables while keeping views mounted.
- `hooks/useGameContext.tsx` owns the central app state for queue, daily plays, scan results, reference lines, raw slates, personas, sync status, and bankroll integration.
- `hooks/useBankroll.ts` owns Supabase-backed deposits, book balances, and bets.

The app is deployed as static files served by Nginx in Cloud Run. Build-time environment variables are baked into the frontend bundle through Docker build args.

## APIs Used

The Odds API is the primary market data source. The app calls `https://api.the-odds-api.com/v4/sports` using `VITE_ODDS_API_KEY`. It requests `h2h`, `spreads`, and `totals` markets with regions `us,us2,eu,au` and American odds. Pinnacle is treated as the sharp reference. Soft books include DraftKings, FanDuel, Bovada, Fliff, ESPN Bet/theScore, and BetOnline.

Google Gemini is used through `@google/genai` and `VITE_GEMINI_API_KEY`. Gemini powers quick scans, full game analysis, line extraction from screenshots, and bet slip OCR. Quick scans use the Google Search tool. Full analysis currently calls Gemini Pro-style models with structured JSON responses.

ESPN public scoreboard endpoints are used for schedules and scores. `services/espnService.ts` loads game schedules from `https://site.api.espn.com/apis/site/v2/sports`. `utils/scores.ts` loads scores for settlement/matching and falls back to public CORS proxies if direct ESPN calls fail.

TheSportsDB is used for roster ground truth. `services/sportsDbService.ts` uses the public test key `123` against `https://www.thesportsdb.com/api/v1/json/123`. Team and roster responses are cached in localStorage for 24 hours.

Supabase is used for auth and persistence through `@supabase/supabase-js`, configured by `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Database Usage

Supabase tables referenced by the app:

- `daily_slates`: queue, daily plays, scan results, reference lines, and heavy `all_sports_data`.
- `bets`: logged wagers, odds, status, stake, payout, sportsbook, tags, and CLV fields.
- `book_balances`: sportsbook deposits, withdrawals, user ownership, and current balance derivation.
- `user_personas`: AI/persona settings such as min edge, volume mode, max odds, risk tolerance, active sports, and decision mode.

The migrations in this repo only cover persona creation, persona `decision_mode`, book balance user IDs, and CLV columns on `bets`. There is no local migration that creates `daily_slates` or the base `bets` table. The code handles a missing `daily_slates` table by falling back to localStorage, which is pragmatic, but it also means a fresh database cannot be reproduced from this repo alone.

Supabase auth exists and supports Google OAuth. However, `App.tsx` comments that auth is bypassed and renders the app shell directly. That creates a split-brain state: Supabase-backed bankroll features expect a real `user`, while the app shell does not force login. Result: local queue/scout features can work unauthenticated, but betting and balance persistence can silently fail or show “must be logged in” behavior.

## Persistence And Caching

LocalStorage is heavily used:

- Queue: `edgelab_queue_v2`
- Daily plays: `edgelab_daily_plays`
- Scan results: `edgelab_scan_results_<date>`
- Reference lines: `edgelab_reference_lines_<date>`
- Raw slate cache: `edgelab_raw_slate`
- Odds cache: `edgelab_odds_cache_<sportKey>`
- Persona: `edgelab_persona`
- Unit size: `edgelab_unit_pct`
- Closing-line snapshots: `edgelab_clv_snap_<gameId>`
- SportsDB team/player cache: `sportsdb_cache_*`

Odds API data is cached in memory and localStorage for 60 minutes. SportsDB rosters are cached for 24 hours. Supabase slate sync is debounced: light payloads after roughly 3 seconds and heavy slate data after roughly 5 seconds.

The app has quota handling for localStorage. If storage fills, it clears odds cache entries and retries. That is better than crashing, but the user still has no explicit UI explaining what was dropped.

## AI Analysis Logic

The AI pipeline has two layers.

Quick scan returns `RED`, `YELLOW`, or `WHITE` plus injury, situational, expert sentiment, game script, and metrics text. It uses Gemini with Google Search first, then retries without Search if needed.

Full analysis calculates market candidates in TypeScript first. It compares sharp and soft lines, computes no-vig implied probability, adjusts probability for spread/total point differences, applies liquidity checks, then asks Gemini to synthesize the selected candidate with roster and situational context. The final result can still be vetoed by hard local rules such as max odds, minimum edge, insufficient funds, data missing, AI errors, or detected hallucinated player references.

The architecture is directionally correct: math is computed locally, AI provides context and explanation. The weak spot is that the system prompt says “always find a play” in places while the project guardrails say weak factual support should become a pass. Those goals fight each other. Betting apps do not need motivational ambiguity; they need rules that survive bad data.

## Notable Risks

All API keys are exposed to the browser. `VITE_GEMINI_API_KEY`, `VITE_ODDS_API_KEY`, and the Supabase anon key are public in the built app. Supabase anon access is normal if RLS is correct. Gemini and Odds API keys in the browser are harder to defend because they can be extracted and abused. A backend proxy would materially reduce that risk.

Database reproducibility is incomplete. The app references `daily_slates`, `bets`, and `book_balances`, but the repo does not contain full create-table migrations for all of them.

Auth is present but bypassed in the app shell. That is not inherently fatal, but it produces inconsistent behavior between local-only analysis features and Supabase-backed bankroll features.

There is a documentation/code mismatch. README says Card is manual by default, but `pages/Queue.tsx` calls `autoPickBestGames()` after successful analysis, which can auto-slot games into the card.

Sport support is inconsistent. `Sport` includes NFL, NCAAB, NCAAF, Soccer, WNBA, MLB, NHL, NBA, and Other. `SPORTS_CONFIG` currently exposes NBA, WNBA, NHL, and MLB only. `fetchAllSportsOdds()` batch-loads NBA, WNBA, NHL, and MLB. `SPORT_KEYS` has no WNBA key, so WNBA batch odds resolve as unsupported and return empty. That is a concrete bug, not a preference.

TheSportsDB uses the public test key. That is acceptable for prototypes, but weak for production reliability.

Some destructive UI actions are guarded with `window.confirm`, but local queue clearing and scan resets still mutate local state. The app has undo for queue clearing in the Analysis screen, which is good. Cache clearing has no restore path.

## Verification Snapshot

I reviewed the service layer, main pages, global hooks, Supabase migrations, deployment files, README, and architecture docs. I did not run a production build as part of this review because the request was architectural/reporting, not validation, and building would rewrite `dist/`.

## Recommended Next Steps

First, fix the WNBA odds mapping or remove WNBA from the active slate until it is supported. A visible sport with guaranteed empty data is not a feature; it is a bug with an icon.

Second, add full Supabase migrations for `daily_slates`, `bets`, and `book_balances`, including RLS policies. The code already assumes these tables exist. The repo should be able to create them.

Third, decide whether this app is local-first or authenticated. If authenticated, restore the login gate. If local-first, make bankroll persistence degrade cleanly without Supabase user state.

Fourth, move Gemini and Odds API calls behind a small backend proxy if this is intended for real deployment. Static frontend secrets are not secrets.

Fifth, align the AI instruction set. “Always find a play” and “pass on weak factual support” are conflicting instructions. The veto system should win.

This project is a useful candidate for a repeatable architecture audit script: scan for external endpoints, `VITE_` variables, Supabase table names, migrations, and localStorage keys, then regenerate this report skeleton automatically. If reviews like this become routine, codify that instead of rediscovering the same facts by hand.
