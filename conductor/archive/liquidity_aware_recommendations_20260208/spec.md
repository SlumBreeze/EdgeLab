# Track Specification: Liquidity-Aware Recommendations (Smart Rebalancing)

## Overview
This track refines the "Smart Wallet" recommendation engine to ensure that playables only recommend sportsbooks where the user has active funds. If the mathematically "best" book has a balance of $0.00, the system will automatically pivot to the next best funded book that maintains a positive edge (+EV).

## Functional Requirements

### 1. Liquidity-Filtered Selection
- **Zero Threshold:** A sportsbook is considered "unfunded" if its balance is exactly $0.00.
- **Dynamic Re-selection:** When generating a recommendation, the system must iterate through available soft books in descending order of value (odds/edge).
- **Funded Mandate:** The recommended book MUST have a balance > $0.00.

### 2. "Next Best" Logic
- **Price Priority:** If the best odds are at an unfunded book, the system will select the funded book with the highest available price.
- **Edge Validation:** A "Next Best" book is only eligible if it still provides a positive expected value (+EV).

### 3. Veto Integration
- **Insufficient Funds Veto:** If no funded sportsbook provides a positive edge for a given play, the system must trigger an automated Veto.
- **Reasoning:** The Veto reason should be explicitly stated as `INSUFFICIENT_FUNDS_FOR_EDGE`.
- **Status Change:** Games hitting this veto will be moved to "PASS" status on the daily card.

## Non-Functional Requirements
- **Performance:** Re-calculation of the best funded book should occur in real-time when bankroll balances are updated or synced.
- **Transparency:** The UI should clearly indicate when a "Next Best" book is being recommended because the primary book is unfunded.

## Acceptance Criteria
- [ ] Playables on the daily card never recommend a book with a $0.00 balance.
- [ ] If the best book is empty but the second best has funds and +EV, the second best is recommended.
- [ ] If all books with a positive edge have $0.00 balances, the game is automatically vetoed with the reason `INSUFFICIENT_FUNDS_FOR_EDGE`.
- [ ] Unit tests verify that the selection logic correctly handles zero-balance scenarios.

## Out of Scope
- Automated deposit triggers.
- Partial unit sizing for low (but non-zero) balances (this is handled by the existing "Low/Critical" badges).
