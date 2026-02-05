# Specification: Clear All Queue (Window-Aware)

## Overview
EdgeLab v3 needs a way to quickly clear the analysis queue. This feature adds a "Clear All" action to the Queue page that allows users to remove all games in the currently selected time window with a single click, supported by an "Undo" mechanism.

## User Stories
- **As a User**, I want to quickly empty my evening queue if the slate changes significantly.
- **As a User**, I want to clear only the games I'm currently looking at (e.g., just the Afternoon window) without affecting other scheduled games.
- **As a User**, I want to be able to undo a "Clear All" action if I click it by mistake.

## Functional Requirements
1. **Window-Aware Action:** The "Clear All" button must only target games currently visible in the active `selectedWindow` (Early, Afternoon, Evening). If "All" is selected, it clears everything.
2. **Undo-able Logic:** When clicked, games are removed immediately from the queue, and a Toast notification appears with an "Undo" button to restore them.
3. **UI Integration:** Place a "🗑️ Clear [Window]" button in the Queue header, immediately to the right of the window filter buttons.
4. **Bloomberg Aesthetic:** Minimalist styling, using `bg-ink-base` or `bg-ink-panel` with subtle hover states.

## Acceptance Criteria
- Clicking "Clear Evening" only removes games where `getTimeWindow(game.date)` is "EVENING".
- Restoring via the "Undo" toast puts all removed games back exactly as they were (including any existing analysis).
- The button is disabled or hidden if the current filtered view is already empty.
