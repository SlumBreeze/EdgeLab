# PR Description: Sport-Level Batch Processing

## Summary
Introduced granular batch processing to the `Scout` page, allowing users to "Process [Sport]" (e.g., Process NBA) instead of the entire slate. This feature includes UI updates, logic for sport-specific filtering, and fixes for real-time card updates during batch operations.

## Changes
- **New Component:** `ScoutSportHeader` - Modularized sport header with integrated "Process" action.
- **Scout Page:**
    - Added `handleProcessSport` logic to filter batch processing by sport and active time window.
    - Integrated `ScoutSportHeader` into the main list.
- **Context/Hooks:**
    - Improved `useBatchProcessor` and `useGameContext` to ensure `scanResults` and `queue` updates propagate immediately to `ScoutGameCard`, fixing a "stale UI" issue during batches.

## Testing
- **Manual Verification:**
    - Verified "Process NBA" only processes NBA games.
    - Verified respect for "Early/Afternoon/Evening" time window filters.
    - confirmed cards update visually (Spinner -> Result) in real-time.
- **Regression:**
    - Confirmed "Process Entire Slate" still works as expected.
    - Confirmed "Quick Scan" on individual cards still works.

## Screenshots
*(Optional: Add screenshots of the new header button and processing state here)*