# Implementation Plan: Liquidity-Aware Recommendations

This plan implements the "Strict Zero" liquidity filter for sportsbook recommendations, ensuring users are never directed to an empty book.

## Phase 1: Core Logic Refinement
Goal: Update the recommendation utilities to filter out books with $0.00 balances.

- [x] Task: Write failing unit tests for `getRecommendedBook` to handle $0.00 balance scenarios.
- [x] Task: Update `getRecommendedBook` in `utils/calculations.ts` to strictly exclude books with 0 balance.
- [x] Task: Update `analyzeGame` in `services/geminiService.ts` to iterate through soft books until a funded one with +EV is found.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Core Logic Refinement' (Protocol in workflow.md)

## Phase 2: Veto & State Integration
Goal: Integrate the new `INSUFFICIENT_FUNDS_FOR_EDGE` veto and ensure the UI reflects liquidity-driven passes.

- [x] Task: Write failing unit tests for the `INSUFFICIENT_FUNDS_FOR_EDGE` veto trigger.
- [x] Task: Update `refreshAnalysisMathOnly` in `services/geminiService.ts` to trigger a veto if no funded books remain +EV.
- [x] Task: Update `types.ts` or constants if necessary to support the new veto reason string.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Veto & State Integration' (Protocol in workflow.md)

## Phase 3: End-to-End Verification
Goal: Verify that the system correctly pivots or vetoes based on real-time balance changes.

- [x] Task: Conduct a "Liquidity Audit": Manually set a top book to $0.00 and verify the Card pivots to the next best funded book.
- [x] Task: Verify that if ALL books are set to $0.00, the game correctly moves to "PASS" with the reason `INSUFFICIENT_FUNDS_FOR_EDGE`.
- [x] Task: Conductor - User Manual Verification 'Phase 3: End-to-End Verification' (Protocol in workflow.md)
