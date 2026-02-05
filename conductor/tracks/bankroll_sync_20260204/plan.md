# Implementation Plan: Multi-Book Balance Sync & Auto-Rebalancing

## Phase 1: Logic & Context Updates [checkpoint: 8e778ed]
- [x] Task: Implement Recommendation Logic [8e778ed]
    - [x] Write unit tests for `getRecommendedBook` utility
    - [x] Create logic to find the best-funded book among those offering the best (or near-best) price
- [x] Task: Update Analysis Result Mapping [8e778ed]
    - [x] Add `recommendedBook` field to `AnalysisResult` type
    - [x] Update `analyzeGame` to pre-calculate the recommendation if balances are available
- [ ] Task: Conductor - User Manual Verification 'Logic & Context Updates' (Protocol in workflow.md)

## Phase 2: Bet Entry UI Integration
- [ ] Task: Enhance BetForm with Smart Suggestions
    - [ ] Write tests for `BetForm` displaying the recommended book badge
    - [ ] Update UI to highlight the suggested book in the dropdown or selection list
- [ ] Task: Update TrackerNewBet Workflow
    - [ ] Ensure the "Recommended" book is auto-selected or prioritized in the manual entry screen
- [ ] Task: Conductor - User Manual Verification 'Bet Entry UI Integration' (Protocol in workflow.md)

## Phase 3: Bankroll Status Refinement
- [ ] Task: Add "Low Funds" Alerts
    - [ ] Write tests for balance threshold warnings
    - [ ] Implement visual indicators in the Bankroll Modal for books requiring re-funding
- [ ] Task: Conductor - User Manual Verification 'Bankroll Status Refinement' (Protocol in workflow.md)
