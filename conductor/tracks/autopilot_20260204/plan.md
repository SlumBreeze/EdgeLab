# Implementation Plan: Auto-Pilot Protocol

## Phase 1: End-to-End Pipeline Sync
- [ ] Task: Integrate Auto-Promotion into Queue
    - [ ] Write tests for automatic `autoPick` trigger after analysis
    - [ ] Update `processAnalysis` in `Queue.tsx` to trigger smart-pick logic
- [ ] Task: Globalize Automation Scope
    - [ ] Write tests for monitoring games outside of the selected UI window
    - [ ] Refactor the automation effect in `Scout.tsx` to use `upcomingGames` instead of `filteredGames`
- [ ] Task: Conductor - User Manual Verification 'End-to-End Pipeline' (Protocol in workflow.md)

## Phase 2: UI Rebranding & Feedback
- [ ] Task: Rebrand Auto-scan to Auto-Pilot
    - [ ] Update labels and icons in `Scout.tsx` and `App.tsx`
    - [ ] Implement a more descriptive "Auto-Pilot" status indicator (e.g., "Auto-Pilot: Monitoring 12 Games")
- [ ] Task: Refine Batch Progress for Auto-Pilot
    - [ ] Ensure background tasks provide subtle, non-intrusive progress updates
- [ ] Task: Conductor - User Manual Verification 'UI Rebranding' (Protocol in workflow.md)

## Phase 3: Freshness & Rate Limits
- [ ] Task: Implement LOCK Window Prioritization
    - [ ] Ensure Auto-Pilot runs scans exactly 30 minutes before tip-off for maximum accuracy
    - [ ] Optimize the interval frequency to conserve API rate limits
- [ ] Task: Conductor - User Manual Verification 'Freshness & Optimization' (Protocol in workflow.md)
