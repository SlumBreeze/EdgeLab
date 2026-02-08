# Implementation Plan: Fix Process Hangs & Complete Ground Truth Integration

This plan addresses processing stalls by implementing timeouts and model fallbacks, while completing the integration of verified rosters to eliminate hallucinations.

## Phase 1: Robust AI Execution (Anti-Hang)
Goal: Ensure AI calls never hang indefinitely by implementing timeouts and a strict fallback to Gemini 3 Flash.

- [~] Task: Update `generateWithFallback` in `services/geminiService.ts` to enforce a 30s timeout and strict Gemini 3 Pro -> Gemini 3 Flash fallback.
- [ ] Task: Add comprehensive logging to `geminiService.ts` to track model usage, timeouts, and fallback triggers.
- [ ] Task: Write unit tests to verify the timeout and fallback logic.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Robust AI Execution' (Protocol in workflow.md)

## Phase 2: Complete Ground Truth Integration
Goal: Ground all scanning and analysis in verified roster data from TheSportsDB.

- [~] Task: Update `quickScanGame` in `services/geminiService.ts` to accept `groundTruth` context and include it in the initial audit prompt.
- [~] Task: Update `pages/Queue.tsx` to fetch rosters via `sportsDbService` before triggering scans or deep analysis.
- [~] Task: Update `hooks/useBatchProcessor.ts` to fetch team rosters sequentially for each game in the loop.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Ground Truth Integration' (Protocol in workflow.md)

## Phase 3: Loop Stability & UX
Goal: Refine batch processing to prevent stalls and provide granular feedback.

- [~] Task: Refactor `useBatchProcessor.ts` loops to implement per-game error isolation and a 1-second throttling delay between API tasks.
- [ ] Task: Update the `batchProgress` status text to show detailed sub-tasks (e.g., "Fetching Roster for MIA...", "Auditing with Pro 3...").
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Loop Stability' (Protocol in workflow.md)

## Phase 4: Verification & Performance
Goal: Confirm the system is stable, hallucination-free, and handles rate limits gracefully.

- [x] Task: Conduct a "Slate Stress Test": Run a full batch scan and analysis for an entire daily slate to verify completion without hangs.
- [x] Task: Audit output for known hallucination risks (e.g., traded players) to confirm SportsDB grounding is effective.
- [x] Task: Conductor - User Manual Verification 'Phase 4: Final Verification' (Protocol in workflow.md)
