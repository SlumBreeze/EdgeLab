# Specification: Batch Window Processing

## Overview
EdgeLab needs a streamlined workflow for professional handicappers who cannot monitor the app throughout the day. This feature allows users to process an entire time window (e.g., "Evening") in a single automated sequence: Scanning -> Analyzing -> Card Generation.

## User Stories
- **As a User**, I want to click one button to process all evening games so I don't have to wait for individual scans.
- **As a User**, I want the system to automatically analyze games after they are scanned and added to the queue.
- **As a User**, I want the best plays from the batch to be automatically promoted to my "Card" so I can just look at the final battle plan.

## Functional Requirements
1. **"Process Window" Command:** A single action that targets all unscanned games in the active `TimeWindow`.
2. **Synchronized Batching:** Scans must complete before analysis starts for each game to ensure the AI has the latest situational data.
3. **Automated Promotion:** Once analysis is complete for the batch, the `autoPickBestGames` logic should run automatically.
4. **Progress Visualization:** Real-time feedback on how many games in the batch are Scanned, Analyzed, and Promoted.

## Technical Details
- **Trigger:** New `handleProcessBatch` function in `Scout.tsx`.
- **State Management:** Leverage `useGameContext` to track batch progress and trigger the `autoPick` logic upon completion.
- **Concurrency Control:** Sequential processing to respect API rate limits (Gemini and Odds API).
