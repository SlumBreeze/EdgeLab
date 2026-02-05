# Implementation Plan: Batch Window Processing

## Phase 1: Batch Action Logic & Context Updates
- [ ] Task: Update GameContext for Batch Completion
    - [ ] Write tests for batch status tracking
    - [ ] Add `isBatchProcessing` and `batchProgress` state to `AnalysisState`
- [ ] Task: Create Batch Processor Hook or Utility
    - [ ] Write tests for the sequential scan-then-analyze logic
    - [ ] Implement `useBatchProcessor` to coordinate services
- [ ] Task: Conductor - User Manual Verification 'Batch Action Logic' (Protocol in workflow.md)

## Phase 2: Scout UI Integration
- [ ] Task: Implement "Process Entire Window" Button
    - [ ] Write tests for button rendering and window filtering
    - [ ] Add the primary action button to the Scout header when a window is selected
- [ ] Task: Add Batch Progress Overlay
    - [ ] Write tests for progress status display
    - [ ] Implement a minimalist, Bloomberg-style progress bar/indicator
- [ ] Task: Conductor - User Manual Verification 'Scout UI Integration' (Protocol in workflow.md)

## Phase 3: Auto-Card Promotion
- [ ] Task: Integrate Auto-Promotion
    - [ ] Write tests for triggering `autoPickBestGames` after batch completion
    - [ ] Implement the callback to run smart-pick once the last game in a batch is analyzed
- [ ] Task: Conductor - User Manual Verification 'Auto-Card Promotion' (Protocol in workflow.md)
