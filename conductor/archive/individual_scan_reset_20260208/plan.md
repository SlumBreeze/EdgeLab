# Implementation Plan: Individual Scan Reset

This plan outlines the steps to add an individual "x" reset button to scanned game cards on the Scout page, allowing for granular control over audit results.

## Phase 1: UI Enhancement (ScoutGameCard)
Goal: Add the individual reset "x" button to the game card UI with proper styling.

- [x] Task: Write failing unit tests for `ScoutGameCard` individual reset button visibility and interaction.
- [x] Task: Implement the "x" reset button in `components/ScoutGameCard.tsx` with top-right overlay styling.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: UI Enhancement' (Protocol in workflow.md)

## Phase 2: Logic & State Integration
Goal: Connect the reset button to the `GameContext` to clear specific scan results.

- [x] Task: Write failing unit tests for individual scan clearing logic in the `Scout` page context.
- [x] Task: Implement the `handleClearSingleScan` logic in `pages/Scout.tsx` and pass it to `ScoutGameCard`.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Logic Integration' (Protocol in workflow.md)

## Phase 3: Final Verification
Goal: Ensure the feature is robust, consistent with the Bloomberg aesthetic, and bug-free.

- [x] Task: Verify that resetting a scan correctly reverts the card to the "Handicapper Audit" state.
- [x] Task: Conduct a mobile responsiveness check to ensure the "x" button is easily tappable but not intrusive.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Final Verification' (Protocol in workflow.md)
