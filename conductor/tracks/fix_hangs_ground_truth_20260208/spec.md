# Track Specification: Fix Process Hangs & Complete Ground Truth Integration

## Overview
This track resolves the issue where batch scans and analyses hang indefinitely. It implements robust timeouts and a strict model fallback strategy (Gemini 3 Pro -> Gemini 3 Flash). It also completes the integration of **TheSportsDB** ("Ground Truth") by ensuring all scanning and analysis tasks have access to verified rosters, effectively eliminating player hallucinations.

## Functional Requirements

### 1. Robust AI Execution (Anti-Hang)
- **Timeouts:** Implement a mandatory 30-second timeout for all AI generation calls.
- **Model Fallback:** If Gemini 3 Pro fails or times out, the system MUST automatically fallback to **Gemini 3 Flash**.
- **Retry Logic:** Implement a single retry for transient network errors before moving to fallback.

### 2. Full Ground Truth Integration
- **Roster-Aware Audits:** Update `quickScanGame` to fetch team rosters via `sportsDbService` and include them in the initial "Handicapper Audit" prompt.
- **Caller Synchronization:** Update the scanning/analysis loops in `pages/Queue.tsx` and `hooks/useBatchProcessor.ts` to fetch roster data before calling the AI.
- **Veto Data Persistence:** Ensure the `groundTruth` context is consistently passed to the `DATA_QUALITY_VETO` logic.

### 3. Batch Process Throttling
- **Sequential Throttling:** Update `useBatchProcessor.ts` to use a sequential "Fetch Roster -> Fetch Odds -> AI Scan" flow with a 1-second delay between tasks to stay within API limits and prevent stalls.
- **Error Isolation:** Ensure that a failure or timeout in a single game does not block the processing of the remaining slate.

## Non-Functional Requirements
- **Observability:** Improve console logging during batch processes to clearly show which model (Pro vs Flash) is being used and when timeouts occur.
- **UX Feedback:** Ensure the progress text in the Scout and Queue pages accurately reflects the current sub-task (e.g., "Fetching Roster...", "Auditing with Pro 3...").

## Acceptance Criteria
- [ ] Batch processes (Scan All / Analyze All) complete successfully without requiring a page refresh.
- [ ] Initial "Handicapper Audits" correctly identify and mention players from the verified SportsDB rosters.
- [ ] System successfully falls back to Gemini 3 Flash when Pro 3 latency is too high.
- [ ] No more hallucinations about players on the wrong teams (e.g., "AD on Lakers" when he's traded).

## Out of Scope
- Integration of other third-party sports APIs.
- Real-time websocket updates for odds (staying with polling/manual refresh).
