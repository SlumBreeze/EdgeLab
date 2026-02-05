# Specification: Auto-Pilot Protocol

## Overview
EdgeLab v3 currently has a fragmented automation chain: Scout scans, Queue analyzes, but the Card requires manual promotion. This track unifies these into a single "Auto-Pilot" protocol that ensures the daily battle plan is always populated with the latest data without user intervention.

**PHILOSOPHY:** Eliminate the "Promotion Gap." When any background analysis completes, the system should automatically re-run the smart-pick logic to update the Card.

## User Stories
- **As a User**, I want my Card slots to populate automatically as background analyses finish.
- **As a User**, I want Auto-Pilot to monitor all games, even if I have a specific window filtered in the UI.
- **As a User**, I want to see a clear "Auto-Pilot Active" status so I know the system is working for me.

## Functional Requirements
1. **Auto-Promotion Trigger:** Update the Queue processor in `pages/Queue.tsx` to call `autoPickBestGames()` upon successful background analysis.
2. **Global Window Scope:** Decouple the Auto-Pilot trigger in `Scout.tsx` from the `selectedWindow` filter so it monitors the entire slate.
3. **UI Rebranding:** Replace "Auto-scan" toggle with "Auto-Pilot" and add a specialized status badge when it is processing.
4. **Analysis Freshness:** Ensure Auto-Pilot prioritizes games in the "LOCK" window (30m pre-game) to ensure data is never stale.

## Technical Details
- **Trigger Logic:** Add a callback to `processAnalysis` in `Queue.tsx` to trigger card generation.
- **State Management:** Update `Scout.tsx` to use `allGames` instead of `filteredGames` for its automation interval.
