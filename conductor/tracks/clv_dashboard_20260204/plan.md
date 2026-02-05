# Implementation Plan: CLV Performance Dashboard

## Phase 1: Data Model & Mathematical Foundation
- [ ] Task: Update Bet Schema
    - [ ] Add `closing_odds_sharp` and `clv_percent` to the `bets` table in Supabase
    - [ ] Update `Bet` interface in `types.ts`
- [ ] Task: Create CLV Utility Engine
    - [ ] Write tests for CLV calculation (taken price vs no-vig close)
    - [ ] Write tests for xROI (Expected ROI) calculation
    - [ ] Implement `utils/clvUtils.ts`
- [ ] Task: Conductor - User Manual Verification 'Data Model & Math' (Protocol in workflow.md)

## Phase 2: Analytics UI Components
- [ ] Task: Create CLV Summary Cards
    - [ ] Write tests for "Beat Rate" and "Average Alpha" components
    - [ ] Implement data-dense summary badges for the Tracker header
- [ ] Task: Implement CLV Alpha Chart
    - [ ] Write tests for chart data processing
    - [ ] Create `CLVTrendChart.tsx` using Recharts to visualize edge trends over time
- [ ] Task: Conductor - User Manual Verification 'Analytics UI' (Protocol in workflow.md)

## Phase 3: Bet Settlement & Manual Entry
- [ ] Task: Update Bet Logging Workflow
    - [ ] Add "Closing Price" input field to the Bet settlement/edit form
    - [ ] Ensure `clv_percent` is automatically calculated and saved when closing price is entered
- [ ] Task: Conductor - User Manual Verification 'Bet Settlement Workflow' (Protocol in workflow.md)
