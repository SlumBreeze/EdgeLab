# Implementation Plan: Batch Window Processing

## Phase 1: Batch Action Logic & Context Updates [checkpoint: 680c11d]
- [x] Task: Update GameContext for Batch Completion [680c11d]
    - [x] Write tests for batch status tracking
    - [x] Add `isBatchProcessing` and `batchProgress` state to `AnalysisState`
- [x] Task: Create Batch Processor Hook or Utility [680c11d]
    - [x] Write tests for the sequential scan-then-analyze logic
    - [x] Implement `useBatchProcessor` to coordinate services
- [ ] Task: Conductor - User Manual Verification 'Batch Action Logic' (Protocol in workflow.md)

## Phase 2: Scout UI Integration [checkpoint: bbf1dc5]
- [x] Task: Implement "Process Entire Window" Button [bbf1dc5]
    - [x] Write tests for button rendering and window filtering
    - [x] Add the primary action button to the Scout header when a window is selected
- [x] Task: Add Batch Progress Overlay [bbf1dc5]
    - [x] Write tests for progress status display
    - [x] Implement a minimalist, Bloomberg-style progress bar/indicator
- [ ] Task: Conductor - User Manual Verification 'Scout UI Integration' (Protocol in workflow.md)

## Phase 3: Auto-Card Promotion [checkpoint: b0bdd9d]
- [x] Task: Integrate Auto-Promotion [b0bdd9d]
    - [x] Write tests for triggering `autoPickBestGames` after batch completion
    - [x] Implement the callback to run smart-pick once the last game in a batch is analyzed
- [ ] Task: Conductor - User Manual Verification 'Auto-Card Promotion' (Protocol in workflow.md)
