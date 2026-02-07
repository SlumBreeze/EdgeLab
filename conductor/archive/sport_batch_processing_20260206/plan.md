# Implementation Plan - Sport-Level Batch Processing

## Phase 1: Context & State Management
- [x] Task: Update `useGameContext` to expose Batch Processing status for individual sports.
    - [x] Update `GameContext` type to include sport-specific batch status (optional, if we want per-sport spinners) or ensure the existing `isBatchProcessing` is sufficient.
    - [x] Create a utility or hook selector to filter `batchProgress` by sport if needed.
- [x] Task: Conductor - User Manual Verification 'Context & State Management' (Protocol in workflow.md)

## Phase 2: UI Implementation (Scout Page)
- [x] Task: Create `ScoutSportHeader` Component
    - [x] Extract the existing sport header (Icon + Label + Cadence) into a reusable component to avoid cluttering `Scout.tsx`.
    - [x] Add the "Process [Sport]" button to this component.
    - [x] Implement the styling (Ink Accent color, loading state).
- [x] Task: Implement `handleProcessSport` Logic in `Scout.tsx`
    - [x] Create a function `handleProcessSport(sport: Sport)` that filters upcoming games for that sport AND the current time window.
    - [x] Ensure it excludes games already in Queue or with Scan Results.
    - [x] Connect this function to the new button in `ScoutSportHeader`.
- [x] Task: Conductor - User Manual Verification 'UI Implementation (Scout Page)' (Protocol in workflow.md)

## Phase 3: Feedback Loop & Real-time Updates
- [x] Task: Verify/Fix Real-time Context Propagation
    - [x] Debug/Investigate why batch results aren't updating cards immediately (as reported by user).
    - [x] Ensure `useBatchProcessor` calls `setScanResult` and `addToQueue` in a way that triggers immediate re-renders for `ScoutGameCard`.
    - [x] Verify that `ScoutGameCard` properly reacts to context changes for `scanResult` and `queue`.
- [x] Task: Conductor - User Manual Verification 'Feedback Loop & Real-time Updates' (Protocol in workflow.md)

## Phase 4: Integration & Polish
- [x] Task: End-to-End Test of Sport Batch
    - [x] Manual test: Select "NBA", Select "Early" Window. Click "Process NBA".
    - [x] Verify only Early NBA games are processed.
    - [x] Verify cards update in real-time.
    - [x] Verify Summary Toast at the end.
- [x] Task: Conductor - User Manual Verification 'Integration & Polish' (Protocol in workflow.md)