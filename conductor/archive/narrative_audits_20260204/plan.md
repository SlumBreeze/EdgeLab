# Implementation Plan: Enhanced Narrative Audits

## Phase 1: Logic & Prompt Engineering [checkpoint: 7a81cd2]
- [x] Task: Update analyzeGame Prompt for Trap Detection [7a81cd2]
    - [x] Write tests for RLM and Sentiment detection logic (mocked AI responses)
    - [x] Refactor `SYSTEM_PROMPT` and `analyzeGame` prompt to prioritize "Public vs Sharps" and "Expert Sentiment"
- [x] Task: Implement RLM Helper Logic [7a81cd2]
    - [x] Write unit tests for RLM mathematical detection
    - [x] Create `utils/narrativeUtils.ts` to calculate RLM based on ticket % vs line movement
- [ ] Task: Conductor - User Manual Verification 'Logic & Prompt Engineering' (Protocol in workflow.md)

## Phase 2: AI Search Integration [checkpoint: 8555539]
- [x] Task: Enhance quickScan with Sentiment Search [8555539]
    - [x] Write tests for sentiment extraction from search results
    - [x] Update `quickScanGame` to explicitly query for beat writer reports and "sharp" sentiment
- [ ] Task: Conductor - User Manual Verification 'AI Search Integration' (Protocol in workflow.md)

## Phase 3: Trap Alert UI [checkpoint: 06d3e45]
- [x] Task: Create TrapAlert Component [06d3e45]
    - [x] Write tests for `TrapAlert` rendering and visibility
    - [x] Implement a high-visibility, data-dense alert component for the Bloomberg UI
- [x] Task: Update Game Cards for Warnings [06d3e45]
    - [x] Write integration tests for displaying warnings on `QueuedGameCard`
    - [x] Connect the new "Trap Alert" status to the UI state
- [ ] Task: Conductor - User Manual Verification 'Trap Alert UI' (Protocol in workflow.md)
