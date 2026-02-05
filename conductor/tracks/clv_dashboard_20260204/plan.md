# Implementation Plan: CLV Performance Dashboard

## Phase 1: Data Model & Mathematical Foundation [checkpoint: 457bab9]
- [x] Task: Update Bet Schema [457bab9]
    - [x] Add `closing_odds_sharp` and `clv_percent` to the `bets` table in Supabase
    - [x] Update `Bet` interface in `types.ts`
- [x] Task: Create CLV Utility Engine [457bab9]
    - [x] Write tests for CLV calculation (taken price vs no-vig close)
    - [x] Write tests for xROI (Expected ROI) calculation
    - [x] Implement `utils/clvUtils.ts`
- [ ] Task: Conductor - User Manual Verification 'Data Model & Math' (Protocol in workflow.md)

## Phase 2: Analytics UI Components [checkpoint: 77d1749]
- [x] Task: Create CLV Summary Cards [77d1749]
    - [x] Write tests for "Beat Rate" and "Average Alpha" components
    - [x] Implement data-dense summary badges for the Tracker header
- [x] Task: Implement CLV Alpha Chart [77d1749]
    - [x] Write tests for chart data processing
    - [x] Create `CLVTrendChart.tsx` using Recharts to visualize edge trends over time
- [ ] Task: Conductor - User Manual Verification 'Analytics UI' (Protocol in workflow.md)

## Phase 3: Bet Settlement & Manual Entry
- [ ] Task: Update Bet Logging Workflow
    - [ ] Add "Closing Price" input field to the Bet settlement/edit form
    - [ ] Ensure `clv_percent` is automatically calculated and saved when closing price is entered
- [ ] Task: Conductor - User Manual Verification 'Bet Settlement Workflow' (Protocol in workflow.md)
