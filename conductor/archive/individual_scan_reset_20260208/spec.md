# Track Specification: Individual Scan Reset

## Overview
This track provides a mechanism for users to individually reset scan results on the Scout page. A small "x" button will be added to the top-right corner of `ScoutGameCard` components that have an active scan result, allowing users to clear specific audits without affecting the rest of the slate.

## Functional Requirements

### 1. Individual Reset UI
- **Reset Button:** Add a small "x" button overlay in the top-right corner of the `ScoutGameCard`.
- **Visibility:** The button should ONLY be visible if the game has an active `scanResult` (Handicapper Audit).
- **Styling:** Adhere to the Bloomberg/Terminal aesthetic—minimalist, low-profile, but functional.

### 2. Reset Logic
- **Action:** Clicking the "x" should clear the `scanResult` for that specific game from the `GameContext`.
- **State Sync:** Clearing the scan on the Scout page should not necessarily remove the game from the Queue if it was already added, but it should clear the associated scan data.

## Non-Functional Requirements
- **UX Responsiveness:** The UI should update immediately upon clicking the reset button.
- **Consistency:** Ensure the "Reset" terminology matches the "Audit" labels updated in the previous track.

## Acceptance Criteria
- [ ] An "x" button appears on `ScoutGameCard` only after a "Handicapper Audit" is performed.
- [ ] Clicking the "x" removes the scan signal, description, and context from the card.
- [ ] The card reverts to its "unscanned" state (showing the "⚡ Handicapper Audit" button).
- [ ] Resetting one card does not affect other scanned cards on the Scout page.

## Out of Scope
- Global reset functionality (already exists).
- Resetting analysis on the Queue page (already exists).
