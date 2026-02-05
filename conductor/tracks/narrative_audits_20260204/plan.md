# Implementation Plan: Enhanced Narrative Audits

## Phase 1: Logic & Prompt Engineering
- [ ] Task: Update analyzeGame Prompt for Trap Detection
    - [ ] Write tests for RLM and Sentiment detection logic (mocked AI responses)
    - [ ] Refactor `SYSTEM_PROMPT` and `analyzeGame` prompt to prioritize "Public vs Sharps" and "Expert Sentiment"
- [ ] Task: Implement RLM Helper Logic
    - [ ] Write unit tests for RLM mathematical detection
    - [ ] Create `utils/narrativeUtils.ts` to calculate RLM based on ticket % vs line movement
- [ ] Task: Conductor - User Manual Verification 'Logic & Prompt Engineering' (Protocol in workflow.md)

## Phase 2: AI Search Integration
- [ ] Task: Enhance quickScan with Sentiment Search
    - [ ] Write tests for sentiment extraction from search results
    - [ ] Update `quickScanGame` to explicitly query for beat writer reports and "sharp" sentiment
- [ ] Task: Conductor - User Manual Verification 'AI Search Integration' (Protocol in workflow.md)

## Phase 3: Trap Alert UI
- [ ] Task: Create TrapAlert Component
    - [ ] Write tests for `TrapAlert` rendering and visibility
    - [ ] Implement a high-visibility, data-dense alert component for the Bloomberg UI
- [ ] Task: Update Game Cards for Warnings
    - [ ] Write integration tests for displaying warnings on `QueuedGameCard`
    - [ ] Connect the new "Trap Alert" status to the UI state
- [ ] Task: Conductor - User Manual Verification 'Trap Alert UI' (Protocol in workflow.md)
