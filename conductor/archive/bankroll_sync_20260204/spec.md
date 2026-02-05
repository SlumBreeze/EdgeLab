# Specification: Multi-Book Balance Sync & Auto-Rebalancing

## Overview
EdgeLab v3 needs to help users manage capital across multiple sportsbooks efficiently. This track implements "Smart Wallet" logic that analyzes current book balances and suggests the optimal platform for placing a bet to maintain balanced liquidity.

**PHILOSOPHY:** Prioritize **Liquidity and Balance Distribution**. Suggestions appear **During Bet Placement** to guide the user toward the book with the most available funds.

## User Stories
- **As a User**, I want to see which of my funded sportsbooks is the best choice for a specific bet based on my current balances.
- **As a User**, I want to avoid depleting one book while others remain overfunded.
- **As a User**, I want to manually manage my deposits and withdrawals without complex "virtual transfer" logic.

## Functional Requirements
1. **Balance-Aware Suggestions:** Logic to rank funded books by current balance when a bet is being prepared.
2. **Liquidity Thresholds:** Highlight books that are "Low on Funds" during the selection process.
3. **Bet Form Integration:** Display the "Recommended Book" directly in the manual bet entry and card promotion flows.
4. **Manual Sync:** Ensure balance updates (deposits/withdrawals) are reflected immediately in the rebalancing logic.

## Technical Details
- **Logic:** Create `getRecommendedBook` utility in `utils/calculations.ts`.
- **UI:** Update `components/tracker/BetForm.tsx` and `pages/TrackerNewBet.tsx` to display suggestions.
- **State:** Leverage existing `bookBalances` from `useGameContext`.
