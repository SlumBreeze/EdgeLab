# PR: Sport-Level Batch Processing on Scout

## Summary
Adds a sport-scoped batch action to Scout so users can process only one sport within the currently selected time window. Also fixes real-time card feedback during batch runs by writing `scanResults` immediately per game and tracking sport-specific batch progress for per-sport loading UI.

## What changed
- Added sport-specific batch progress metadata and selector:
  - `types.ts`
  - `hooks/useGameContext.tsx`
- Implemented `getSportBatchProgress(sport)` in context for per-sport spinner state.
- Added new `ScoutSportHeader` component with:
  - Sport icon + label + cadence
  - `Process [Sport]` button
  - Processing state (`Processing...`) and hidden/disabled behavior when no processable games
  - `components/ScoutSportHeader.tsx`
- Updated Scout page to:
  - Use `ScoutSportHeader`
  - Add `getProcessableGamesForSport(sport)` filtering by:
    - sport
    - selected time window
    - upcoming games only
    - not already in queue
    - not already scanned
  - Add `handleProcessSport(sport)` that calls existing `processBatch` with filtered sport games
  - `pages/Scout.tsx`
- Updated batch processor behavior:
  - Persists `scanResults` immediately after each quick scan (`setScanResult`)
  - Applies workflow order per game: quick scan -> detailed analysis (for RED/YELLOW) -> add to queue
  - Carries optional `sport` through batch progress payload for targeted UI loading
  - `hooks/useBatchProcessor.ts`
- Updated batch processor unit test to validate immediate scan-result propagation and new context shape:
  - `test/batchProcessor.test.ts`
- Checked off completed implementation tasks in track plan:
  - `conductor/tracks/sport_batch_processing_20260206/plan.md`

## Tests
- `npx vitest run test/batchProcessor.test.ts test/gameContext.test.tsx` -> Pass
  - Result: `Test Files 2 passed (2)`, `Tests 3 passed (3)`, duration `5.60s`
  - Note: existing stderr warnings from `gameContext` test mocks (Supabase chain/act warnings), but command exits passing.
- `npm run build` -> Pass
  - Result: Vite production build succeeded in `9.46s`
  - Output bundles include `dist/assets/index-DaD4VBmL.js`, `dist/assets/ui-DVqmClu1.js`, `dist/assets/utils-Ct368H-A.js`
  - Note: existing Vite chunking warning for mixed static/dynamic import of `services/supabaseClient.ts`.
- `npm test` -> Fails due to pre-existing unrelated failures in `test/personaService.test.ts` (invalid UUID expectations in existing tests)

## Known issues
- Full suite currently has unrelated failing tests in `test/personaService.test.ts`.
- Existing test warnings remain in `test/gameContext.test.tsx` (act() and Supabase mock-chain warnings), pre-existing to this PR.
- Vite build emits an existing chunking warning for mixed static/dynamic import of `services/supabaseClient.ts`.

## Manual verification steps (checklist only; not executed)
- [ ] Run `npm run dev`
- [ ] Open Scout page with slates loaded
- [ ] Select a non-ALL window (e.g., `EARLY`)
- [ ] In a sport section (e.g., NBA), confirm `Process NBA` appears next to sport header only when processable games exist
- [ ] Click `Process NBA` and confirm prompt shows correct count + selected window
- [ ] Confirm only NBA games in selected window are processed
- [ ] Confirm each game card updates in real time as scan results arrive
- [ ] Confirm scanned-rejected games show scan signal/description
- [ ] Confirm qualifying games move to queue and card shows queue state
- [ ] Confirm sport header button shows `Processing...` during the run
- [ ] Confirm button is hidden/disabled when all games for that sport/window are already scanned or queued
- [ ] Confirm global batch overlay progress still works for sport batch

## Rollback plan
1. Revert this PR commit.
2. Validate Scout renders with original sport headers and without `Process [Sport]`.
3. Re-run:
   - `npm run build`
   - `npx vitest run test/batchProcessor.test.ts test/gameContext.test.tsx`
4. Smoke-check Scout batch behavior for existing `Process Entire Slate` flow.
