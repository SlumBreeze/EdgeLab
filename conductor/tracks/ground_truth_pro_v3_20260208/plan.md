# Implementation Plan: Ground Truth & Pro 3 Analysis

This plan outlines the integration of TheSportsDB v1 API for "Ground Truth" data and the upgrade to Gemini Pro 3 for professional-grade handicapping analysis.

## Phase 1: Data Integrity & Ground Truth Layer [checkpoint: 8113e1e]
Goal: Establish a reliable, rate-limited connection to TheSportsDB for roster and player data.

- [x] Task: Create `services/sportsDbService.ts` to handle v1 API calls (Search Teams, List Players).
- [x] Task: Implement a caching mechanism in `sportsDbService.ts` using Supabase or LocalStorage with a 24-hour TTL.
- [x] Task: Add rate-limiting logic to stay under 30 requests per minute (429 handling).
- [x] Task: Update `types/` to include `SportsDbTeam` and `SportsDbPlayer` definitions.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Data Integrity' (Protocol in workflow.md)

## Phase 2: Analysis Engine Upgrade (Gemini Pro 3)
Goal: Migrate scanning and analysis logic to Gemini Pro 3 and refine prompts for professional handicapping.

- [ ] Task: Update `services/geminiService.ts` to strictly use the Gemini Pro 3 model for `analyzeGame` and `scanSlate`.
- [ ] Task: Refactor the AI prompt in `geminiService.ts` to incorporate the "Professional Handicapper" persona.
- [ ] Task: Modify prompt to accept "Ground Truth" context (rosters/stats) as an input parameter.
- [ ] Task: Update the JSON response schema to include a `handicapper_logic` field for qualitative justification.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Pro 3 Upgrade' (Protocol in workflow.md)

## Phase 3: Veto System & Logic Synthesis
Goal: Integrate math and qualitative data into the final "Playable" decision and refine favorite evaluation.

- [ ] Task: Update `utils/analysisValidator.ts` to verify the presence of qualitative justification in AI outputs.
- [ ] Task: Refine `calculations.ts` to allow "Playable" status for favorites up to -175 when supported by handicapper logic.
- [ ] Task: Implement the "Data Quality Veto" to flag contradictions between AI reasoning and SportsDB data.
- [ ] Task: Update the UI components (`QueuedGameCard.tsx`, `ScoutGameCard.tsx`) to display the new "Handicapper Logic" insights.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: System Synthesis' (Protocol in workflow.md)

## Phase 4: Verification & Performance
Goal: Ensure the system is hallucination-free and stays within API limits.

- [ ] Task: Write integration tests to verify TheSportsDB caching and rate-limiting.
- [ ] Task: Conduct a "Hallucination Audit" by testing known outdated scenarios (e.g., specific trades).
- [ ] Task: Verify that favorites (odds < -110) are correctly flagged as Playable when justified.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Verification' (Protocol in workflow.md)
