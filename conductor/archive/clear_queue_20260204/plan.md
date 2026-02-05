# Implementation Plan: Clear All Queue (Window-Aware)

## Phase 1: Context & Service Logic [checkpoint: 142d8d4]
- [x] Task: Update GameContext for Batch Removal [142d8d4]
    - [x] Write unit tests for a new `removeGames` action in `useGameContext`
    - [x] Implement `removeGames(gameIds: string[])` in `useGameContext.tsx`
- [x] Task: Implement Undo Logic [142d8d4]
    - [x] Write unit tests for restoring multiple games simultaneously
    - [x] Create a `restoreGames(games: QueuedGame[])` action in `useGameContext.tsx`
- [ ] Task: Conductor - User Manual Verification 'Context & Logic' (Protocol in workflow.md)

## Phase 2: UI Implementation [checkpoint: 142d8d4]
- [x] Task: Implement "Clear All" Button [142d8d4]
    - [x] Write component tests for button visibility and label (e.g., "Clear Evening")
    - [x] Add the button to `pages/Queue.tsx` header, filtered by `selectedWindow`
- [x] Task: Integrate Undo Toast [142d8d4]
    - [x] Write integration tests for the "Clear -> Toast -> Undo" flow
    - [x] Update `handleClearAll` in `Queue.tsx` to trigger a toast with an undo callback
- [ ] Task: Conductor - User Manual Verification 'UI Implementation' (Protocol in workflow.md)
